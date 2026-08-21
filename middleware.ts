export { auth as middleware } from "@/auth";

/**
 * Run auth on everything EXCEPT the public client surfaces and static assets:
 *  - /p/…            the frozen client document (no login)
 *  - /api/telemetria the signal the client document fires
 *  - /api/auth/…     the Auth.js endpoints themselves
 *  - _next, favicon, common static files
 * The `authorized` callback in auth.ts is the second guard (and no-ops when
 * auth is unconfigured).
 */
export const config = {
  matcher: [
    "/((?!p/|api/telemetria|api/auth|_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|ico|css|js|woff2?)$).*)",
  ],
};
