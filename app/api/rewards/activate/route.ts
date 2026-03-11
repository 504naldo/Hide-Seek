import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import {
  computeCooldownEnds,
  computeExpiry,
  isCooldownActive,
  isRewardActive,
  normalizeRewardDefinition,
  resolveInventoryBalanceRules,
  rewardAppliesToRole,
  validateRewardMetadata
} from "@/lib/rewards";
import { restInsert, restSelect, restUpdate } from "@/lib/supabase";
import { Role } from "@/lib/types";

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function offsetCoordinate(lat: number, lng: number, meters: number): [number, number] {
  const heading = Math.random() * 2 * Math.PI;
  const earth = 6371000;
  const distanceRatio = meters / earth;
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);

  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(distanceRatio) + Math.cos(lat1) * Math.sin(distanceRatio) * Math.cos(heading));
  const lng2 = lng1 + Math.atan2(
    Math.sin(heading) * Math.sin(distanceRatio) * Math.cos(lat1),
    Math.cos(distanceRatio) - Math.sin(lat1) * Math.sin(lat2)
  );

  return [toDegrees(lat2), toDegrees(lng2)];
}

export async function POST(request: Request) {
  const auth = await resolveAuthenticatedUser(request);
  if (!auth.userId) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    applySessionCookies(response, auth);
    return response;
  }

  try {
    const body = await request.json();
    const playerRewardId = String(body.playerRewardId ?? "").trim();

    if (!playerRewardId) {
      const response = NextResponse.json({ error: "playerRewardId is required" }, { status: 400 });
      applySessionCookies(response, auth);
      return response;
    }

    const rewards = await restSelect<{
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
      eq: { id: playerRewardId, user_id: auth.userId },
      limit: 1
    });

    const reward = rewards[0];
    if (!reward) {
      const response = NextResponse.json({ error: "Reward not found" }, { status: 404 });
      applySessionCookies(response, auth);
      return response;
    }

    if (reward.used_at) {
      const response = NextResponse.json({ error: "Reward already used", reason: "used" }, { status: 409 });
      applySessionCookies(response, auth);
      return response;
    }

    if (reward.expires_at && Date.parse(reward.expires_at) < Date.now()) {
      const response = NextResponse.json({ error: "Reward has expired", reason: "expired" }, { status: 400 });
      applySessionCookies(response, auth);
      return response;
    }

    const rewardDefinition = normalizeRewardDefinition({
      reward_type: reward.reward_type,
      reward_definition: reward.metadata_json
    });
    const inventoryRules = resolveInventoryBalanceRules(rewardDefinition.metadata);

    const [playerRows, activeRows, cooldownRows] = await Promise.all([
      restSelect<{ role: Role }>("game_players", {
        select: "role",
        eq: { game_id: reward.game_id, user_id: auth.userId },
        limit: 1
      }),
      restSelect<{
        id: string;
        reward_type: "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
        started_at: string;
        expires_at: string;
      }>("mission_reward_activations", {
        select: "id,reward_type,started_at,expires_at",
        eq: { game_id: reward.game_id, user_id: auth.userId, reward_type: rewardDefinition.reward_type },
        order: "started_at",
        ascending: false,
        limit: 10
      }),
      restSelect<{
        id: string;
        game_id: string;
        user_id: string;
        reward_type: string;
        last_activated_at: string;
        cooldown_ends_at: string;
      }>("player_reward_cooldowns", {
        select: "id,game_id,user_id,reward_type,last_activated_at,cooldown_ends_at",
        eq: { game_id: reward.game_id, user_id: auth.userId, reward_type: rewardDefinition.reward_type },
        limit: 1
      })
    ]);

    const role = playerRows[0]?.role ?? null;
    if (!rewardAppliesToRole(rewardDefinition, role)) {
      const response = NextResponse.json({ error: "Reward does not apply to your role", reason: "role_mismatch" }, { status: 403 });
      applySessionCookies(response, auth);
      return response;
    }

    if (activeRows.some((row) => isRewardActive(row))) {
      const response = NextResponse.json({ error: "Reward type is currently active", reason: "already_active" }, { status: 409 });
      applySessionCookies(response, auth);
      return response;
    }

    const cooldown = cooldownRows[0];
    if (cooldown && isCooldownActive(cooldown)) {
      const response = NextResponse.json(
        { error: "Reward type is cooling down", reason: "cooldown", cooldownEndsAt: cooldown.cooldown_ends_at },
        { status: 409 }
      );
      applySessionCookies(response, auth);
      return response;
    }

    const nowIso = new Date().toISOString();
    let metadata = validateRewardMetadata(rewardDefinition.reward_type, rewardDefinition.metadata);

    if (rewardDefinition.reward_type === "ghost_mode" || rewardDefinition.reward_type === "false_signal") {
      const latestLocation = await restSelect<{ latitude: number; longitude: number }>("location_updates", {
        select: "latitude,longitude",
        eq: { game_id: reward.game_id, user_id: auth.userId },
        order: "created_at",
        ascending: false,
        limit: 1
      });

      const current = latestLocation[0];
      if (current) {
        if (rewardDefinition.reward_type === "ghost_mode") {
          metadata = { ...metadata, frozen_lat: current.latitude, frozen_lng: current.longitude };
        }

        if (rewardDefinition.reward_type === "false_signal") {
          const [decoyLat, decoyLng] = offsetCoordinate(current.latitude, current.longitude, Number(metadata.offset_radius_meters ?? 120));
          metadata = { ...metadata, decoy_lat: decoyLat, decoy_lng: decoyLng };
        }
      }
    }

    const activationExpiresAt = computeExpiry(nowIso, rewardDefinition.duration_seconds);
    const activation = await restInsert("mission_reward_activations", {
      mission_id: null,
      game_id: reward.game_id,
      user_id: auth.userId,
      reward_type: rewardDefinition.reward_type,
      role_suitability: rewardDefinition.role_suitability,
      started_at: nowIso,
      expires_at: activationExpiresAt,
      metadata,
      label: rewardDefinition.label ?? null,
      description: rewardDefinition.description ?? null
    });

    const cooldownEndsAt = computeCooldownEnds(activationExpiresAt, inventoryRules.cooldown_seconds);
    if (cooldown) {
      await restUpdate(
        "player_reward_cooldowns",
        { last_activated_at: nowIso, cooldown_ends_at: cooldownEndsAt },
        { id: cooldown.id }
      );
    } else {
      await restInsert("player_reward_cooldowns", {
        game_id: reward.game_id,
        user_id: auth.userId,
        reward_type: rewardDefinition.reward_type,
        last_activated_at: nowIso,
        cooldown_ends_at: cooldownEndsAt
      });
    }

    await restUpdate("player_rewards", { used_at: nowIso }, { id: reward.id });

    const response = NextResponse.json({ activation, cooldownEndsAt });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Failed to activate reward" }, { status: 500 });
    applySessionCookies(response, auth);
    return response;
  }
}
