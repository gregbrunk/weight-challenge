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
    // An API request can't do anything useful with a redirect to an HTML login
    // page — an <img> would just render the page as a broken image, and a
    // fetch would parse markup as data. Refuse outright instead.
    if (pathname.startsWith("/api/")) {
      return new NextResponse(null, { status: 404 });
    }

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
     *   _next/static, _next/image   — build output
     *   favicon.ico                 — still requested by browsers regardless
     *                                 of what the link tags say
     *   icon*.png, apple-icon*.png  — favicon and home-screen icons
     *   manifest.webmanifest        — installability
     *
     * The icons and manifest are fetched before any session exists: a phone
     * reads them while deciding whether the app is installable, and a browser
     * asks for the favicon on the unlock screen itself. Gating them would show
     * a broken tab icon and quietly break "Add to Home Screen".
     *
     * Nothing here reveals anything — they are static images and a name.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|(?:apple-)?icon[^/]*\\.png|manifest\\.webmanifest).*)",
  ],
};
