import { NextResponse } from "next/server";
import { restInsert, restSelect } from "@/lib/supabase";
import { GameRecord } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inviteCode = String(body.inviteCode ?? "").trim().toUpperCase();
    const userId = String(body.userId ?? "").trim();

    if (!inviteCode || !userId) {
      return NextResponse.json({ error: "inviteCode and userId are required" }, { status: 400 });
    }

    const games = await restSelect<GameRecord>("games", {
      select: "id,name,city,invite_code,duration_minutes,reveal_interval_minutes,status",
      eq: { invite_code: inviteCode },
      limit: 1
    });

    const game = games[0];
    if (!game) {
      return NextResponse.json({ error: "Invite code not found" }, { status: 404 });
    }

    await restInsert("game_players", {
      game_id: game.id,
      user_id: userId,
      role: body.role ?? "hider"
    });

    return NextResponse.json({ game });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to join game" }, { status: 500 });
  }
}
