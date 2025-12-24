import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { processHtml } from "./html-processor";

describe("processHtml", () => {
  describe("basic HTML rendering", () => {
    it("renders simple HTML elements", () => {
      const result = processHtml("<p>Hello, world!</p>");
      render(result);
      expect(screen.getByText("Hello, world!")).toBeInTheDocument();
    });

    it("renders headings", () => {
      const result = processHtml("<h1>Title</h1><h2>Subtitle</h2>");
      render(result);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        "Title",
      );
      expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
        "Subtitle",
      );
    });

    it("renders links", () => {
      const result = processHtml('<a href="https://example.com">Link</a>');
      render(result);
      const link = screen.getByRole("link", { name: "Link" });
      expect(link).toHaveAttribute("href", "https://example.com");
    });

    it("renders lists", () => {
      const result = processHtml("<ul><li>Item 1</li><li>Item 2</li></ul>");
      render(result);
      expect(screen.getByText("Item 1")).toBeInTheDocument();
      expect(screen.getByText("Item 2")).toBeInTheDocument();
    });
  });

  describe("dangerous element stripping", () => {
    it("strips script tags and shows placeholder", () => {
      const result = processHtml('<script>alert("xss")</script>');
      render(result);
      expect(screen.getByText("<script> removed")).toBeInTheDocument();
      expect(screen.queryByText('alert("xss")')).not.toBeInTheDocument();
    });

    it("strips iframe tags and shows placeholder", () => {
      const result = processHtml('<iframe src="https://evil.com"></iframe>');
      render(result);
      expect(screen.getByText("<iframe> removed")).toBeInTheDocument();
    });

    it("strips object tags and shows placeholder", () => {
      const result = processHtml('<object data="malware.swf"></object>');
      render(result);
      expect(screen.getByText("<object> removed")).toBeInTheDocument();
    });

    it("strips embed tags and shows placeholder", () => {
      const result = processHtml('<embed src="malware.swf">');
      render(result);
      expect(screen.getByText("<embed> removed")).toBeInTheDocument();
    });
  });

  describe("dangerous attribute stripping", () => {
    it("strips onclick handlers", () => {
      const result = processHtml('<button onclick="alert(1)">Click</button>');
      render(result);
      const button = screen.getByRole("button", { name: "Click" });
      expect(button).not.toHaveAttribute("onclick");
    });

    it("strips onerror handlers", () => {
      const result = processHtml('<img src="x" onerror="alert(1)" alt="test">');
      render(result);
      const img = screen.getByRole("img", { name: "test" });
      expect(img).not.toHaveAttribute("onerror");
    });

    it("strips onload handlers", () => {
      const result = processHtml('<div onload="alert(1)">Content</div>');
      render(result);
      const div = screen.getByText("Content");
      expect(div).not.toHaveAttribute("onload");
    });

    it("strips onmouseover handlers", () => {
      const result = processHtml('<div onmouseover="alert(1)">Hover</div>');
      render(result);
      const div = screen.getByText("Hover");
      expect(div).not.toHaveAttribute("onmouseover");
    });
  });

  describe("dangerous URL neutralization", () => {
    it("neutralizes javascript: URLs in href", () => {
      const result = processHtml('<a href="javascript:alert(1)">Click</a>');
      render(result);
      const link = screen.getByRole("link", { name: "Click" });
      expect(link).toHaveAttribute("href", "#");
    });

    it("neutralizes javascript: URLs in src", () => {
      const result = processHtml(
        '<img src="javascript:alert(1)" alt="bad img">',
      );
      render(result);
      const img = screen.getByRole("img", { name: "bad img" });
      expect(img).toHaveAttribute("src", "#");
    });

    it("neutralizes data: URLs", () => {
      const result = processHtml(
        '<a href="data:text/html,<script>alert(1)</script>">Click</a>',
      );
      render(result);
      const link = screen.getByRole("link", { name: "Click" });
      expect(link).toHaveAttribute("href", "#");
    });

    it("neutralizes vbscript: URLs", () => {
      const result = processHtml('<a href="vbscript:msgbox(1)">Click</a>');
      render(result);
      const link = screen.getByRole("link", { name: "Click" });
      expect(link).toHaveAttribute("href", "#");
    });

    it("preserves safe URLs", () => {
      const result = processHtml('<a href="https://example.com">Safe</a>');
      render(result);
      const link = screen.getByRole("link", { name: "Safe" });
      expect(link).toHaveAttribute("href", "https://example.com");
    });
  });

  describe("mixed content", () => {
    it("handles complex HTML with multiple dangerous elements", () => {
      const html = `
        <div>
          <h1>Title</h1>
          <script>alert("xss")</script>
          <p onclick="steal()">Paragraph with handler</p>
          <a href="javascript:void(0)">Bad link</a>
          <a href="https://safe.com">Safe link</a>
          <iframe src="evil.com"></iframe>
        </div>
      `;
      render(processHtml(html));

      // Script tag replaced with placeholder
      expect(screen.getByText("<script> removed")).toBeInTheDocument();

      // Event handler stripped
      const paragraph = screen.getByText("Paragraph with handler");
      expect(paragraph).not.toHaveAttribute("onclick");

      // Dangerous URL neutralized
      const badLink = screen.getByRole("link", { name: "Bad link" });
      expect(badLink).toHaveAttribute("href", "#");

      // Safe URL preserved
      const safeLink = screen.getByRole("link", { name: "Safe link" });
      expect(safeLink).toHaveAttribute("href", "https://safe.com");

      // Iframe tag replaced with placeholder
      expect(screen.getByText("<iframe> removed")).toBeInTheDocument();
    });
  });
});
