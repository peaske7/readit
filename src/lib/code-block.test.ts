import { describe, expect, it } from "vitest";
import { getCodeBlockText } from "../lib/code-block";

describe("getCodeBlockText", () => {
  it("reads text from nested code element", () => {
    const pre = document.createElement("pre");
    const code = document.createElement("code");
    code.textContent = "const x = 1;\n";
    pre.appendChild(code);

    expect(getCodeBlockText(pre)).toBe("const x = 1;\n");
  });

  it("falls back to pre text content", () => {
    const pre = document.createElement("pre");
    pre.textContent = "plain text";

    expect(getCodeBlockText(pre)).toBe("plain text");
  });
});
