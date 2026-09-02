import type { Env } from "./env";
import { errorResponse } from "./http";

export async function handlePublish(
  _request: Request,
  _env: Env,
  _url: URL,
): Promise<Response> {
  return errorResponse("Not implemented", 501);
}
