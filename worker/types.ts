/**
 * Shared TypeScript interfaces for the OWASP OASIS Cloudflare Worker.
 */

export interface Env {
  DB: D1Database;
  RATE_KV: KVNamespace;
  ASSETS: Fetcher;
  GITHUB_TOKEN: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  ADMIN_SECRET: string;
  ENVIRONMENT: string;
}

export interface SyncResult {
  ok: boolean;
  message: string;
  stats: SyncStats;
  done?: boolean;
  cursor?: string;
  total_repos?: number;
}

export interface SyncStats {
  repos: number;
  prs: number;
  comments: number;
}

export interface ParticipantData {
  interactions: number;
  non_oasis_interactions: number;
  decision: 'accept' | 'modify' | 'reject' | null;
  reactions_received: number;
}

export interface PRResult {
  comments: number;
}

export type ValidationResult<T = string> =
  | { ok: true;  val: T }
  | { ok: false; error: string };

export interface ParsedQuery {
  sort: string;
  dir: 'ASC' | 'DESC';
  q: string;
}
