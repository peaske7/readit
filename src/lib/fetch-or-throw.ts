export async function fetchOrThrow(
  url: string,
  init: RequestInit,
  fallback: string,
): Promise<Response> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || response.statusText || fallback);
  }
  return response;
}
