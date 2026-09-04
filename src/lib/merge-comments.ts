import type { Comment } from "../schema.js";

/**
 * Merge web comments back into the local file.
 *
 * Rule: for ids that were published, the remote copy wins (edits and
 * deletions made on the web are taken); ids added locally since the last
 * publish are kept; ids that exist only on the remote are appended.
 * Order follows the local file, then new remote comments.
 */
export function mergeComments({
  local,
  remote,
  publishedIds,
}: {
  local: Comment[];
  remote: Comment[];
  publishedIds: string[];
}): Comment[] {
  const published = new Set(publishedIds);
  const remoteById = new Map(remote.map((c) => [c.id, c]));
  const merged: Comment[] = [];

  for (const comment of local) {
    const fromRemote = remoteById.get(comment.id);
    if (fromRemote) {
      merged.push(fromRemote);
      continue;
    }
    if (published.has(comment.id)) {
      continue; // published earlier, gone now: deleted on the web
    }
    merged.push(comment); // added locally after the last publish
  }

  const localIds = new Set(local.map((c) => c.id));
  for (const comment of remote) {
    if (!localIds.has(comment.id)) merged.push(comment);
  }

  return merged;
}
