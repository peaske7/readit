import type { Env } from "./env";
import { errorResponse } from "./http";

export async function handleShare(
  _request: Request,
  _env: Env,
  _url: URL,
  _id: string,
  _rest: string,
): Promise<Response> {
  return errorResponse("Not implemented", 501);
}
