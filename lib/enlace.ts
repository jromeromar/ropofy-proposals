/**
 * Build the absolute /p/{token} URL from request headers. Server-side only.
 * Falls back to a relative path when the host is unknown.
 */
export function enlaceDe(
  h: { get(name: string): string | null },
  token: string,
): string {
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}/p/${token}` : `/p/${token}`;
}
