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
    // Exclude static assets, image optimization and favicon so they are
    // never blocked/redirected by the auth check above.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
