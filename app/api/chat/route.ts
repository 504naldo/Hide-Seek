import { NextResponse } from "next/server";
import { restInsert, restSelect } from "@/lib/supabase";
import { ChatMessage } from "@/lib/types";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const messages = await restSelect<ChatMessage>("chat_messages", {
      select: "id,game_id,sender_user_id,channel,message,created_at",
      eq: { game_id: gameId },
      order: "created_at",
      ascending: true,
      limit: 100
    });

    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = await restInsert<ChatMessage>("chat_messages", {
      game_id: body.gameId,
      channel: body.channel ?? "global",
      sender_user_id: body.senderUserId,
      message: body.message
    });

    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to post message" }, { status: 500 });
  }
}
