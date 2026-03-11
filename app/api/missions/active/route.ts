import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { isRewardActive } from "@/lib/rewards";
import { restSelect } from "@/lib/supabase";

export async function GET(request: Request) {
  const auth = await resolveAuthenticatedUser(request);
  if (!auth.userId) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    applySessionCookies(response, auth);
    return response;
  }

  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      const response = NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
      applySessionCookies(response, auth);
      return response;
    }

    const rewards = await restSelect<{
      id: string;
      game_id: string;
      mission_id: string | null;
      user_id: string;
      reward_type: "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
      role_suitability: "hider" | "seeker" | "both";
      started_at: string;
      expires_at: string;
      metadata: Record<string, unknown> | null;
      label: string | null;
      description: string | null;
    }>("mission_reward_activations", {
      select: "id,game_id,mission_id,user_id,reward_type,role_suitability,started_at,expires_at,metadata,label,description",
      eq: { game_id: gameId },
      order: "started_at",
      ascending: false,
      limit: 100
    });

    const activeRewards = rewards.filter((reward) => isRewardActive(reward));
    const response = NextResponse.json({ activeRewards });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load active rewards" }, { status: 500 });
    applySessionCookies(response, auth);
    return response;
  }
}
