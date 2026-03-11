import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { isCooldownActive, isRewardActive, isRewardType, normalizeRewardDefinition } from "@/lib/rewards";
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

    const [rewardRows, activeRows, cooldownRows] = await Promise.all([
      restSelect<{
        id: string;
        game_id: string;
        user_id: string;
        reward_type: string;
        metadata_json: Record<string, unknown> | null;
        earned_at: string;
        used_at: string | null;
        expires_at: string | null;
      }>("player_rewards", {
        select: "id,game_id,user_id,reward_type,metadata_json,earned_at,used_at,expires_at",
        eq: { game_id: gameId, user_id: auth.userId },
        order: "earned_at",
        ascending: false,
        limit: 100
      }),
      restSelect<{
        id: string;
        reward_type: "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
        started_at: string;
        expires_at: string;
      }>("mission_reward_activations", {
        select: "id,reward_type,started_at,expires_at",
        eq: { game_id: gameId, user_id: auth.userId },
        order: "started_at",
        ascending: false,
        limit: 100
      }),
      restSelect<{
        id: string;
        reward_type: string;
        last_activated_at: string;
        cooldown_ends_at: string;
      }>("player_reward_cooldowns", {
        select: "id,reward_type,last_activated_at,cooldown_ends_at",
        eq: { game_id: gameId, user_id: auth.userId },
        order: "cooldown_ends_at",
        ascending: false,
        limit: 50
      })
    ]);

    const activeRewards = activeRows.filter((row) => isRewardActive(row));

    const rewards = rewardRows.map((row) => {
      const def = normalizeRewardDefinition({
        reward_type: isRewardType(row.reward_type) ? row.reward_type : "radar_ping",
        reward_definition: row.metadata_json
      });
      const sameTypeActive = activeRewards.find((active) => active.reward_type === def.reward_type);
      const sameTypeCooldown = cooldownRows.find((cooldown) => cooldown.reward_type === def.reward_type && isCooldownActive(cooldown));

      let unavailableReason: string | null = null;
      if (row.used_at) unavailableReason = "used";
      else if (row.expires_at && Date.parse(row.expires_at) < Date.now()) unavailableReason = "expired";
      else if (sameTypeActive) unavailableReason = "active";
      else if (sameTypeCooldown) unavailableReason = "cooldown";

      return {
        ...row,
        reward_definition: def,
        cooldown_ends_at: sameTypeCooldown?.cooldown_ends_at ?? null,
        unavailable_reason: unavailableReason
      };
    });

    const response = NextResponse.json({ rewards, activeRewards, cooldowns: cooldownRows });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load reward inventory" }, { status: 500 });
    applySessionCookies(response, auth);
    return response;
  }
}
