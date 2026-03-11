import { NextResponse } from "next/server";
import { restInsert } from "@/lib/supabase";
import { GameRecord } from "@/lib/types";

function inviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const record = await restInsert<GameRecord>("games", {
      host_user_id: body.hostUserId,
      name: body.name,
      city: body.city,
      boundary_geojson: body.boundaryGeoJson,
      duration_minutes: body.durationMinutes,
      reveal_interval_minutes: body.revealIntervalMinutes ?? 30,
      capture_radius_meters: body.captureRadiusMeters ?? 50,
      capture_max_valid_accuracy_meters: body.captureMaxValidAccuracyMeters ?? null,
      capture_stale_window_ms: body.captureStaleWindowMs ?? null,
      capture_hold_window_seconds: body.captureHoldWindowSeconds ?? null,
      capture_min_valid_samples: body.captureMinValidSamples ?? null,
      capture_suspicious_speed_mps: body.captureSuspiciousSpeedMps ?? null,
      capture_impossible_speed_mps: body.captureImpossibleSpeedMps ?? null,
      capture_max_pair_time_delta_ms: body.captureMaxPairTimeDeltaMs ?? null,
      challenge_difficulty: body.challengeDifficulty ?? "medium",
      transport_rules: body.transportRules ?? null,
      invite_code: inviteCode(),
      status: "pending"
    });

    if (body.hostUserId) {
      await restInsert("game_players", {
        game_id: record.id,
        user_id: body.hostUserId,
        role: "seeker"
      });
    }

    return NextResponse.json(record);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create game" }, { status: 500 });
  }
}
