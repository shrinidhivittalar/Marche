/**
 * Parses CORS_ORIGINS into an explicit browser-origin allow-list for
 * enableCors's `origin` option. Splits on commas, trims whitespace, drops
 * empty entries (a trailing comma or accidental blank shouldn't become a
 * silent allow-all). No wildcard is introduced — the `cors` package matches
 * each array entry by exact string equality, the same strictness a single
 * origin string already had.
 *
 * Distinct from FRONTEND_ORIGIN: FRONTEND_ORIGIN is the one canonical URL
 * used for outbound email links; CORS_ORIGINS is the (possibly larger) set
 * of browser origins allowed to make credentialed requests — e.g. a staging
 * frontend that should reach the API but never appears in an email.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
