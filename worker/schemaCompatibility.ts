/**
 * Small compatibility helpers for rolling out additive D1 migrations.
 *
 * Preview can briefly run a new Worker against the previous schema while a
 * Cloudflare build is catching up. Only missing schema objects are handled
 * here; all other database errors still reach the Worker error boundary.
 */
export function isMissingSchemaObject(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /no such (table|column|index)/i.test(message);
}
