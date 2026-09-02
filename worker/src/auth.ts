import type { Env } from "./env";
import {
  base64url,
  fromBase64url,
  type PasswordRecord,
  type ShareMeta,
} from "./store";

const encoder = new TextEncoder();
const PBKDF2_ITERATIONS = 100_000;
const COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30;

async function sha256(text: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(text));
}

/** Constant-time comparison of two secrets of any length. */
async function equalSecrets(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

export async function isPublisher(
  request: Request,
  env: Env,
): Promise<boolean> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return equalSecrets(header.slice("Bearer ".length), env.PUBLISH_TOKEN);
}

export async function hashPassword(password: string): Promise<PasswordRecord> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, saltBytes, PBKDF2_ITERATIONS);
  return { salt: base64url(saltBytes), hash, iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const hash = await derive(
    password,
    fromBase64url(record.salt),
    record.iterations,
  );
  return equalSecrets(hash, record.hash);
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return base64url(new Uint8Array(bits));
}

export function unlockCookieName(id: string): string {
  return `readit_unlock_${id}`;
}

/**
 * HMAC(secret, id:salt). Binding the salt means changing the password
 * invalidates every cookie issued for the old one.
 */
export async function unlockCookieValue(
  env: Env,
  meta: ShareMeta,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.COOKIE_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${meta.id}:${meta.password?.salt ?? ""}`),
  );
  return base64url(new Uint8Array(sig));
}

export function unlockCookieHeader(id: string, value: string): string {
  return `${unlockCookieName(id)}=${value}; Path=/s/${id}; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_S}`;
}

export async function hasValidUnlock(
  request: Request,
  env: Env,
  meta: ShareMeta,
): Promise<boolean> {
  const name = unlockCookieName(meta.id);
  const found = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!found) return false;
  const expected = await unlockCookieValue(env, meta);
  return equalSecrets(found.slice(name.length + 1), expected);
}
