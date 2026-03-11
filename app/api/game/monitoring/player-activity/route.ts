import { NextResponse } from "next/server";
import { restSelect } from "@/lib/supabase";
import { PlayerActivitySummary, Role } from "@/lib/types";
import { assertHostMonitoringAccess } from "../utils";
import { applySessionCookies } from "@/lib/server-auth";

interface GamePlayerRow {
  user_id: string;
  role: Role;
  joined_at: string;
}

interface LocationUpdateRow {
  user_id: string;
  created_at: string;
}

interface ChatMessageRow {
  sender_user_id: string | null;
  created_at: string;
}

export async function GET(request: Request) {
  try {
    const auth = await assertHostMonitoringAccess(request);
    if ("errorResponse" in auth) return auth.errorResponse;

    const [players, locations, chatMessages] = await Promise.all([
      restSelect<GamePlayerRow>("game_players", {
        select: "user_id,role,joined_at",
        eq: { game_id: auth.gameId }
      }),
      restSelect<LocationUpdateRow>("location_updates", {
        select: "user_id,created_at",
        eq: { game_id: auth.gameId },
        order: "created_at",
        ascending: false,
        limit: 500
      }),
      restSelect<ChatMessageRow>("chat_messages", {
        select: "sender_user_id,created_at",
        eq: { game_id: auth.gameId },
        order: "created_at",
        ascending: false,
        limit: 500
      })
    ]);

    const locationByUser = new Map<string, string>();
    locations.forEach((row) => {
      if (!locationByUser.has(row.user_id)) {
        locationByUser.set(row.user_id, row.created_at);
      }
    });

    const chatByUser = new Map<string, string>();
    chatMessages.forEach((row) => {
      if (row.sender_user_id && !chatByUser.has(row.sender_user_id)) {
        chatByUser.set(row.sender_user_id, row.created_at);
      }
    });

    const summaries: PlayerActivitySummary[] = players.map((player) => {
      const lastLocationAt = locationByUser.get(player.user_id) ?? null;
      const lastChatAt = chatByUser.get(player.user_id) ?? null;
      const candidates = [lastLocationAt, lastChatAt, player.joined_at].filter((value): value is string => !!value);
      const lastActivityAt = candidates.length ? candidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] : player.joined_at;
      return {
        user_id: player.user_id,
        role: player.role,
        joined_at: player.joined_at,
        last_location_at: lastLocationAt,
        last_chat_at: lastChatAt,
        last_activity_at: lastActivityAt
      };
    });

    summaries.sort((a, b) => Date.parse(b.last_activity_at) - Date.parse(a.last_activity_at));

    const response = NextResponse.json({ gameStatus: auth.gameStatus, players: summaries });
    applySessionCookies(response, auth.auth);
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch player activity" }, { status: 500 });
  }
}
