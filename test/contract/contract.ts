import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AnchorConfidences,
  type Comment,
  type DocumentSettings,
  FontFamilies,
} from "../../src/schema";
import { REANCHORED_TEXT, SELECTED_TEXT, selectionOf } from "./fixture";

/**
 * The routes every readit server is expected to serve. A server that does not
 * serve one declares it in `ContractAdapter.omits`; the suite then skips it
 * instead of discovering the gap as a failure. See docs/api-contract.md.
 */
export const ContractRoutes = {
  LIST_DOCUMENTS: "GET /api/documents",
  ADD_DOCUMENT: "POST /api/documents",
  GET_DOCUMENT: "GET /api/document",
  LIST_COMMENTS: "GET /api/comments",
  CREATE_COMMENT: "POST /api/comments",
  DELETE_COMMENTS: "DELETE /api/comments",
  UPDATE_COMMENT: "PUT /api/comments/{id}",
  DELETE_COMMENT: "DELETE /api/comments/{id}",
  REANCHOR_COMMENT: "PUT /api/comments/{id}/reanchor",
  RAW_COMMENTS: "GET /api/comments/raw",
  HEALTH: "GET /api/health",
  GET_SETTINGS: "GET /api/settings",
  UPDATE_SETTINGS: "PUT /api/settings",
} as const;

export type ContractRoute =
  (typeof ContractRoutes)[keyof typeof ContractRoutes];

export interface ContractServer {
  /** Every request is `${apiBase}/api/...`, e.g. `http://127.0.0.1:4567`. */
  apiBase: string;
  /** A second document for `POST /api/documents`. */
  addableDocumentPath?: string;
  stop: () => Promise<void>;
}

export interface ContractAdapter {
  name: string;
  /** Routes this server deliberately does not serve. */
  omits: readonly ContractRoute[];
  /** Undefined when the server cannot run here; `skipReason` says why. */
  start?: () => Promise<ContractServer>;
  skipReason?: string;
}

const STARTUP_TIMEOUT_MS = 120_000;

export function runContractSuite(adapter: ContractAdapter): void {
  const { start } = adapter;

  if (!start) {
    describe(adapter.name, () => {
      it.skip(`skipped: ${adapter.skipReason ?? "server unavailable"}`, () => {});
    });
    return;
  }

  describe(adapter.name, () => {
    let server: ContractServer;
    // The key a server files a document under; discovered, not assumed.
    let documentPath: string | undefined;

    const serves = (route: ContractRoute) => !adapter.omits.includes(route);

    function api(route: string): string {
      const target = new URL(server.apiBase + route);
      if (documentPath) target.searchParams.set("path", documentPath);
      return target.toString();
    }

    async function send(
      route: string,
      init?: RequestInit,
    ): Promise<{ status: number; body: Record<string, unknown> }> {
      const res = await fetch(api(route), init);
      return { status: res.status, body: await res.json() };
    }

    function put(body: unknown): RequestInit {
      return {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };
    }

    async function createComment(
      text = "A contract comment",
    ): Promise<Comment> {
      const { status, body } = await send("/api/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...selectionOf(SELECTED_TEXT), comment: text }),
      });
      expect(status).toBe(201);
      return expectComment(body.comment);
    }

    beforeAll(async () => {
      server = await start();
      if (!serves(ContractRoutes.LIST_DOCUMENTS)) return;

      const { body } = await send("/api/documents");
      const files = body.files as { path: string }[];
      documentPath = files[0]?.path;
      expect(documentPath).toBeTruthy();
    }, STARTUP_TIMEOUT_MS);

    afterAll(async () => {
      await server?.stop();
    });

    beforeEach(async () => {
      await fetch(api("/api/comments"), { method: "DELETE" });
    });

    it.skipIf(!serves(ContractRoutes.HEALTH))("GET /api/health", async () => {
      const { status, body } = await send("/api/health");
      expect(status).toBe(200);
      expect(body).toEqual({ status: "ok" });
    });

    it.skipIf(!serves(ContractRoutes.LIST_DOCUMENTS))(
      "GET /api/documents lists the open files",
      async () => {
        const { status, body } = await send("/api/documents");
        expect(status).toBe(200);
        expect(typeof body.clean).toBe("boolean");
        expect(typeof body.workingDirectory).toBe("string");

        const files = body.files as { path: string; fileName: string }[];
        expect(files.length).toBeGreaterThan(0);
        for (const file of files) {
          expect(typeof file.path).toBe("string");
          expect(typeof file.fileName).toBe("string");
        }
      },
    );

    it.skipIf(!serves(ContractRoutes.GET_DOCUMENT))(
      "GET /api/document returns html, headings and file identity",
      async () => {
        const { status, body } = await send("/api/document");
        expect(status).toBe(200);
        expect(typeof body.html).toBe("string");
        expect(body.html as string).toContain(SELECTED_TEXT);
        expect(typeof body.filePath).toBe("string");
        expect(typeof body.fileName).toBe("string");
        expect(typeof body.clean).toBe("boolean");

        const headings = body.headings as {
          id: string;
          text: string;
          level: number;
        }[];
        expect(Array.isArray(headings)).toBe(true);
        for (const heading of headings) {
          expect(typeof heading.id).toBe("string");
          expect(typeof heading.text).toBe("string");
          expect(typeof heading.level).toBe("number");
        }
      },
    );

    it.skipIf(!serves(ContractRoutes.LIST_COMMENTS))(
      "GET /api/comments starts empty",
      async () => {
        const { status, body } = await send("/api/comments");
        expect(status).toBe(200);
        expect(body.comments).toEqual([]);
      },
    );

    it.skipIf(!serves(ContractRoutes.CREATE_COMMENT))(
      "POST /api/comments creates a comment that reads back resolved",
      async () => {
        const created = await createComment("Contract: created");
        expect(created.selectedText).toBe(SELECTED_TEXT);
        expect(created.comment).toBe("Contract: created");

        const { body } = await send("/api/comments");
        const comments = body.comments as Comment[];
        expect(comments).toHaveLength(1);

        const stored = expectComment(comments[0]);
        expect(stored.id).toBe(created.id);
        expect(stored.selectedText).toBe(SELECTED_TEXT);
        // The phrase is in the document, so the anchor must resolve.
        expect(stored.anchorConfidence).not.toBe(AnchorConfidences.UNRESOLVED);
      },
    );

    it.skipIf(!serves(ContractRoutes.CREATE_COMMENT))(
      "POST /api/comments rejects a body without selectedText",
      async () => {
        const { status } = await send("/api/comments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            comment: "no selection",
            startOffset: 0,
            endOffset: 1,
          }),
        });
        expect(status).toBe(400);
      },
    );

    it.skipIf(!serves(ContractRoutes.UPDATE_COMMENT))(
      "PUT /api/comments/{id} replaces the comment text",
      async () => {
        const created = await createComment();

        const updated = await send(
          `/api/comments/${created.id}`,
          put({ comment: "Contract: updated" }),
        );
        expect(updated.status).toBe(200);
        expect(expectComment(updated.body.comment).comment).toBe(
          "Contract: updated",
        );

        const missing = await send(
          "/api/comments/does-not-exist",
          put({ comment: "nobody" }),
        );
        expect(missing.status).toBe(404);
      },
    );

    it.skipIf(!serves(ContractRoutes.REANCHOR_COMMENT))(
      "PUT /api/comments/{id}/reanchor moves the anchor",
      async () => {
        const created = await createComment();

        const { status, body } = await send(
          `/api/comments/${created.id}/reanchor`,
          put(selectionOf(REANCHORED_TEXT)),
        );
        expect(status).toBe(200);

        const comment = expectComment(body.comment);
        expect(comment.id).toBe(created.id);
        expect(comment.selectedText).toBe(REANCHORED_TEXT);
        expect(comment.anchorConfidence).toBe(AnchorConfidences.EXACT);
      },
    );

    it.skipIf(!serves(ContractRoutes.RAW_COMMENTS))(
      "GET /api/comments/raw returns the stored comments file",
      async () => {
        const empty = await send("/api/comments/raw");
        expect(empty.status).toBe(200);
        expect(typeof empty.body.path).toBe("string");
        expect(empty.body.content).toBeNull();

        await createComment("Contract: raw");

        const filled = await send("/api/comments/raw");
        expect(typeof filled.body.content).toBe("string");
        expect(filled.body.content as string).toContain("Contract: raw");
      },
    );

    it.skipIf(!serves(ContractRoutes.DELETE_COMMENT))(
      "DELETE /api/comments/{id} removes one comment",
      async () => {
        const created = await createComment();

        const deleted = await send(`/api/comments/${created.id}`, {
          method: "DELETE",
        });
        expect(deleted.status).toBe(200);
        expect(deleted.body).toEqual({ success: true });

        const { body } = await send("/api/comments");
        expect(body.comments).toEqual([]);
      },
    );

    it.skipIf(!serves(ContractRoutes.DELETE_COMMENT))(
      "DELETE /api/comments/{id} is 404 for an unknown id",
      async () => {
        await createComment();
        const { status } = await send("/api/comments/does-not-exist", {
          method: "DELETE",
        });
        expect(status).toBe(404);
      },
    );

    it.skipIf(!serves(ContractRoutes.DELETE_COMMENTS))(
      "DELETE /api/comments removes every comment",
      async () => {
        await createComment("Contract: one");
        await createComment("Contract: two");

        const { status, body } = await send("/api/comments", {
          method: "DELETE",
        });
        expect(status).toBe(200);
        expect(body).toEqual({ success: true });

        const listed = await send("/api/comments");
        expect(listed.body.comments).toEqual([]);
      },
    );

    it.skipIf(!serves(ContractRoutes.GET_SETTINGS))(
      "GET /api/settings returns the stored settings",
      async () => {
        const { status, body } = await send("/api/settings");
        expect(status).toBe(200);
        expectSettings(body);
      },
    );

    it.skipIf(!serves(ContractRoutes.UPDATE_SETTINGS))(
      "PUT /api/settings updates the font family",
      async () => {
        const updated = await send(
          "/api/settings",
          put({ fontFamily: FontFamilies.SANS_SERIF }),
        );
        expect(updated.status).toBe(200);
        expect(expectSettings(updated.body).fontFamily).toBe(
          FontFamilies.SANS_SERIF,
        );

        const read = await send("/api/settings");
        expect(expectSettings(read.body).fontFamily).toBe(
          FontFamilies.SANS_SERIF,
        );

        const invalid = await send(
          "/api/settings",
          put({ fontFamily: "comic-sans" }),
        );
        expect(invalid.status).toBe(400);
      },
    );

    it.skipIf(!serves(ContractRoutes.ADD_DOCUMENT))(
      "POST /api/documents opens another file",
      async () => {
        const path = server.addableDocumentPath;
        expect(path).toBeTruthy();

        const { status, body } = await send("/api/documents", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ path }),
        });
        expect(status).toBe(200);
        expect(typeof body.path).toBe("string");
        expect(typeof body.fileName).toBe("string");
        expect(["added", "present"]).toContain(body.status);
      },
    );
  });
}

function expectComment(value: unknown): Comment {
  const comment = value as Comment;
  expect(typeof comment?.id).toBe("string");
  expect(typeof comment.selectedText).toBe("string");
  expect(typeof comment.comment).toBe("string");
  expect(typeof comment.startOffset).toBe("number");
  expect(typeof comment.endOffset).toBe("number");
  if (comment.anchorConfidence !== undefined) {
    expect(Object.values(AnchorConfidences)).toContain(
      comment.anchorConfidence,
    );
  }
  return comment;
}

function expectSettings(value: unknown): DocumentSettings {
  const settings = value as DocumentSettings;
  expect(typeof settings?.version).toBe("number");
  expect(Object.values(FontFamilies)).toContain(settings.fontFamily);
  return settings;
}
