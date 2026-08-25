/**
 * Route protection and session refresh.
 *
 * Next 16 renamed this convention from "middleware" to "proxy"; the behaviour
 * is unchanged.
 *
 * Runs at the edge on every request that isn't a static asset. It verifies the
 * session token's signature and expiry — no database access, so it stays fast —
 * and slides the fifteen-minute window forward while you're using the app.
 *
 * The epoch check against the database happens in `requireAuth()` on the server
 * side; this layer can't reach Postgres from the edge runtime.
 */

import { NextResponse, type NextRequest } from "next/server";
import {
  readSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  shouldRefresh,
  createSessionToken,
} from "@/lib/auth/session";

/** Reachable without a session. Everything else requires one. */
const PUBLIC_PATHS = ["/unlock"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const payload = await readSessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  // Already unlocked, sitting on the unlock screen: send them onward.
  if (payload && isPublic(pathname)) {
    const next = request.nextUrl.searchParams.get("next");
    const destination = next?.startsWith("/") ? next : "/";
    return NextResponse.redirect(new URL(destination, request.url));
  }

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  if (!payload) {
    const url = new URL("/unlock", request.url);
    // Only ever return to a path on this site, never an absolute URL supplied
    // by someone else.
    if (pathname !== "/") {
      url.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();

  // Slide the window forward, but not on every single request.
  if (shouldRefresh(payload)) {
    response.cookies.set(
      SESSION_COOKIE,
      await createSessionToken(payload.epoch),
      sessionCookieOptions(),
    );
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *   _next/static, _next/image  — build output
     *   favicon.ico, icons, manifest — installable-app assets, requested before
     *                                  a session exists
     */
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-icon.*\\.png|manifest.webmanifest).*)",
  ],
};
