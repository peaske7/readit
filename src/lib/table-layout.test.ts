import { beforeEach, describe, expect, it } from "vitest";
import { TableModes } from "../schema";
import {
  clampViewportWidth,
  clampWidth,
  loadTablePreference,
  resolveTableMode,
  resolveTableWidth,
  resolveWideGeometry,
  SNAP_THRESHOLD_PX,
  saveTablePreference,
  shouldStartWide,
  tablePreferenceKey,
} from "./table-layout";

// Desktop layout: TOC gutter at 24, lane 240..860, margin notes from 960.
const desktop = {
  laneLeft: 240,
  laneRight: 860,
  leftLimit: 24,
  rightLimit: 944,
};

describe("resolveWideGeometry", () => {
  it("bleeds left to the gutter and caps at the margin column", () => {
    const geometry = resolveWideGeometry(desktop);
    expect(geometry.offset).toBe(-216);
    expect(geometry.minWidth).toBe(836);
    expect(geometry.maxWidth).toBe(920);
  });

  it("never lets min exceed max on a narrow window", () => {
    const geometry = resolveWideGeometry({
      laneLeft: 24,
      laneRight: 400,
      leftLimit: 24,
      rightLimit: 376,
    });
    expect(geometry.minWidth).toBe(352);
    expect(geometry.maxWidth).toBe(352);
  });
});

describe("clampViewportWidth", () => {
  const geometry = resolveWideGeometry(desktop);

  it("clamps into range", () => {
    expect(clampViewportWidth(10, geometry)).toBe(geometry.minWidth);
    expect(clampViewportWidth(5000, geometry)).toBe(geometry.maxWidth);
  });

  it("clampWidth only clamps, so small keyboard steps stick", () => {
    expect(clampWidth(geometry.maxWidth - 16, geometry)).toBe(
      geometry.maxWidth - 16,
    );
    expect(clampWidth(5000, geometry)).toBe(geometry.maxWidth);
    expect(clampWidth(10, geometry)).toBe(geometry.minWidth);
  });

  it("snaps near the edges and stays free in between", () => {
    expect(
      clampViewportWidth(geometry.maxWidth - SNAP_THRESHOLD_PX, geometry),
    ).toBe(geometry.maxWidth);
    expect(clampViewportWidth(geometry.minWidth + 10, geometry)).toBe(
      geometry.minWidth,
    );
    expect(clampViewportWidth(880, geometry)).toBe(880);
  });
});

describe("shouldStartWide", () => {
  it("goes wide from five columns", () => {
    expect(
      shouldStartWide({ columnCount: 5, laneWidth: 2000, fontSize: 16 }),
    ).toBe(true);
    expect(
      shouldStartWide({ columnCount: 4, laneWidth: 2000, fontSize: 16 }),
    ).toBe(false);
  });

  it("goes wide when cells would drop below eight characters", () => {
    expect(
      shouldStartWide({ columnCount: 4, laneWidth: 400, fontSize: 16 }),
    ).toBe(true);
    expect(
      shouldStartWide({ columnCount: 0, laneWidth: 400, fontSize: 16 }),
    ).toBe(false);
  });
});

describe("resolveTableWidth", () => {
  it("fills the viewport or gives each column its unit, whichever is wider", () => {
    expect(
      resolveTableWidth({ columnCount: 2, viewportWidth: 900, fontSize: 16 }),
    ).toBe(900);
    expect(
      resolveTableWidth({ columnCount: 6, viewportWidth: 900, fontSize: 16 }),
    ).toBe(1152);
  });
});

describe("resolveTableMode", () => {
  it("prefers the per-table override, then the setting, then the heuristic", () => {
    expect(
      resolveTableMode({
        override: TableModes.FIT,
        defaultMode: TableModes.WIDE,
        heuristicWide: true,
      }),
    ).toBe(TableModes.FIT);
    expect(
      resolveTableMode({
        override: undefined,
        defaultMode: TableModes.WIDE,
        heuristicWide: false,
      }),
    ).toBe(TableModes.WIDE);
    expect(
      resolveTableMode({
        override: undefined,
        defaultMode: TableModes.AUTO,
        heuristicWide: true,
      }),
    ).toBe(TableModes.WIDE);
    expect(
      resolveTableMode({
        override: undefined,
        defaultMode: TableModes.AUTO,
        heuristicWide: false,
      }),
    ).toBe(TableModes.FIT);
  });
});

describe("table preferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keys by file and table index", () => {
    expect(tablePreferenceKey("/docs/a.md", 2)).toBe(
      "readit:table:/docs/a.md#2",
    );
  });

  it("round-trips mode and width", () => {
    const key = tablePreferenceKey("/docs/a.md", 0);
    saveTablePreference(key, { mode: TableModes.WIDE, width: 700 });
    expect(loadTablePreference(key)).toEqual({
      mode: TableModes.WIDE,
      width: 700,
    });
    saveTablePreference(key, { mode: TableModes.FIT });
    expect(loadTablePreference(key)).toEqual({ mode: TableModes.FIT });
  });

  it("ignores garbage", () => {
    const key = tablePreferenceKey("/docs/a.md", 0);
    localStorage.setItem(key, "{not json");
    expect(loadTablePreference(key)).toBeUndefined();
    localStorage.setItem(key, JSON.stringify({ mode: "huge", width: "x" }));
    expect(loadTablePreference(key)).toBeUndefined();
  });
});
