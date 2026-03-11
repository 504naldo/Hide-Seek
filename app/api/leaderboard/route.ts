import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { LeaderboardRow } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const leaderboard = await restSelect<LeaderboardRow>("leaderboard_stats", {
      select: "player_id,distance_km,missions_completed,longest_survival_minutes,captures",
      eq: { game_id: gameId },
      order: "captures",
      ascending: false
    });

    return NextResponse.json({ leaderboard });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch leaderboard" }, { status: 500 });
  }
}
