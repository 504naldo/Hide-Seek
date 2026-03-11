import { NextResponse } from "next/server";
import { restInsert, restSelect } from "@/lib/supabase";
import { sendPushToGamePlayers } from "@/lib/push";
import { formatRewardDisplay, normalizeRewardDefinition } from "@/lib/rewards";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const gameId = url.searchParams.get("gameId");

    if (!gameId) {
      return NextResponse.json({ error: "gameId query parameter is required" }, { status: 400 });
    }

    const missions = await restSelect<{
      id: string;
      title: string;
      description: string | null;
      difficulty: "easy" | "medium" | "hard";
      reward_type: string;
      reward_value: Record<string, unknown> | null;
      reward_definition: Record<string, unknown> | null;
      expires_at: string | null;
    }>("missions", {
      select: "id,title,description,difficulty,reward_type,reward_value,reward_definition,expires_at",
      eq: { game_id: gameId },
      order: "created_at",
      ascending: false
    });

    const shaped = missions.map((mission) => {
      const rewardDefinition = normalizeRewardDefinition(mission);
      return {
        ...mission,
        reward: formatRewardDisplay(rewardDefinition),
        reward_definition: rewardDefinition
      };
    });

    return NextResponse.json({ missions: shaped });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch missions" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rewardDefinition = normalizeRewardDefinition({
      reward_type: body.rewardType,
      reward_value: body.rewardValue ?? null,
      reward_definition: body.rewardDefinition ?? null
    });

    const mission = await restInsert("missions", {
      game_id: body.gameId,
      title: body.title,
      description: body.description ?? null,
      mission_type: body.missionType,
      reward_type: rewardDefinition.reward_type,
      reward_value: rewardDefinition.metadata,
      reward_definition: rewardDefinition,
      difficulty: body.difficulty,
      geofence: body.geofence ?? null,
      expires_at: body.expiresAt ?? null
    });

    if (body.gameId) {
      void sendPushToGamePlayers({
        gameId: String(body.gameId),
        title: "New Mission Available",
        body: `Mission: ${body.title ?? "New objective"}`,
        eventType: "mission_available"
      });
    }

    return NextResponse.json({ mission });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create mission" }, { status: 500 });
  }
}
