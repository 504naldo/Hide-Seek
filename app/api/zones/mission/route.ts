import { NextResponse } from "next/server";
import { restInsert } from "@/lib/supabase";
import { isSupportedZoneGeometry, assertHostAccess } from "@/lib/zone-utils";
import { MissionZoneRecord } from "@/lib/types";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const gameId = String(body.gameId ?? "").trim();
    const title = String(body.title ?? "").trim();

    if (!gameId || !title || !isSupportedZoneGeometry(body.geometry)) {
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

    const zone = await restInsert<MissionZoneRecord>("mission_zones", {
      game_id: gameId,
      title,
      description: body.description ?? null,
      geometry: body.geometry,
      reward_metadata: body.rewardMetadata ?? null,
      expires_at: body.expiresAt ?? null
    });

    const response = NextResponse.json({ zone });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create mission zone" }, { status: 500 });
  }
}
