import { NextResponse } from "next/server";
import { restInsert } from "@/lib/supabase";
import { isSupportedZoneGeometry, assertHostAccess } from "@/lib/zone-utils";
import { SafeZoneRecord } from "@/lib/types";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const gameId = String(body.gameId ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!gameId || !name || !isSupportedZoneGeometry(body.geometry)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const auth = await resolveAuthenticatedUser(request);
    const authenticatedUserId = auth.userId;
    if (!authenticatedUserId) {
      const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const allowed = await assertHostAccess(gameId, authenticatedUserId);
    if (!allowed) {
      return NextResponse.json({ error: "Host-only action" }, { status: 403 });
    }

    const zone = await restInsert<SafeZoneRecord>("safe_zones", {
      game_id: gameId,
      name,
      geometry: body.geometry,
      metadata: body.metadata ?? null
    });

    const response = NextResponse.json({ zone });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create safe zone" }, { status: 500 });
  }
}
