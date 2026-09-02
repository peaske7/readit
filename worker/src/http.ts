export function json(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(data, { status, headers });
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function errorWithDetail(
  message: string,
  err: unknown,
  status = 500,
): Response {
  const detail = err instanceof Error ? err.message : String(err);
  return errorResponse(`${message}: ${detail}`, status);
}
