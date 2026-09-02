/**
 * API base prefix. Empty for the local server; `/s/{id}` when the page is
 * served by the share Worker, whose routes live under the share path.
 */
let apiBase = "";

export function setApiBase(base: string): void {
  apiBase = base;
}

export function apiUrl(path: string): string {
  return `${apiBase}${path}`;
}
