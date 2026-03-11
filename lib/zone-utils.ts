import { GeoJsonGeometry } from "./types";
import { restSelect } from "./supabase";

export function isSupportedZoneGeometry(geometry: unknown): geometry is GeoJsonGeometry {
  if (!geometry || typeof geometry !== "object") return false;
  const g = geometry as { type?: string; coordinates?: unknown };

  if (g.type === "Point") {
    return Array.isArray(g.coordinates) && g.coordinates.length >= 2;
  }

  if (g.type === "Polygon") {
    if (!Array.isArray(g.coordinates) || g.coordinates.length === 0) return false;
    const firstRing = g.coordinates[0];
    return Array.isArray(firstRing) && firstRing.length >= 3;
  }

  return false;
}

export async function assertHostAccess(gameId: string, requesterUserId: string): Promise<boolean> {
  const rows = await restSelect<{ host_user_id: string | null }>("games", {
    select: "host_user_id",
    eq: { id: gameId },
    limit: 1
  });

  return rows[0]?.host_user_id === requesterUserId;
}
