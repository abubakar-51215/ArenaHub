import { NextResponse } from "next/server";

/**
 * Route middleware. Pass-through: the JWT pair lives in localStorage (not a
 * cookie), so it isn't visible to edge middleware. The owner role guard runs
 * client-side in app/owner/layout.tsx after the auth store rehydrates. A
 * cookie-based edge guard can replace this once refresh tokens move to an
 * httpOnly cookie.
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*"],
};
