import { describe, expect, it } from "vitest";
import { shareFilePath } from "../../src/lib/share-snapshot";
import type { Comment } from "../../src/schema";
import { ShareModes } from "../../src/schema";
import { fetchWorker, HTML, PUBLISHER, publishShare, SOURCE } from "./helpers";

const SELECTION = "Hello world";
const start = SOURCE.indexOf(SELECTION);

function postComment(id: string, comment: string): Promise<Response> {
  return fetchWorker(`/s/${id}/api/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      selectedText: SELECTION,
      comment,
      startOffset: start,
      endOffset: start + SELECTION.length,
    }),
  });
}

describe("viewer routes", () => {
  it("serves the document with the share's own paths", async () => {
    const id = await publishShare();
    const res = await fetchWorker(`/s/${id}/api/document`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      html: string;
      filePath: string;
      fileName: string;
      headings: { text: string }[];
    };
    expect(body.html).toBe(HTML);
    expect(body.fileName).toBe("notes.md");
    expect(body.filePath).toBe(shareFilePath(id, "notes.md"));
    expect(body.headings[0].text).toBe("Title");
  });

  it("renders the page and marks a link share noindex", async () => {
    const id = await publishShare();
    const res = await fetchWorker(`/s/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-robots-tag")).toBe("noindex");
    expect(await res.text()).toContain("<h1>Title</h1>");
  });

  it("404s an unknown share and an unknown route under one", async () => {
    expect((await fetchWorker("/s/AAAAAAAAAAAAAAAAAAAAAA")).status).toBe(404);
    const id = await publishShare();
    expect((await fetchWorker(`/s/${id}/nope`)).status).toBe(404);
  });
});

describe("viewer comments", () => {
  it("stores a comment as a canonical comments.md the CLI can pull", async () => {
    const id = await publishShare();

    const created = await postComment(id, "First note");
    expect(created.status).toBe(201);
    const { comment } = (await created.json()) as { comment: Comment };
    expect(comment.comment).toBe("First note");
    expect(comment.selectedText).toBe(SELECTION);

    const listed = await fetchWorker(`/s/${id}/api/comments`);
    const { comments } = (await listed.json()) as { comments: Comment[] };
    expect(comments).toHaveLength(1);
    expect(comments[0].id).toBe(comment.id);

    // The publisher route readit pull reads.
    const raw = await fetchWorker(`/api/shares/${id}/comments`, {
      headers: PUBLISHER,
    });
    const text = await raw.text();
    expect(text).toContain(`source: ${shareFilePath(id, "notes.md")}`);
    expect(text).toContain("First note");
    expect(text).not.toContain("/Users/");
  });

  it("rejects a comment without the required fields", async () => {
    const id = await publishShare();
    const res = await fetchWorker(`/s/${id}/api/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "no selection" }),
    });
    expect(res.status).toBe(400);
  });

  it("edits and deletes a comment", async () => {
    const id = await publishShare();
    const created = await postComment(id, "First note");
    const { comment } = (await created.json()) as { comment: Comment };

    const edited = await fetchWorker(`/s/${id}/api/comments/${comment.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ comment: "Edited note" }),
    });
    expect(
      ((await edited.json()) as { comment: Comment }).comment.comment,
    ).toBe("Edited note");

    const removed = await fetchWorker(`/s/${id}/api/comments/${comment.id}`, {
      method: "DELETE",
    });
    expect(removed.status).toBe(200);

    const listed = await fetchWorker(`/s/${id}/api/comments`);
    expect(((await listed.json()) as { comments: Comment[] }).comments).toEqual(
      [],
    );
    // An empty list removes the object, which is what readit pull then sees.
    const raw = await fetchWorker(`/api/shares/${id}/comments`, {
      headers: PUBLISHER,
    });
    expect(await raw.text()).toBe("");
  });

  it("serves the raw comments file to the viewer", async () => {
    const id = await publishShare();
    await postComment(id, "First note");
    const res = await fetchWorker(`/s/${id}/api/comments/raw`);
    const body = (await res.json()) as { content: string; path: string };
    expect(body.path).toBe(`/s/${id}/comments.md`);
    expect(body.content).toContain("First note");
  });
});

describe("password mode", () => {
  const publishLocked = () =>
    publishShare({ mode: ShareModes.PASSWORD, password: "hunter2" });

  it("gates the page and the api behind the unlock cookie", async () => {
    const id = await publishLocked();

    const page = await fetchWorker(`/s/${id}`);
    expect(page.status).toBe(401);
    expect(await page.text()).toContain("password protected");

    const api = await fetchWorker(`/s/${id}/api/document`);
    expect(api.status).toBe(401);
  });

  it("rejects a wrong password without setting a cookie", async () => {
    const id = await publishLocked();
    const res = await fetchWorker(`/s/${id}/unlock`, {
      method: "POST",
      body: new URLSearchParams({ password: "wrong" }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("location")).toContain("failed=1");
  });

  it("opens the share once the right password sets the cookie", async () => {
    const id = await publishLocked();
    const res = await fetchWorker(`/s/${id}/unlock`, {
      method: "POST",
      body: new URLSearchParams({ password: "hunter2" }),
    });
    expect(res.status).toBe(303);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain(`readit_unlock_${id}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain(`Path=/s/${id}`);

    const cookie = setCookie.split(";")[0];
    const page = await fetchWorker(`/s/${id}`, { headers: { cookie } });
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");

    const api = await fetchWorker(`/s/${id}/api/document`, {
      headers: { cookie },
    });
    expect(api.status).toBe(200);
  });

  it("invalidates issued cookies when the password changes", async () => {
    const id = await publishLocked();
    const unlocked = await fetchWorker(`/s/${id}/unlock`, {
      method: "POST",
      body: new URLSearchParams({ password: "hunter2" }),
    });
    const cookie = (unlocked.headers.get("set-cookie") ?? "").split(";")[0];

    await fetchWorker(`/api/shares/${id}`, {
      method: "PATCH",
      headers: { ...PUBLISHER, "content-type": "application/json" },
      body: JSON.stringify({ mode: ShareModes.PASSWORD, password: "hunter3" }),
    });

    const page = await fetchWorker(`/s/${id}`, { headers: { cookie } });
    expect(page.status).toBe(401);
  });
});
