import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { GameRecord, Role } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId query parameter is required" }, { status: 400 });
    }

    const gamePlayers = await restSelect<{ game_id: string; role: Role }>("game_players", {
      select: "game_id,role",
      eq: { user_id: userId },
      order: "joined_at",
      ascending: false,
      limit: 1
    });

    const gameId = gamePlayers[0]?.game_id;
    const role = gamePlayers[0]?.role ?? null;
    if (!gameId) {
      return NextResponse.json({ game: null, role: null });
    }

    const games = await restSelect<GameRecord>("games", {
      select: "id,name,city,invite_code,duration_minutes,reveal_interval_minutes,status,host_user_id,boundary_geojson",
      eq: { id: gameId },
      limit: 1
    });

    return NextResponse.json({ game: games[0] ?? null, role });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch active game" }, { status: 500 });
  }
}
