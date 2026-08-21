/**
 * Authentication (Auth.js v5) with Microsoft Entra ID / Microsoft Account.
 *
 * Protects the CONSULTANT area. The client proposal link (/p/[token]) and the
 * telemetry endpoint it calls stay PUBLIC — see `esRutaPublica` and the
 * `authorized` callback below.
 *
 * Inert until configured: with no Entra credentials in the environment (local
 * dev, CI, previews), enforcement is disabled and every route is allowed, so
 * the app and tests run without an Azure app registration. Setting the env
 * vars on the server (Vercel) turns login on.
 */

import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const authConfigurado =
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_ID &&
  !!process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET;

/** Routes that never require a session. */
export function esRutaPublica(pathname: string): boolean {
  return (
    pathname.startsWith("/p/") ||
    pathname === "/p" ||
    pathname.startsWith("/api/telemetria") ||
    pathname.startsWith("/api/auth")
  );
}

/**
 * Optional allowlist. If AUTH_ALLOWED_EMAILS or AUTH_ALLOWED_DOMAINS is set,
 * only those may sign in; if neither is set, any authenticated Microsoft
 * account is allowed (a warning worth setting the allowlist in production).
 */
function permitido(email: string | null | undefined): boolean {
  if (!email) return false;
  const e = email.toLowerCase();
  const emails = (process.env.AUTH_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const domains = (process.env.AUTH_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0 && domains.length === 0) return true;
  if (emails.includes(e)) return true;
  const dom = e.split("@")[1] ?? "";
  return domains.includes(dom);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Dev fallback secret so local build/test don't throw; production must set
  // AUTH_SECRET.
  secret: process.env.AUTH_SECRET ?? "dev-insecure-secret-change-in-production",
  trustHost: true,
  providers: authConfigurado
    ? [
        MicrosoftEntraID({
          clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
          clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
          // "common" lets both work/school (Entra) and personal Microsoft
          // accounts sign in; override with a tenant issuer to restrict.
          issuer:
            process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ??
            "https://login.microsoftonline.com/common/v2.0",
        }),
      ]
    : [],
  callbacks: {
    signIn({ profile, user }) {
      const email =
        (profile?.email as string | undefined) ??
        (profile?.preferred_username as string | undefined) ??
        user?.email ??
        null;
      return permitido(email);
    },
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      if (esRutaPublica(pathname)) return true;
      if (!authConfigurado) return true; // enforcement off until configured
      return !!auth?.user;
    },
  },
});
