import { NextResponse } from "next/server";
import { applySessionCookies, resolveAuthenticatedUser } from "@/lib/server-auth";
import { normalizeRewardDefinition, resolveInventoryBalanceRules, rewardAppliesToRole } from "@/lib/rewards";
import { restInsert, restSelect } from "@/lib/supabase";
import { Role } from "@/lib/types";

export async function POST(request: Request) {
  const auth = await resolveAuthenticatedUser(request);
  if (!auth.userId) {
    const response = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    applySessionCookies(response, auth);
    return response;
  }

  try {
    const body = await request.json();
    const missionId = String(body.missionId ?? "").trim();

    if (!missionId) {
      const response = NextResponse.json({ error: "missionId is required" }, { status: 400 });
      applySessionCookies(response, auth);
      return response;
    }

    const [missionRows, playerRows, completionRows] = await Promise.all([
      restSelect<{
        id: string;
        game_id: string;
        expires_at: string | null;
        reward_type: string;
        reward_value: Record<string, unknown> | null;
        reward_definition: Record<string, unknown> | null;
      }>("missions", {
        select: "id,game_id,expires_at,reward_type,reward_value,reward_definition",
        eq: { id: missionId },
        limit: 1
      }),
      restSelect<{ game_id: string; role: Role }>("game_players", {
        select: "game_id,role",
        eq: { user_id: auth.userId },
        limit: 100
      }),
      restSelect<{ id: string }>("mission_completions", {
        select: "id",
        eq: { mission_id: missionId, user_id: auth.userId },
        limit: 1
      })
    ]);

    const mission = missionRows[0];
    if (!mission) {
      const response = NextResponse.json({ error: "Mission not found" }, { status: 404 });
      applySessionCookies(response, auth);
      return response;
    }

    if (mission.expires_at && Date.parse(mission.expires_at) < Date.now()) {
      const response = NextResponse.json({ error: "Mission has expired" }, { status: 400 });
      applySessionCookies(response, auth);
      return response;
    }

    const role = playerRows.find((row) => row.game_id === mission.game_id)?.role ?? null;
    const rewardDefinition = normalizeRewardDefinition(mission);
    if (!rewardAppliesToRole(rewardDefinition, role)) {
      const response = NextResponse.json({ error: "Mission reward does not apply to your role" }, { status: 403 });
      applySessionCookies(response, auth);
      return response;
    }

    if (completionRows.length > 0) {
      const response = NextResponse.json({ error: "Mission already completed" }, { status: 409 });
      applySessionCookies(response, auth);
      return response;
    }

    const inventoryRules = resolveInventoryBalanceRules(rewardDefinition.metadata);
    const inventoryRows = await restSelect<{
      id: string;
      reward_type: string;
      used_at: string | null;
      expires_at: string | null;
    }>("player_rewards", {
      select: "id,reward_type,used_at,expires_at",
      eq: { game_id: mission.game_id, user_id: auth.userId },
      order: "earned_at",
      ascending: false,
      limit: 200
    });

    const availableInventory = inventoryRows.filter((row) => !row.used_at && (!row.expires_at || Date.parse(row.expires_at) > Date.now()));
    const duplicateCount = availableInventory.filter((row) => row.reward_type === rewardDefinition.reward_type).length;

    if (availableInventory.length >= inventoryRules.max_inventory_size) {
      const response = NextResponse.json({ error: "Inventory full", reason: "max_inventory_size", maxInventorySize: inventoryRules.max_inventory_size }, { status: 409 });
      applySessionCookies(response, auth);
      return response;
    }

    if (duplicateCount >= inventoryRules.max_duplicates_per_type) {
      const response = NextResponse.json(
        { error: "Too many duplicate rewards", reason: "max_duplicates_per_type", maxDuplicatesPerType: inventoryRules.max_duplicates_per_type },
        { status: 409 }
      );
      applySessionCookies(response, auth);
      return response;
    }

    await restInsert("mission_completions", {
      mission_id: mission.id,
      user_id: auth.userId,
      verified: true,
      completed_at: new Date().toISOString()
    });

    const rewardExpiry = rewardDefinition.usable_until ?? mission.expires_at ?? new Date(Date.now() + 1000 * 60 * 60 * 12).toISOString();

    const playerReward = await restInsert("player_rewards", {
      game_id: mission.game_id,
      user_id: auth.userId,
      reward_type: rewardDefinition.reward_type,
      metadata_json: rewardDefinition,
      earned_at: new Date().toISOString(),
      used_at: null,
      expires_at: rewardExpiry
    });

    const response = NextResponse.json({ completion: { missionId: mission.id }, playerReward });
    applySessionCookies(response, auth);
    return response;
  } catch (error) {
    const response = NextResponse.json({ error: error instanceof Error ? error.message : "Failed to complete mission" }, { status: 500 });
    applySessionCookies(response, auth);
    return response;
  }
}
