import { describe, expect, it } from "vitest";
import {
  collectTextNodesWithContent,
  getDOMTextContent,
  getTextOffset,
  UI_CHROME_ATTR,
} from "./dom";

function article(html: string): HTMLElement {
  const el = document.createElement("article");
  el.innerHTML = html;
  return el;
}

describe("text walker", () => {
  it("joins blocks with a single newline", () => {
    const root = article(
      "<p>alpha</p><table><tr><td>beta</td></tr></table><p>gamma</p>",
    );
    expect(getDOMTextContent(root)).toBe("alpha\nbeta\ngamma");
  });

  it("ignores UI chrome even when it holds empty text nodes", () => {
    const root = article(
      "<p>alpha</p><div><div><table><tr><td>beta</td></tr></table></div>" +
        `<div ${UI_CHROME_ATTR}><button></button></div></div><p>gamma</p>`,
    );
    const chrome = root.querySelector("button");
    chrome?.appendChild(document.createTextNode(""));
    chrome?.appendChild(document.createTextNode("Wide"));

    expect(getDOMTextContent(root)).toBe("alpha\nbeta\ngamma");

    const gamma = root.querySelector("p:last-child")?.firstChild;
    expect(gamma).toBeTruthy();
    expect(getTextOffset(root, gamma as Node, 0)).toBe(11);

    const { text, nodes } = collectTextNodesWithContent(root);
    expect(text).toBe("alpha\nbeta\ngamma");
    expect(nodes.map((n) => n.node.textContent)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});
