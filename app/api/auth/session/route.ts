import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";

export async function GET(request: Request) {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth.userId) {
      const unauthorized = NextResponse.json({ authenticated: false }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const response = NextResponse.json({ authenticated: true, userId: auth.userId });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to resolve session" }, { status: 500 });
  }
}
