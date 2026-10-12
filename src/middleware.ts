import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defence in depth: reject cross-origin state-changing API calls.
  if (pathname.startsWith("/api/")) {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.headers.get("origin");
      if (origin) {
        let originHost = "";
        try {
          originHost = new URL(origin).host;
        } catch {
          /* invalid origin */
        }
        if (originHost !== req.headers.get("host")) {
          return NextResponse.json(
            { success: false, error: { code: "FORBIDDEN_ORIGIN", message: "Cross-origin request blocked" } },
            { status: 403 },
          );
        }
      }
    }
    return NextResponse.next();
  }

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/admin") && !session) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (pathname === "/login" && session) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/login", "/api/:path*"] };
