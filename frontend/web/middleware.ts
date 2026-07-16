import { NextResponse, type NextRequest } from "next/server";

/**
 * Route middleware. The JWT pair itself lives in localStorage (not a cookie),
 * so it isn't visible here — the API remains the real authorization boundary
 * (every request requires a valid Bearer token, checked server-side per
 * module). This middleware only reads a non-sensitive `session_role` cookie
 * (set by store/auth.ts alongside the JWT) so an unauthenticated visitor, or
 * one signed in under the wrong role, is redirected server-side instead of
 * briefly seeing the dashboard shell before client JS catches up. A forged
 * cookie gains nothing — it can't produce a valid Bearer token.
 */
export function middleware(request: NextRequest) {
  const role = request.cookies.get("session_role")?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && role !== "admin") {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  if (pathname.startsWith("/owner") && role !== "owner") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*"],
};
