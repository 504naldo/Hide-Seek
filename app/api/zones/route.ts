import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const [safeZones, missionZones] = await Promise.all([
      restSelect<{
        id: string;
        name: string;
        geometry: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
      }>("safe_zones", {
        select: "id,name,geometry,metadata",
        eq: { game_id: gameId }
      }),
      restSelect<{
        id: string;
        title: string;
        description: string | null;
        geometry: Record<string, unknown>;
        reward_metadata: Record<string, unknown> | null;
        expires_at: string | null;
      }>("mission_zones", {
        select: "id,title,description,geometry,reward_metadata,expires_at",
        eq: { game_id: gameId }
      })
    ]);

    return NextResponse.json({ safeZones, missionZones });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch zones" }, { status: 500 });
  }
}
