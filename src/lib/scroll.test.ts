import { describe, expect, it } from "vitest";
import { calculateScrollTarget, getElementTopInDocument } from "./scroll";

describe("calculateScrollTarget", () => {
  it("positions element at 25% from top by default", () => {
    // Element at 1000px, viewport 800px
    // Target offset = 800 * 0.25 = 200px
    // Scroll target = 1000 - 200 = 800px
    expect(calculateScrollTarget(1000, 800)).toBe(800);
  });

  it("respects custom offset percent", () => {
    // Element at 1000px, viewport 800px, offset 50%
    // Target offset = 800 * 0.5 = 400px
    // Scroll target = 1000 - 400 = 600px
    expect(calculateScrollTarget(1000, 800, 0.5)).toBe(600);
  });

  it("returns 0 when element is near top", () => {
    // Element at 100px, viewport 800px
    // Target offset = 200px
    // Scroll target = max(0, 100 - 200) = 0
    expect(calculateScrollTarget(100, 800)).toBe(0);
  });

  it("returns 0 for element at position 0", () => {
    expect(calculateScrollTarget(0, 800)).toBe(0);
  });

  it("handles small viewport", () => {
    // Element at 500px, viewport 400px
    // Target offset = 100px
    // Scroll target = 500 - 100 = 400px
    expect(calculateScrollTarget(500, 400)).toBe(400);
  });

  it("handles zero offset percent", () => {
    // Element at 1000px, no offset
    // Scroll target = 1000px (element at very top of viewport)
    expect(calculateScrollTarget(1000, 800, 0)).toBe(1000);
  });
});

describe("getElementTopInDocument", () => {
  it("calculates position for element in main document (not scrolled)", () => {
    // Element at 500px from viewport top, no scroll
    const elementRect = { top: 500 };
    expect(getElementTopInDocument(elementRect, 0)).toBe(500);
  });

  it("calculates position for element in main document (scrolled)", () => {
    // Element at 200px from viewport top, scrolled 300px
    // Absolute position = 300 + 200 = 500px
    const elementRect = { top: 200 };
    expect(getElementTopInDocument(elementRect, 300)).toBe(500);
  });

  it("calculates position for element inside iframe", () => {
    // Iframe at 100px from viewport top
    // Element at 150px from iframe top (inside iframe)
    // Scrolled 50px
    // Absolute position = 50 + 100 + 150 = 300px
    const elementRect = { top: 150 };
    expect(getElementTopInDocument(elementRect, 50, 100)).toBe(300);
  });

  it("handles element at viewport top with scroll", () => {
    // Element at 0px from viewport top, scrolled 1000px
    const elementRect = { top: 0 };
    expect(getElementTopInDocument(elementRect, 1000)).toBe(1000);
  });

  it("handles negative element position (above viewport)", () => {
    // Element scrolled past viewport top
    const elementRect = { top: -100 };
    expect(getElementTopInDocument(elementRect, 500)).toBe(400);
  });

  it("handles iframe with element above iframe viewport", () => {
    // Iframe at 200px, element at -50px within iframe (scrolled past)
    // scrollY = 100
    // Absolute position = 100 + 200 + (-50) = 250px
    const elementRect = { top: -50 };
    expect(getElementTopInDocument(elementRect, 100, 200)).toBe(250);
  });
});
