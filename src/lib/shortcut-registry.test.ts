import { describe, expect, it } from "vitest";
import { eventToBinding, matchesBinding } from "./shortcut-registry";

interface KeyEventInit {
  key: string;
  code?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}

function keyEvent(init: KeyEventInit): KeyboardEvent {
  return {
    key: init.key,
    code: init.code ?? "",
    altKey: init.altKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    metaKey: init.metaKey ?? false,
    shiftKey: init.shiftKey ?? false,
  } as KeyboardEvent;
}

describe("matchesBinding", () => {
  it("matches when event.key and binding agree", () => {
    const event = keyEvent({ key: "c", code: "KeyC", altKey: true });
    expect(matchesBinding(event, { key: "c", alt: true })).toBe(true);
  });

  it("matches on macOS when Option+letter produces a diacritic (event.key='ç')", () => {
    // On macOS, Option+C yields event.key='ç', event.code='KeyC'.
    // The matcher must fall back to event.code so the shortcut still fires.
    const event = keyEvent({ key: "ç", code: "KeyC", altKey: true });
    expect(matchesBinding(event, { key: "c", alt: true })).toBe(true);
  });

  it("matches macOS Option+Shift+C (event.key='Ç')", () => {
    const event = keyEvent({
      key: "Ç",
      code: "KeyC",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, { key: "c", alt: true, shift: true })).toBe(
      true,
    );
  });

  it("rejects when modifiers differ", () => {
    const event = keyEvent({ key: "c", code: "KeyC", altKey: true });
    expect(matchesBinding(event, { key: "c", meta: true })).toBe(false);
  });

  it("rejects when extra modifier is held", () => {
    const event = keyEvent({
      key: "c",
      code: "KeyC",
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, { key: "c", alt: true })).toBe(false);
  });

  it("matches non-letter keys via event.key (e.g. ArrowDown)", () => {
    const event = keyEvent({
      key: "ArrowDown",
      code: "ArrowDown",
      altKey: true,
    });
    expect(matchesBinding(event, { key: "ArrowDown", alt: true })).toBe(true);
  });

  it("matches Escape with no modifiers", () => {
    const event = keyEvent({ key: "Escape", code: "Escape" });
    expect(matchesBinding(event, { key: "Escape" })).toBe(true);
  });
});

describe("eventToBinding", () => {
  it("normalizes macOS Option diacritics back to the letter", () => {
    const event = keyEvent({ key: "ç", code: "KeyC", altKey: true });
    expect(eventToBinding(event)).toEqual({ key: "c", alt: true });
  });

  it("preserves non-letter keys", () => {
    const event = keyEvent({ key: "ArrowUp", code: "ArrowUp", altKey: true });
    expect(eventToBinding(event)).toEqual({ key: "ArrowUp", alt: true });
  });

  it("includes all held modifiers", () => {
    const event = keyEvent({
      key: "c",
      code: "KeyC",
      metaKey: true,
      shiftKey: true,
    });
    expect(eventToBinding(event)).toEqual({
      key: "c",
      meta: true,
      shift: true,
    });
  });
});
