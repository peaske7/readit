import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  formatBinding,
  isReservedBinding,
  type KeybindingOverride,
  matchesBinding,
  resolveShortcuts,
  ShortcutActions,
  type ShortcutBinding,
} from "./shortcut-registry";

describe("DEFAULT_SHORTCUTS", () => {
  it("defines 7 shortcuts", () => {
    expect(DEFAULT_SHORTCUTS).toHaveLength(7);
  });

  it("has unique IDs", () => {
    const ids = DEFAULT_SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all enabled by default", () => {
    for (const shortcut of DEFAULT_SHORTCUTS) {
      expect(shortcut.enabled).toBe(true);
    }
  });
});

describe("matchesBinding", () => {
  it("matches exact key + modifiers", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", { key: "c", altKey: true });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("rejects wrong key", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", { key: "v", altKey: true });
    expect(matchesBinding(event, binding)).toBe(false);
  });

  it("rejects extra modifiers", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    const event = new KeyboardEvent("keydown", {
      key: "c",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(false);
  });

  it("matches binding with shift", () => {
    const binding: ShortcutBinding = { key: "c", alt: true, shift: true };
    const event = new KeyboardEvent("keydown", {
      key: "c",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches meta key", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    const event = new KeyboardEvent("keydown", { key: "c", metaKey: true });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches shifted letter key (browser reports uppercase)", () => {
    const binding: ShortcutBinding = { key: "c", alt: true, shift: true };
    const event = new KeyboardEvent("keydown", {
      key: "C",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches meta+shift letter key (browser reports uppercase)", () => {
    const binding: ShortcutBinding = { key: "c", meta: true, shift: true };
    const event = new KeyboardEvent("keydown", {
      key: "C",
      metaKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, binding)).toBe(true);
  });

  it("matches key-only binding (no modifiers)", () => {
    const binding: ShortcutBinding = { key: "Escape" };
    const event = new KeyboardEvent("keydown", { key: "Escape" });
    expect(matchesBinding(event, binding)).toBe(true);
  });
});

describe("formatBinding", () => {
  it("formats Alt+C", () => {
    const binding: ShortcutBinding = { key: "c", alt: true };
    expect(formatBinding(binding, true)).toBe("Alt+C");
  });

  it("formats meta key as ⌘ on Mac", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    expect(formatBinding(binding, true)).toBe("⌘+C");
  });

  it("formats meta key as Ctrl on non-Mac", () => {
    const binding: ShortcutBinding = { key: "c", meta: true };
    expect(formatBinding(binding, false)).toBe("Ctrl+C");
  });

  it("formats shift modifier", () => {
    const binding: ShortcutBinding = { key: "c", meta: true, shift: true };
    expect(formatBinding(binding, true)).toBe("⌘+Shift+C");
  });

  it("formats arrow keys with symbols", () => {
    const binding: ShortcutBinding = { key: "ArrowUp", alt: true };
    expect(formatBinding(binding, true)).toBe("Alt+↑");
  });

  it("formats Escape", () => {
    const binding: ShortcutBinding = { key: "Escape" };
    expect(formatBinding(binding, true)).toBe("Esc");
  });
});

describe("resolveShortcuts", () => {
  it("returns defaults when no overrides", () => {
    const resolved = resolveShortcuts([]);
    expect(resolved).toEqual(DEFAULT_SHORTCUTS);
  });

  it("applies enabled override", () => {
    const overrides: KeybindingOverride[] = [
      { id: ShortcutActions.COPY_ALL, enabled: false },
    ];
    const resolved = resolveShortcuts(overrides);
    const copyAll = resolved.find((s) => s.id === ShortcutActions.COPY_ALL);
    expect(copyAll?.enabled).toBe(false);
  });

  it("applies binding override", () => {
    const overrides: KeybindingOverride[] = [
      {
        id: ShortcutActions.COPY_ALL,
        enabled: true,
        binding: { key: "a", meta: true },
      },
    ];
    const resolved = resolveShortcuts(overrides);
    const copyAll = resolved.find((s) => s.id === ShortcutActions.COPY_ALL);
    expect(copyAll?.binding).toEqual({ key: "a", meta: true });
  });

  it("ignores unknown override IDs", () => {
    const overrides: KeybindingOverride[] = [
      { id: "unknown_action", enabled: false },
    ];
    const resolved = resolveShortcuts(overrides);
    expect(resolved).toEqual(DEFAULT_SHORTCUTS);
  });
});

describe("isReservedBinding", () => {
  it("detects ⌘+W as reserved", () => {
    expect(isReservedBinding({ key: "w", meta: true })).toBe(true);
  });

  it("allows Alt+C", () => {
    expect(isReservedBinding({ key: "c", alt: true })).toBe(false);
  });
});
