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
/** The sign-in page, remembering the page that was asked for (see lib/after-login.ts). */
function signIn(page: string, request: NextRequest): URL {
  const url = new URL(page, request.url);
  const { pathname, search } = request.nextUrl;
  if (pathname !== "/owner" && pathname !== "/admin")
    url.searchParams.set("next", pathname + search);
  return url;
}

export function middleware(request: NextRequest) {
  const role = request.cookies.get("session_role")?.value;
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && pathname !== "/admin/login" && role !== "admin") {
    return NextResponse.redirect(signIn("/admin/login", request));
  }
  if (pathname.startsWith("/owner") && role !== "owner") {
    return NextResponse.redirect(signIn("/login", request));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*"],
};
