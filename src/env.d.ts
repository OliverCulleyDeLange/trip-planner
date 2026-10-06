/// <reference types="astro/client" />

interface D1Result<T = Record<string, unknown>> { results: T[]; meta: { changes: number }; }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

declare namespace App {
  interface Locals {}
}

interface CloudflareEnv {
  DB: D1Database;
  COOKIE_SIGNING_SECRET: string;
  GEOAPIFY_API_KEY: string;
}

declare module 'cloudflare:workers' {
  export const env: CloudflareEnv;
}
