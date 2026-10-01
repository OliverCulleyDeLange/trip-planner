import type { APIContext } from 'astro';
import { env as cloudflareEnv } from 'cloudflare:workers';
import { enforceRateLimit } from './database';

const cookieName = 'trip_planner_session';

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function signature(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}

async function validCookie(raw: string | undefined, secret: string): Promise<string | undefined> {
  if (!raw) return undefined;
  const separator = raw.lastIndexOf('.');
  if (separator < 1) return undefined;
  const id = raw.slice(0, separator);
  const provided = raw.slice(separator + 1);
  const expected = await signature(id, secret);
  if (provided.length !== expected.length) return undefined;
  let difference = 0;
  for (let index = 0; index < provided.length; index += 1) difference |= provided.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0 ? id : undefined;
}

export function environment(_context: APIContext): CloudflareEnv {
  const env = cloudflareEnv as unknown as CloudflareEnv;
  if (!env?.DB) throw new Error('D1 binding is unavailable. Run the app with Wrangler.');
  if (!env.COOKIE_SIGNING_SECRET) throw new Error('COOKIE_SIGNING_SECRET is not configured.');
  return env;
}

export async function browserSession(context: APIContext): Promise<string> {
  const env = environment(context);
  let id = await validCookie(context.cookies.get(cookieName)?.value, env.COOKIE_SIGNING_SECRET);
  if (!id) {
    id = crypto.randomUUID();
    context.cookies.set(cookieName, `${id}.${await signature(id, env.COOKIE_SIGNING_SECRET)}`, {
      httpOnly: true, secure: !import.meta.env.DEV, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
    });
  }
  return id;
}

export async function guardRequest(context: APIContext, limit?: number): Promise<{ env: CloudflareEnv; sessionId: string } | Response> {
  try {
    const env = environment(context);
    const sessionId = await browserSession(context);
    if (!await enforceRateLimit(env.DB, sessionId, limit)) return json({ error: 'Too many requests. Please wait a minute and try again.' }, 429);
    return { env, sessionId };
  } catch (error) {
    console.error(error);
    return json({ error: 'The service is not configured correctly.' }, 500);
  }
}

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export async function jsonBody<T>(request: Request, maxBytes = 1_000_000): Promise<T> {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxBytes) throw new Error('Request is too large.');
  return request.json() as Promise<T>;
}

export function validTripId(value: string | undefined): value is string {
  return Boolean(value && /^trip_[A-Za-z0-9_-]{32}$/.test(value));
}
