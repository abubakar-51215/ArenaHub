import { NextResponse } from "next/server";

/**
 * Route middleware. Pass-through for now — JWT/role guards for /owner and
 * /admin land in Sprint 2 alongside the auth module.
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: ["/owner/:path*", "/admin/:path*"],
};
