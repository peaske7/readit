import type {
  Comment,
  DocumentSettings,
  FontFamily,
  KeybindingOverride,
  ShareMode,
} from "../schema";
import type { Heading } from "./headings";

/**
 * What the server behind this client can do. A hosted (published snapshot)
 * server serves a frozen document: no file watcher, no local process to keep
 * alive, no writable settings file, no source file to edit, nothing to
 * publish. Callers ask the client instead of remembering which mode they
 * are in.
 */
export interface ClientCapabilities {
  documentStream: boolean;
  heartbeat: boolean;
  putSettings: boolean;
  patchTask: boolean;
  addDocument: boolean;
  share: boolean;
}

export interface ClientConfig {
  /** Hosted mode: a published read-only snapshot served under `basePath`. */
  hosted?: boolean;
  /** Prefix for every API route, e.g. "/s/abc123". Empty for the local server. */
  basePath?: string;
  /** This server has a share remote configured and can publish. */
  canShare?: boolean;
}

export interface DocumentSummary {
  path: string;
  fileName: string;
}

export interface DocumentList {
  files: DocumentSummary[];
  clean: boolean;
  workingDirectory?: string;
}

export interface AddedDocument extends DocumentSummary {
  status: "added" | "present";
}

export interface DocumentPayload {
  html: string;
  headings: Heading[];
  filePath: string;
  fileName: string;
  clean: boolean;
}

export interface RawComments {
  content: string | null;
  path: string;
}

export interface CommentInput {
  selectedText: string;
  comment: string;
  startOffset: number;
  endOffset: number;
}

export interface AnchorInput {
  selectedText: string;
  startOffset: number;
  endOffset: number;
}

export interface SettingsUpdate {
  fontFamily?: FontFamily;
  keybindings?: KeybindingOverride[];
}

export interface TaskPatch {
  path: string;
  index: number;
  checked: boolean;
}

/** The part of the server's ShareRecord the browser is given. */
export interface ShareRecord {
  id: string;
  url: string;
  mode: string;
}

export interface ShareState {
  /** False when this server has no share remote configured yet. */
  configured: boolean;
  share?: ShareRecord;
}

export interface ShareOptions {
  mode: ShareMode;
  password?: string;
}

export interface Client {
  readonly capabilities: ClientCapabilities;
  /** Prefix this client's routes carry; also the share's own page path. */
  readonly basePath: string;
  getDocuments(): Promise<DocumentList>;
  addDocument(path: string): Promise<AddedDocument>;
  getDocument(path?: string): Promise<DocumentPayload>;
  listComments(path?: string): Promise<Comment[]>;
  createComment(path: string, input: CommentInput): Promise<Comment>;
  updateComment(path: string, id: string, comment: string): Promise<Comment>;
  deleteComment(path: string, id: string): Promise<void>;
  deleteAllComments(path: string): Promise<void>;
  reanchor(path: string, id: string, anchor: AnchorInput): Promise<Comment>;
  getRawComments(path?: string): Promise<RawComments>;
  getSettings(): Promise<DocumentSettings>;
  putSettings(update: SettingsUpdate): Promise<DocumentSettings>;
  patchTask(patch: TaskPatch): Promise<void>;
  getShare(path: string): Promise<ShareState>;
  share(path: string, options: ShareOptions): Promise<ShareRecord>;
  unshare(path: string): Promise<void>;
  documentStream(): EventSource;
  heartbeat(): EventSource;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function createClient(config: ClientConfig = {}): Client {
  const basePath = config.basePath ?? "";

  function url(route: string, path?: string): string {
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    return `${basePath}/api/${route}${query}`;
  }

  async function request<T>(
    target: string,
    init: RequestInit,
    fallback: string,
  ): Promise<T> {
    const response = await fetch(target, init);
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error || response.statusText || fallback);
    }
    return (await response.json()) as T;
  }

  const live = !config.hosted;

  return {
    capabilities: {
      documentStream: live,
      heartbeat: live,
      putSettings: live,
      patchTask: live,
      addDocument: live,
      share: live && config.canShare === true,
    },
    basePath,

    getDocuments() {
      return request<DocumentList>(
        url("documents"),
        {},
        "Failed to load documents",
      );
    },

    addDocument(path) {
      return request<AddedDocument>(
        url("documents"),
        jsonInit("POST", { path }),
        "Failed to add document",
      );
    },

    getDocument(path) {
      return request<DocumentPayload>(
        url("document", path),
        {},
        "Failed to load document",
      );
    },

    async listComments(path) {
      const data = await request<{ comments?: Comment[] }>(
        url("comments", path),
        {},
        "Failed to load comments",
      );
      return data.comments ?? [];
    },

    async createComment(path, input) {
      const data = await request<{ comment: Comment }>(
        url("comments", path),
        jsonInit("POST", input),
        "Failed to add comment",
      );
      return data.comment;
    },

    async updateComment(path, id, comment) {
      const data = await request<{ comment: Comment }>(
        url(`comments/${id}`, path),
        jsonInit("PUT", { comment }),
        "Failed to update comment",
      );
      return data.comment;
    },

    async deleteComment(path, id) {
      await request(
        url(`comments/${id}`, path),
        { method: "DELETE" },
        "Failed to delete comment",
      );
    },

    async deleteAllComments(path) {
      await request(
        url("comments", path),
        { method: "DELETE" },
        "Failed to delete all comments",
      );
    },

    async reanchor(path, id, anchor) {
      const data = await request<{ comment: Comment }>(
        url(`comments/${id}/reanchor`, path),
        jsonInit("PUT", anchor),
        "Failed to re-anchor comment",
      );
      return data.comment;
    },

    getRawComments(path) {
      return request<RawComments>(
        url("comments/raw", path),
        {},
        "Failed to fetch raw comments",
      );
    },

    getSettings() {
      return request<DocumentSettings>(
        url("settings"),
        {},
        "Failed to load settings",
      );
    },

    putSettings(update) {
      return request<DocumentSettings>(
        url("settings"),
        jsonInit("PUT", update),
        "Failed to save settings",
      );
    },

    async patchTask(patch) {
      await request(
        url("document/task"),
        jsonInit("PATCH", patch),
        "Failed to toggle task",
      );
    },

    getShare(path) {
      return request<ShareState>(
        url("share", path),
        {},
        "Failed to load share status",
      );
    },

    share(path, options) {
      return request<ShareRecord>(
        url("share", path),
        jsonInit("POST", options),
        "Failed to publish share",
      );
    },

    async unshare(path) {
      await request(
        url("share", path),
        { method: "DELETE" },
        "Failed to delete share",
      );
    },

    documentStream() {
      return new EventSource(url("document/stream"));
    },

    heartbeat() {
      return new EventSource(url("heartbeat"));
    },
  };
}

/**
 * The client every component and store talks to. `main.ts` reconfigures it
 * from the page's inline data before the app mounts; tests build their own
 * with `createClient`.
 */
export let client = createClient();

export function configureClient(config: ClientConfig): void {
  client = createClient(config);
}

/** Test-only: swap in a fake `Client` without going through `fetch`. */
export function setClient(newClient: Client): void {
  client = newClient;
}
