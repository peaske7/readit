import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { getTextContent, slugify } from "./utils";

describe("slugify", () => {
  it("converts text to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("hello world")).toBe("hello-world");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("handles multiple spaces", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("handles leading/trailing whitespace", () => {
    expect(slugify("  hello world  ")).toBe("hello-world");
  });

  it("preserves underscores", () => {
    expect(slugify("hello_world")).toBe("hello_world");
  });

  it("handles hyphens", () => {
    expect(slugify("hello-world")).toBe("hello-world");
  });

  it("collapses multiple hyphens", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });
});

describe("getTextContent", () => {
  it("returns string children directly", () => {
    expect(getTextContent("Hello")).toBe("Hello");
  });

  it("converts number children to string", () => {
    expect(getTextContent(123)).toBe("123");
  });

  it("joins array of strings", () => {
    expect(getTextContent(["Hello", " ", "World"])).toBe("Hello World");
  });

  it("extracts text from React element", () => {
    const element = createElement("strong", null, "Bold");
    expect(getTextContent(element)).toBe("Bold");
  });

  it("extracts text from nested React elements", () => {
    const element = createElement(
      "span",
      null,
      "Hello ",
      createElement("strong", null, "World"),
    );
    expect(getTextContent(element)).toBe("Hello World");
  });

  it("handles mixed array of strings and elements", () => {
    const children = ["Hello ", createElement("strong", null, "World"), "!"];
    expect(getTextContent(children)).toBe("Hello World!");
  });

  it("handles deeply nested elements", () => {
    const element = createElement(
      "div",
      null,
      createElement("span", null, createElement("strong", null, "Deep")),
    );
    expect(getTextContent(element)).toBe("Deep");
  });

  it("returns empty string for null", () => {
    expect(getTextContent(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(getTextContent(undefined)).toBe("");
  });

  it("returns empty string for boolean", () => {
    expect(getTextContent(true)).toBe("");
    expect(getTextContent(false)).toBe("");
  });

  it("handles markdown-style inline formatting", () => {
    // Simulates what react-markdown produces for "## Hello **World**"
    const children = ["Hello ", createElement("strong", null, "World")];
    expect(getTextContent(children)).toBe("Hello World");
  });

  it("handles complex markdown with multiple formatting", () => {
    // Simulates "## Hello **World** and _italic_"
    const children = [
      "Hello ",
      createElement("strong", null, "World"),
      " and ",
      createElement("em", null, "italic"),
    ];
    expect(getTextContent(children)).toBe("Hello World and italic");
  });
});
