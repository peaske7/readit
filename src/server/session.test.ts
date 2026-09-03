import * as fs from "node:fs/promises";
import * as os from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCommentPath } from "../lib/comment-storage.js";
import {
  DocumentSession,
  type SessionEvent,
  TaskPatchResults,
} from "./session.js";

const DOC = "# Title\n\nHello world.\n\n- [ ] task one\n";

let workspace: string;
let docPath: string;
let sessions: DocumentSession[];

/** Renders without shiki/mermaid: tests care about wiring, not markdown. */
async function render(content: string) {
  return { html: `<p>${content}</p>`, headings: [] };
}

function open(options: { clean?: boolean } = {}): DocumentSession {
  const session = new DocumentSession({
    files: [{ filePath: docPath, content: DOC }],
    render,
    ...options,
  });
  sessions.push(session);
  return session;
}

function waitForEvent(
  session: DocumentSession,
  type: SessionEvent["type"],
  timeoutMs = 10_000,
): Promise<SessionEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);
    const unsubscribe = session.subscribe((event) => {
      if (event.type !== type) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event);
    });
  });
}

beforeEach(async () => {
  workspace = await fs.mkdtemp(join(os.tmpdir(), "readit-session-"));
  process.env.READIT_HOME = join(workspace, "home");
  docPath = join(workspace, "doc.md");
  await fs.writeFile(docPath, DOC, "utf-8");
  sessions = [];
});

afterEach(async () => {
  for (const session of sessions) session.close();
  process.env.READIT_HOME = undefined;
  delete process.env.READIT_HOME;
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("documents", () => {
  it("lists the files it was opened with", () => {
    const session = open();
    expect(session.defaultPath).toBe(docPath);
    expect(session.listFiles()).toEqual([
      { path: docPath, fileName: "doc.md" },
    ]);
    expect(session.hasFile(docPath)).toBe(true);
    expect(session.hasFile("/nope.md")).toBe(false);
  });

  it("adds a file once and announces it", async () => {
    const session = open();
    const other = join(workspace, "other.md");
    await fs.writeFile(other, "# Other\n", "utf-8");

    const added = waitForEvent(session, "document-added");
    expect(session.addFile(other)).toBe("added");
    expect(await added).toEqual({
      type: "document-added",
      path: other,
      fileName: "other.md",
    });

    expect(session.addFile(other)).toBe("present");
    expect(session.listFiles()).toHaveLength(2);
  });

  it("renders and caches the document", async () => {
    const session = open();
    expect(await session.getDocument(docPath)).toEqual({
      html: `<p>${DOC}</p>`,
      headings: [],
    });
    expect(await session.getContent(docPath)).toBe(DOC);
  });

  it("toggles a task in the source file", async () => {
    const session = open();
    expect(await session.patchTask(docPath, 0, true)).toBe(TaskPatchResults.OK);
    expect(await fs.readFile(docPath, "utf-8")).toContain("- [x] task one");

    expect(await session.patchTask(docPath, 0, true)).toBe(
      TaskPatchResults.UNCHANGED,
    );
    expect(await session.patchTask(docPath, 9, true)).toBe(
      TaskPatchResults.OUT_OF_RANGE,
    );
  });
});

describe("comments", () => {
  it("round-trips through the .comments.md codec", async () => {
    const session = open();
    expect(await session.listComments(docPath)).toEqual([]);

    const created = await session.createComment(docPath, {
      selectedText: "Hello world.",
      comment: "needs work",
      startOffset: DOC.indexOf("Hello"),
      endOffset: DOC.indexOf("Hello") + "Hello world.".length,
    });

    const raw = await session.getRawComments(docPath);
    expect(raw.path).toBe(getCommentPath(docPath));
    expect(raw.content).toContain("needs work");

    const listed = await session.listComments(docPath);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(created.id);
    expect(listed[0].comment).toBe("needs work");

    const updated = await session.updateComment(
      docPath,
      created.id,
      "  looks good  ",
    );
    expect(updated?.comment).toBe("looks good");
    expect((await session.listComments(docPath))[0].comment).toBe("looks good");

    expect(
      await session.updateComment(docPath, "missing", "x"),
    ).toBeUndefined();
    expect(await session.deleteComment(docPath, "missing")).toBe(false);

    const reanchored = await session.reanchor(docPath, created.id, {
      selectedText: "Title",
      startOffset: DOC.indexOf("Title"),
      endOffset: DOC.indexOf("Title") + "Title".length,
    });
    expect(reanchored?.selectedText).toBe("Title");

    expect(await session.deleteComment(docPath, created.id)).toBe(true);
    expect(await session.listComments(docPath)).toEqual([]);
    expect((await session.getRawComments(docPath)).content).toBeNull();
  });

  it("clears every comment", async () => {
    const session = open();
    await session.createComment(docPath, {
      selectedText: "Hello",
      comment: "one",
      startOffset: DOC.indexOf("Hello"),
      endOffset: DOC.indexOf("Hello") + 5,
    });

    await session.deleteAllComments(docPath);
    expect(await session.listComments(docPath)).toEqual([]);
  });

  it("drops the resolved cache when the comment file changes on disk", async () => {
    const session = open();
    await session.createComment(docPath, {
      selectedText: "Hello",
      comment: "one",
      startOffset: DOC.indexOf("Hello"),
      endOffset: DOC.indexOf("Hello") + 5,
    });
    expect(await session.listComments(docPath)).toHaveLength(1);

    // What `readit pull` does: rewrite the file behind the session's back.
    const commentPath = getCommentPath(docPath);
    const stored = await fs.readFile(commentPath, "utf-8");
    await new Promise((r) => setTimeout(r, 20));
    await fs.writeFile(
      commentPath,
      stored.replace("one", "one (edited elsewhere)"),
      "utf-8",
    );

    expect((await session.listComments(docPath))[0].comment).toBe(
      "one (edited elsewhere)",
    );
  });

  it("removes existing comments when opened with clean", async () => {
    const seed = open();
    await seed.createComment(docPath, {
      selectedText: "Hello",
      comment: "stale",
      startOffset: DOC.indexOf("Hello"),
      endOffset: DOC.indexOf("Hello") + 5,
    });
    seed.close();

    const session = open({ clean: true });
    await new Promise((r) => setTimeout(r, 50));
    expect(await session.listComments(docPath)).toEqual([]);
  });
});

describe("watching", () => {
  it("reloads and announces an in-place edit", async () => {
    const session = open();
    await session.getDocument(docPath);

    const updated = waitForEvent(session, "document-updated");
    await fs.writeFile(docPath, "# Changed\n", "utf-8");

    expect(await updated).toEqual({ type: "document-updated", path: docPath });
    expect(await session.getContent(docPath)).toBe("# Changed\n");
    expect((await session.getDocument(docPath)).html).toBe(
      "<p># Changed\n</p>",
    );
  });

  it("survives a rename-style save", async () => {
    const session = open();
    await session.getDocument(docPath);

    const updated = waitForEvent(session, "document-updated");
    const tempPath = `${docPath}.tmp`;
    await fs.writeFile(tempPath, "# Renamed in\n", "utf-8");
    await fs.rename(tempPath, docPath);

    expect(await updated).toEqual({ type: "document-updated", path: docPath });
    expect(await session.getContent(docPath)).toBe("# Renamed in\n");

    // The watch must still be live for the next save.
    const again = waitForEvent(session, "document-updated");
    await new Promise((r) => setTimeout(r, 50));
    await fs.writeFile(docPath, "# Saved again\n", "utf-8");
    await again;
    expect(await session.getContent(docPath)).toBe("# Saved again\n");
  }, 20_000);

  it("stops listening after close", async () => {
    const session = open();
    let events = 0;
    session.subscribe(() => {
      events++;
    });

    session.close();
    await fs.writeFile(docPath, "# After close\n", "utf-8");
    await new Promise((r) => setTimeout(r, 400));
    expect(events).toBe(0);
  });
});
