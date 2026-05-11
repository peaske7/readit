<script lang="ts">
import { Code2, Image as ImageIcon, Maximize2 } from "lucide-svelte";
import { mount, unmount } from "svelte";
import { localeState, t } from "../stores/locale.svelte";
import MermaidModal from "./MermaidModal.svelte";

interface Props {
  /** The article element that contains all rendered mermaid containers. */
  root: HTMLElement | undefined;
  /** Bumped whenever document content is re-rendered (rescan triggers). */
  contentVersion: number;
  /** Called after an inline toggle so margin notes / positions can recache. */
  notifyContentChanged?: () => void;
}

let { root, contentVersion, notifyContentChanged }: Props = $props();

let modalOpen = $state(false);
let modalSvg = $state("");
let modalSource = $state("");

const ENHANCED_FLAG = "readitMermaidEnhanced";

function decodeSource(container: HTMLElement): string {
  const encoded = container.dataset.mermaidSource ?? "";
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

function openModal(container: HTMLElement) {
  const svgEl = container.querySelector("svg");
  modalSvg = svgEl ? svgEl.outerHTML : "";
  modalSource = decodeSource(container);
  modalOpen = true;
}

function ensureSourceView(container: HTMLElement, source: string): HTMLElement {
  let pre = container.querySelector<HTMLElement>(".mermaid-source-view");
  if (pre) return pre;
  pre = document.createElement("pre");
  pre.className = "mermaid-source-view";
  const codeEl = document.createElement("code");
  codeEl.className = "language-mermaid";
  codeEl.textContent = source;
  pre.appendChild(codeEl);
  pre.style.display = "none";
  // Insert before the toolbar so the toolbar stays the last child.
  const toolbar = container.querySelector(".mermaid-toolbar");
  container.insertBefore(pre, toolbar);
  return pre;
}

function toggleInline(container: HTMLElement, source: string): void {
  const svg = container.querySelector<SVGElement>("svg");
  const pre = ensureSourceView(container, source);
  const showingCode = container.dataset.mermaidView === "code";
  const next = showingCode ? "graph" : "code";

  if (svg) svg.style.display = next === "code" ? "none" : "";
  pre.style.display = next === "code" ? "block" : "none";
  container.dataset.mermaidView = next;

  const toolbar = container.querySelector<HTMLElement>(".mermaid-toolbar");
  const toggleBtn = toolbar?.querySelector<HTMLButtonElement>(
    '[data-action="toggle"]',
  );
  toggleBtn?.setAttribute(
    "aria-label",
    next === "code" ? t("mermaid.showDiagram") : t("mermaid.showSource"),
  );
  toggleBtn?.setAttribute("aria-pressed", next === "code" ? "true" : "false");

  const handle = (
    toolbar as (HTMLElement & { _readitHandle?: ToolbarHandle }) | null
  )?._readitHandle;
  handle?.remountToggleIcon(next);

  notifyContentChanged?.();
}

interface ToolbarHandle {
  cleanup: () => void;
  remountToggleIcon: (view: "graph" | "code") => void;
}

function mountToggleIcon(target: HTMLElement, view: "graph" | "code") {
  // Show "code" icon when graph is visible (click to see code), and vice versa.
  const Icon = view === "graph" ? Code2 : ImageIcon;
  return mount(Icon, { target, props: { size: 14 } });
}

function buildToolbar(container: HTMLElement): HTMLElement {
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.setAttribute("contenteditable", "false");

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.dataset.action = "toggle";
  toggleBtn.setAttribute("aria-label", t("mermaid.showSource"));
  toggleBtn.setAttribute("aria-pressed", "false");

  const expandBtn = document.createElement("button");
  expandBtn.type = "button";
  expandBtn.dataset.action = "expand";
  expandBtn.setAttribute("aria-label", t("mermaid.expand"));

  toolbar.appendChild(toggleBtn);
  toolbar.appendChild(expandBtn);

  let toggleIcon = mountToggleIcon(toggleBtn, "graph");
  const expandIcon = mount(Maximize2, {
    target: expandBtn,
    props: { size: 14 },
  });

  toggleBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleInline(container, decodeSource(container));
  });

  expandBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openModal(container);
  });

  const handle: ToolbarHandle = {
    cleanup: () => {
      void unmount(toggleIcon);
      void unmount(expandIcon);
    },
    remountToggleIcon: (view) => {
      void unmount(toggleIcon);
      toggleIcon = mountToggleIcon(toggleBtn, view);
    },
  };
  (toolbar as HTMLElement & { _readitHandle?: ToolbarHandle })._readitHandle =
    handle;

  return toolbar;
}

function enhance(target: HTMLElement) {
  const containers = target.querySelectorAll<HTMLElement>(
    ".mermaid-container[data-mermaid-source]",
  );

  for (const container of containers) {
    if (container.dataset[ENHANCED_FLAG] === "true") continue;
    container.dataset[ENHANCED_FLAG] = "true";

    // Ensure the container can host the absolutely-positioned toolbar.
    container.style.position = "relative";

    const toolbar = buildToolbar(container);
    container.appendChild(toolbar);
  }
}

function cleanup(target: HTMLElement) {
  const toolbars = target.querySelectorAll<HTMLElement>(".mermaid-toolbar");
  for (const tb of toolbars) {
    (
      tb as HTMLElement & { _readitHandle?: ToolbarHandle }
    )._readitHandle?.cleanup();
    tb.remove();
  }
  const enhanced = target.querySelectorAll<HTMLElement>(
    ".mermaid-container[data-readit-mermaid-enhanced]",
  );
  for (const c of enhanced) {
    delete c.dataset[ENHANCED_FLAG];
  }
}

$effect(() => {
  if (!root) return;
  // Re-scan whenever contentVersion changes; declared so Svelte tracks it.
  void contentVersion;
  enhance(root);
  return () => {
    if (root) cleanup(root);
  };
});

// Refresh aria-labels on existing imperative toolbars when locale changes.
$effect(() => {
  if (!root) return;
  void localeState.locale;
  const toolbars = root.querySelectorAll<HTMLElement>(".mermaid-toolbar");
  for (const tb of toolbars) {
    const container = tb.closest<HTMLElement>(".mermaid-container");
    const showingCode = container?.dataset.mermaidView === "code";
    tb.querySelector<HTMLButtonElement>('[data-action="toggle"]')?.setAttribute(
      "aria-label",
      showingCode ? t("mermaid.showDiagram") : t("mermaid.showSource"),
    );
    tb.querySelector<HTMLButtonElement>('[data-action="expand"]')?.setAttribute(
      "aria-label",
      t("mermaid.expand"),
    );
  }
});
</script>

<MermaidModal
  bind:open={modalOpen}
  svg={modalSvg}
  source={modalSource}
  onclose={() => {
    modalOpen = false;
  }}
/>
