import { type TableMode, TableModes } from "../schema";

/** Drag positions within this distance of a snap point land on it. */
export const SNAP_THRESHOLD_PX = 24;
/** Room reserved per column before a wide table starts scrolling. */
export const COLUMN_UNIT_EM = 12;
/** Cells narrower than this many characters are judged unreadable. */
const MIN_READABLE_CHARS = 8;
const AUTO_WIDE_COLUMN_COUNT = 5;
const STORAGE_PREFIX = "readit:table:";

export type ResolvedTableMode = typeof TableModes.FIT | typeof TableModes.WIDE;

export interface TableBounds {
  /** Left edge of the reading lane (the prose column). */
  laneLeft: number;
  /** Right edge of the reading lane. */
  laneRight: number;
  /** Furthest left a wide table may bleed (TOC gutter edge). */
  leftLimit: number;
  /** Furthest right a wide table may bleed (margin notes edge). */
  rightLimit: number;
}

export interface WideGeometry {
  /** Offset from the lane's left edge to the viewport's left edge (≤ 0). */
  offset: number;
  minWidth: number;
  maxWidth: number;
}

export function resolveWideGeometry(bounds: TableBounds): WideGeometry {
  const maxWidth = Math.max(0, bounds.rightLimit - bounds.leftLimit);
  const laneSpan = Math.max(0, bounds.laneRight - bounds.leftLimit);
  return {
    offset: bounds.leftLimit - bounds.laneLeft,
    minWidth: Math.min(laneSpan, maxWidth),
    maxWidth,
  };
}

export function clampViewportWidth(
  requested: number,
  geometry: WideGeometry,
): number {
  const clamped = Math.min(
    Math.max(requested, geometry.minWidth),
    geometry.maxWidth,
  );
  for (const snap of [geometry.minWidth, geometry.maxWidth]) {
    if (Math.abs(clamped - snap) <= SNAP_THRESHOLD_PX) return snap;
  }
  return clamped;
}

export function shouldStartWide({
  columnCount,
  laneWidth,
  fontSize,
}: {
  columnCount: number;
  laneWidth: number;
  fontSize: number;
}): boolean {
  if (columnCount === 0) return false;
  if (columnCount >= AUTO_WIDE_COLUMN_COUNT) return true;
  return laneWidth / columnCount < fontSize * MIN_READABLE_CHARS;
}

export function resolveTableWidth({
  columnCount,
  viewportWidth,
  fontSize,
}: {
  columnCount: number;
  viewportWidth: number;
  fontSize: number;
}): number {
  return Math.max(viewportWidth, columnCount * COLUMN_UNIT_EM * fontSize);
}

export function resolveTableMode({
  override,
  defaultMode,
  heuristicWide,
}: {
  override: ResolvedTableMode | undefined;
  defaultMode: TableMode;
  heuristicWide: boolean;
}): ResolvedTableMode {
  if (override) return override;
  if (defaultMode === TableModes.AUTO) {
    return heuristicWide ? TableModes.WIDE : TableModes.FIT;
  }
  return defaultMode;
}

export interface TablePreference {
  mode: ResolvedTableMode;
  /** Viewport width in px. Absent means "as wide as allowed". */
  width?: number;
}

export function tablePreferenceKey(filePath: string, index: number): string {
  return `${STORAGE_PREFIX}${filePath}#${index}`;
}

export function loadTablePreference(key: string): TablePreference | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<TablePreference>;
    if (parsed.mode !== TableModes.FIT && parsed.mode !== TableModes.WIDE) {
      return undefined;
    }
    if (typeof parsed.width === "number" && Number.isFinite(parsed.width)) {
      return { mode: parsed.mode, width: parsed.width };
    }
    return { mode: parsed.mode };
  } catch {
    return undefined;
  }
}

export function saveTablePreference(
  key: string,
  preference: TablePreference,
): void {
  try {
    localStorage.setItem(key, JSON.stringify(preference));
  } catch {}
}
