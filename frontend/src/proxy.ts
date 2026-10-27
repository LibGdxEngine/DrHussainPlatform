import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";

/**
 * EMR screens that do not need a staff session: sign-in itself, the patient's own form, and the
 * page where an invited colleague creates their account.
 */
const PUBLIC_EMR_PATHS = ["/emr/signin", "/emr/intake", "/emr/join"];

/** Files served from `public/emr` (logos, portraits) must load before anyone has signed in. */
const STATIC_ASSET = /\.(?:png|jpe?g|webp|svg|ico|gif)$/i;

/**
 * Optimistic gate: send signed-out visitors to sign-in before a staff screen renders.
 * The backend still authorises every API call; this only avoids showing an empty record.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (
    STATIC_ASSET.test(pathname) ||
    PUBLIC_EMR_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
  ) {
    return NextResponse.next();
  }
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token?.accessToken && !token.sessionExpired) return NextResponse.next();
  const signin = new URL("/emr/signin", request.url);
  signin.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signin);
}

export const config = {
  matcher: ["/emr/:path*"],
};
