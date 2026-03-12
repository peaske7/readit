import { bench, describe } from "vitest";
import { HTML_DOC, LARGE_DOC } from "./__fixtures__/bench-data";
import { extractContext, formatForLLM, stripHtmlTags } from "./context";

describe("stripHtmlTags", () => {
  bench("200-line HTML document", () => {
    stripHtmlTags(HTML_DOC);
  });

  bench("short HTML string", () => {
    stripHtmlTags(
      "<p>Hello &amp; <strong>world</strong> with &#60;entities&#62;</p>",
    );
  });
});

describe("extractContext", () => {
  bench("single-line selection, markdown", () => {
    extractContext({ content: LARGE_DOC, startOffset: 500, endOffset: 530 });
  });

  bench("multi-line selection, markdown", () => {
    extractContext({ content: LARGE_DOC, startOffset: 500, endOffset: 800 });
  });

  bench("HTML content (triggers stripHtmlTags)", () => {
    extractContext({ content: HTML_DOC, startOffset: 100, endOffset: 200 });
  });
});

describe("formatForLLM", () => {
  const ctx = extractContext({
    content: LARGE_DOC,
    startOffset: 500,
    endOffset: 530,
  });

  bench("format with comment", () => {
    formatForLLM({ context: ctx, fileName: "doc.md", comment: "Needs review" });
  });
});
