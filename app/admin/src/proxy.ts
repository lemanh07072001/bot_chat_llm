import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isPublicPath = (pathname: string) => {
  return (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/verify-email" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password"
  );
};

// Optimistic auth check: only verifies presence of the token cookie, not its
// validity. Route/server-side code (getCurrentUser) verifies the token
// against the API and redirects to /logout to clear a stale cookie.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has("token");

  if (!hasToken && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Exclude static assets, image optimization, favicon and the push service
    // worker so they are never blocked/redirected by the auth check above.
    // The worker must be fetchable without a session cookie: the browser
    // fetches it at install time, and a redirect to /login breaks push.
    // api/uploads is excluded because proxy buffers request bodies only up to
    // proxyClientMaxBodySize (10MB default) and would truncate ~10MB images;
    // that route handler verifies the session token itself. `$` anchors it so
    // only exactly /api/uploads skips (not /api/uploadsX or /api/uploads/x).
    "/((?!_next/static|_next/image|favicon.ico|sw.js|api/uploads$).*)",
  ],
};
