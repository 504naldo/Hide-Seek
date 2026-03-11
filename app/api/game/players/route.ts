import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { Role } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const players = await restSelect<{ user_id: string; role: Role }>("game_players", {
      select: "user_id,role",
      eq: { game_id: gameId }
    });

    return NextResponse.json({ players });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch game players" }, { status: 500 });
  }
}
