import { NextResponse } from "next/server";
import { restDelete, restSelect, restUpdate } from "@/lib/supabase";
import { assertHostAccess, isSupportedZoneGeometry } from "@/lib/zone-utils";
import { SafeZoneRecord } from "@/lib/types";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";

async function getZone(zoneId: string) {
  const rows = await restSelect<{ id: string; game_id: string }>("safe_zones", {
    select: "id,game_id",
    eq: { id: zoneId },
    limit: 1
  });
  return rows[0] ?? null;
}

export async function PATCH(request: Request, { params }: { params: { zoneId: string } }) {
  try {
    const auth = await resolveAuthenticatedUser(request);
    const authenticatedUserId = auth.userId;
    if (!authenticatedUserId) {
      const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const zone = await getZone(params.zoneId);
    if (!zone) return NextResponse.json({ error: "Zone not found" }, { status: 404 });

    const allowed = await assertHostAccess(zone.game_id, authenticatedUserId);
    if (!allowed) return NextResponse.json({ error: "Host-only action" }, { status: 403 });

    const body = await request.json();
    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim();
    if (body.metadata !== undefined) updates.metadata = body.metadata;
    if (body.geometry !== undefined) {
      if (!isSupportedZoneGeometry(body.geometry)) {
        return NextResponse.json({ error: "Unsupported geometry" }, { status: 400 });
      }
      updates.geometry = body.geometry;
    }

    const updated = await restUpdate<SafeZoneRecord>("safe_zones", updates, { id: params.zoneId });
    const response = NextResponse.json({ zone: updated });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update safe zone" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { zoneId: string } }) {
  try {
    const auth = await resolveAuthenticatedUser(request);
    const authenticatedUserId = auth.userId;
    if (!authenticatedUserId) {
      const unauthorized = NextResponse.json({ error: "Authentication required" }, { status: 401 });
      applySessionCookies(unauthorized, auth);
      return unauthorized;
    }

    const zone = await getZone(params.zoneId);
    if (!zone) return NextResponse.json({ error: "Zone not found" }, { status: 404 });

    const allowed = await assertHostAccess(zone.game_id, authenticatedUserId);
    if (!allowed) return NextResponse.json({ error: "Host-only action" }, { status: 403 });

    await restDelete("safe_zones", { id: params.zoneId });
    const response = NextResponse.json({ ok: true });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete safe zone" }, { status: 500 });
  }
}
