import { describe, expect, it } from "vitest";
import { renderTemplate } from "./template";

function page(themeMode?: string): string {
  return renderTemplate({
    title: "doc.md",
    cssPath: "",
    jsPath: "/assets/index.js",
    documentHtml: "<p>hi</p>",
    inlineData: {},
    isDev: false,
    fontFamily: "serif",
    ...(themeMode !== undefined && { themeMode }),
  });
}

describe("renderTemplate theme pre-paint", () => {
  it("prefers the stored theme over localStorage", () => {
    expect(page("light")).toContain(
      'var t = "light" || localStorage.getItem("readit:theme")',
    );
  });

  it("falls back to localStorage when nothing is stored", () => {
    expect(page()).toContain(
      'var t = null || localStorage.getItem("readit:theme")',
    );
  });
});
