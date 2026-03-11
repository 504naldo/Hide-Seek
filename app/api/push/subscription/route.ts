import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { removePushSubscription, upsertPushSubscription } from "@/lib/push";

export async function POST(request: Request) {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth.userId) {
      const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const body = await request.json();
    const endpoint = String(body?.endpoint ?? "").trim();
    const p256dh = String(body?.keys?.p256dh ?? "").trim();
    const authKey = String(body?.keys?.auth ?? "").trim();

    if (!endpoint || !p256dh || !authKey) {
      const bad = NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
      applySessionCookies(bad, auth);
      return bad;
    }

    await upsertPushSubscription({
      user_id: auth.userId,
      endpoint,
      p256dh,
      auth: authKey,
      user_agent: request.headers.get("user-agent")
    });

    const response = NextResponse.json({ ok: true });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to register push subscription" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth.userId) {
      const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const body = await request.json();
    const endpoint = String(body?.endpoint ?? "").trim();
    if (!endpoint) {
      const bad = NextResponse.json({ error: "endpoint is required" }, { status: 400 });
      applySessionCookies(bad, auth);
      return bad;
    }

    await removePushSubscription(endpoint);
    const response = NextResponse.json({ ok: true });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to remove push subscription" }, { status: 500 });
  }
}
