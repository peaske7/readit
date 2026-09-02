<script lang="ts">
import { CopyCheck, FoldHorizontal, UnfoldHorizontal } from "lucide-svelte";
import { mount, onDestroy, unmount } from "svelte";
import { UI_CHROME_ATTR } from "../lib/highlight/dom";
import {
  clampViewportWidth,
  loadTablePreference,
  type ResolvedTableMode,
  resolveTableMode,
  resolveTableWidth,
  resolveWideGeometry,
  saveTablePreference,
  shouldStartWide,
  type TableBounds,
  tablePreferenceKey,
} from "../lib/table-layout";
import { TableModes } from "../schema";
import { localeState, t } from "../stores/locale.svelte";
import { settings } from "../stores/settings.svelte";

interface Props {
  root: HTMLElement | undefined;
  contentVersion: number;
  isActive: boolean;
  filePath: string;
  notifyLayoutChanged: () => void;
}

let { root, contentVersion, isActive, filePath, notifyLayoutChanged }: Props =
  $props();

/** Matches px-6 / pl-6 on the reading frame columns. */
const FRAME_INSET_PX = 24;
/** Matches gap-4 between the reading frame columns. */
const COLUMN_GAP_PX = 16;
/** Below this drag range the handle is pointless, so it is hidden. */
const MIN_RESIZABLE_RANGE_PX = 48;

interface TableEntry {
  key: string;
  table: HTMLTableElement;
  container: HTMLDivElement;
  viewport: HTMLDivElement;
  toggleButton: HTMLButtonElement;
  applyAllButton: HTMLButtonElement;
  handle: HTMLDivElement;
  columnCount: number;
  mode: ResolvedTableMode;
  hasOverride: boolean;
  width: number | undefined;
  icons: ReturnType<typeof mount>[];
}

let entries: TableEntry[] = [];

function measureBounds(article: HTMLElement): TableBounds | undefined {
  const lane = article.getBoundingClientRect();
  if (lane.width === 0) return undefined;

  const frame = article.closest<HTMLElement>("[data-reading-frame]");
  const frameRect = frame?.getBoundingClientRect();
  const marginColumn = frame?.querySelector<HTMLElement>(
    "[data-margin-column]",
  );
  const marginRect = marginColumn?.offsetParent
    ? marginColumn.getBoundingClientRect()
    : undefined;

  return {
    laneLeft: lane.left,
    laneRight: lane.right,
    leftLimit: (frameRect?.left ?? 0) + FRAME_INSET_PX,
    rightLimit: marginRect
      ? marginRect.left - COLUMN_GAP_PX
      : (frameRect?.right ?? window.innerWidth) - FRAME_INSET_PX,
  };
}

function columnCountOf(table: HTMLTableElement): number {
  let count = 0;
  for (const row of table.rows) count = Math.max(count, row.cells.length);
  return count;
}

function fontSizeOf(el: HTMLElement): number {
  return Number.parseFloat(getComputedStyle(el).fontSize) || 16;
}

function updateScrollHints(entry: TableEntry) {
  const { viewport, container } = entry;
  const canScrollRight =
    viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1;
  container.classList.toggle("has-overflow-left", viewport.scrollLeft > 1);
  container.classList.toggle("has-overflow-right", canScrollRight);
}

function syncLabels(entry: TableEntry) {
  const toggleLabel =
    entry.mode === TableModes.WIDE ? t("table.fit") : t("table.wide");
  entry.toggleButton.setAttribute("aria-label", toggleLabel);
  entry.toggleButton.title = toggleLabel;
  entry.applyAllButton.setAttribute("aria-label", t("table.applyAll"));
  entry.applyAllButton.title = t("table.applyAll");
  entry.handle.title = t("table.resize");
}

function resolveMode(entry: TableEntry, bounds: TableBounds | undefined) {
  if (entry.hasOverride) return;
  const heuristicWide = bounds
    ? shouldStartWide({
        columnCount: entry.columnCount,
        laneWidth: bounds.laneRight - bounds.laneLeft,
        fontSize: fontSizeOf(entry.table),
      })
    : false;
  entry.mode = resolveTableMode({
    override: undefined,
    defaultMode: settings.tableMode,
    heuristicWide,
  });
}

function applyLayout(entry: TableEntry, bounds: TableBounds | undefined) {
  const { container, table } = entry;
  container.dataset.mode = entry.mode;
  syncLabels(entry);

  if (entry.mode === TableModes.FIT || !bounds) {
    container.style.removeProperty("--table-offset");
    container.style.removeProperty("--table-viewport-width");
    table.style.width = "";
    container.classList.remove("is-resizable");
    updateScrollHints(entry);
    return;
  }

  const geometry = resolveWideGeometry(bounds);
  const width = clampViewportWidth(entry.width ?? geometry.maxWidth, geometry);
  container.style.setProperty("--table-offset", `${geometry.offset}px`);
  container.style.setProperty("--table-viewport-width", `${width}px`);
  table.style.width = `${resolveTableWidth({
    columnCount: entry.columnCount,
    viewportWidth: width,
    fontSize: fontSizeOf(table),
  })}px`;
  container.classList.toggle(
    "is-resizable",
    geometry.maxWidth - geometry.minWidth >= MIN_RESIZABLE_RANGE_PX,
  );
  updateScrollHints(entry);
}

function relayoutAll() {
  if (!root) return;
  const bounds = measureBounds(root);
  if (!bounds) return;
  for (const entry of entries) {
    resolveMode(entry, bounds);
    applyLayout(entry, bounds);
  }
}

function persist(entry: TableEntry) {
  entry.hasOverride = true;
  saveTablePreference(
    entry.key,
    entry.width === undefined
      ? { mode: entry.mode }
      : { mode: entry.mode, width: entry.width },
  );
}

function setMode(entry: TableEntry, mode: ResolvedTableMode) {
  entry.mode = mode;
  persist(entry);
  applyLayout(entry, root ? measureBounds(root) : undefined);
  notifyLayoutChanged();
}

function applyModeToAll(source: TableEntry) {
  const bounds = root ? measureBounds(root) : undefined;
  for (const entry of entries) {
    entry.mode = source.mode;
    entry.width = undefined;
    persist(entry);
    applyLayout(entry, bounds);
  }
  notifyLayoutChanged();
}

function startResize(entry: TableEntry, event: PointerEvent) {
  if (!root || event.button !== 0) return;
  const bounds = measureBounds(root);
  if (!bounds) return;

  event.preventDefault();
  event.stopPropagation();

  const geometry = resolveWideGeometry(bounds);
  const { handle, container } = entry;
  handle.setPointerCapture(event.pointerId);
  container.classList.add("is-resizing");

  const onMove = (e: PointerEvent) => {
    const width = clampViewportWidth(e.clientX - bounds.leftLimit, geometry);
    // Max snap is stored as "no preference" so it keeps tracking the window.
    entry.width = width === geometry.maxWidth ? undefined : width;
    applyLayout(entry, bounds);
  };
  const onUp = (e: PointerEvent) => {
    onMove(e);
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onUp);
    container.classList.remove("is-resizing");
    persist(entry);
    notifyLayoutChanged();
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onUp);
}

function buildButton(action: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.action = action;
  return button;
}

// Everything added here must be free of text nodes: comment anchors are
// text offsets over the article, and a stray label would shift them.
function wrap(table: HTMLTableElement, index: number): TableEntry {
  const container = document.createElement("div");
  container.className = "table-container";

  const viewport = document.createElement("div");
  viewport.className = "table-viewport";

  table.parentNode?.insertBefore(container, table);
  viewport.appendChild(table);
  container.appendChild(viewport);

  const toolbar = document.createElement("div");
  toolbar.className = "code-block-toolbar table-toolbar";
  toolbar.setAttribute("contenteditable", "false");
  toolbar.setAttribute(UI_CHROME_ATTR, "");

  const toggleButton = buildButton("toggle-wide");
  const applyAllButton = buildButton("apply-all");
  toolbar.appendChild(toggleButton);
  toolbar.appendChild(applyAllButton);
  container.appendChild(toolbar);

  const handle = document.createElement("div");
  handle.className = "table-resize-handle";
  handle.setAttribute("contenteditable", "false");
  handle.setAttribute(UI_CHROME_ATTR, "");
  container.appendChild(handle);

  const icons = [
    mount(UnfoldHorizontal, {
      target: toggleButton,
      props: { size: 14, class: "table-icon-wide" },
    }),
    mount(FoldHorizontal, {
      target: toggleButton,
      props: { size: 14, class: "table-icon-fit" },
    }),
    mount(CopyCheck, { target: applyAllButton, props: { size: 14 } }),
  ];

  const key = tablePreferenceKey(filePath, index);
  const preference = loadTablePreference(key);

  const entry: TableEntry = {
    key,
    table,
    container,
    viewport,
    toggleButton,
    applyAllButton,
    handle,
    columnCount: columnCountOf(table),
    mode: preference?.mode ?? TableModes.FIT,
    hasOverride: preference !== undefined,
    width: preference?.width,
    icons,
  };

  toggleButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMode(
      entry,
      entry.mode === TableModes.WIDE ? TableModes.FIT : TableModes.WIDE,
    );
  });
  applyAllButton.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    applyModeToAll(entry);
  });
  handle.addEventListener("pointerdown", (e) => startResize(entry, e));
  handle.addEventListener("dblclick", (e) => {
    e.preventDefault();
    e.stopPropagation();
    entry.width = undefined;
    persist(entry);
    applyLayout(entry, root ? measureBounds(root) : undefined);
    notifyLayoutChanged();
  });
  viewport.addEventListener("scroll", () => updateScrollHints(entry), {
    passive: true,
  });

  return entry;
}

function disposeEntry(entry: TableEntry) {
  for (const icon of entry.icons) void unmount(icon);
}

function enhance(article: HTMLElement) {
  const kept: TableEntry[] = [];
  for (const entry of entries) {
    if (entry.container.isConnected) kept.push(entry);
    else disposeEntry(entry);
  }
  entries = kept;

  const bounds = measureBounds(article);
  const tables = article.querySelectorAll<HTMLTableElement>("table");
  tables.forEach((table, index) => {
    if (table.closest(".table-container")) return;
    const entry = wrap(table, index);
    entries.push(entry);
    resolveMode(entry, bounds);
    applyLayout(entry, bounds);
  });
}

$effect(() => {
  if (!root) return;
  void contentVersion;
  enhance(root);
});

$effect(() => {
  void settings.tableMode;
  void isActive;
  relayoutAll();
});

$effect(() => {
  void localeState.locale;
  for (const entry of entries) syncLabels(entry);
});

// The lane, TOC, and margin column all change size independently of the
// window (breakpoints, headings loading), so observe the frame itself.
$effect(() => {
  if (!root) return;
  const frame = root.closest<HTMLElement>("[data-reading-frame]");
  const observer = new ResizeObserver(() => relayoutAll());
  observer.observe(root);
  if (frame) observer.observe(frame);
  return () => observer.disconnect();
});

onDestroy(() => {
  for (const entry of entries) disposeEntry(entry);
  entries = [];
});
</script>
