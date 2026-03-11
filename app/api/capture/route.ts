import { NextResponse } from "next/server";
import { resolveCaptureConfig } from "@/lib/capture-config";
import { buildClue, haversineDistanceMeters } from "@/lib/game-logic";
import { restInsert, restSelect } from "@/lib/supabase";
import { sendPushToUsers } from "@/lib/push";
import { resolveSpeedMultiplier } from "@/lib/rewards";
import {
  CaptureAuditSummary,
  CaptureCheckResponse,
  CaptureDenyReasonCode,
  PlayerLocation,
  SuspiciousEventType
} from "@/lib/types";

type LocationRow = {
  latitude: number;
  longitude: number;
  created_at: string;
  accuracy_meters: number | null;
};

type TimedPair = {
  seeker: PlayerLocation;
  hider: PlayerLocation;
  timeDeltaMs: number;
};

function nowMs(): number {
  return Date.now();
}

function toLocation(playerId: string, row: LocationRow): PlayerLocation {
  return {
    playerId,
    lat: row.latitude,
    lng: row.longitude,
    updatedAt: row.created_at,
    accuracyMeters: row.accuracy_meters
  };
}

function parseTs(value: string): number {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? 0 : ts;
}

function buildDeniedResponse(reasons: CaptureDenyReasonCode[], distanceMeters: number): CaptureCheckResponse {
  return {
    captured: false,
    distanceMeters: Math.round(distanceMeters),
    clue: buildClue(distanceMeters),
    nextRole: "hider",
    deniedReasons: reasons
  };
}

function findMovementAnomaly(
  samples: PlayerLocation[],
  suspiciousSpeedMps: number,
  impossibleSpeedMps: number
): CaptureDenyReasonCode | null {
  if (samples.length < 2) return null;

  const ordered = [...samples].sort((a, b) => parseTs(a.updatedAt) - parseTs(b.updatedAt));
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const dtSeconds = (parseTs(curr.updatedAt) - parseTs(prev.updatedAt)) / 1000;
    if (dtSeconds <= 0) continue;

    const speed = haversineDistanceMeters(prev, curr) / dtSeconds;
    if (speed > impossibleSpeedMps) return "impossible_jump";
    if (speed > suspiciousSpeedMps) return "suspicious_movement";
  }

  return null;
}

function withinWindow(samples: PlayerLocation[], windowStartMs: number): PlayerLocation[] {
  return samples.filter((sample) => parseTs(sample.updatedAt) >= windowStartMs);
}

function findNearestByTimestamp(target: PlayerLocation, candidates: PlayerLocation[]): TimedPair | null {
  const targetTs = parseTs(target.updatedAt);
  if (targetTs <= 0) return null;

  let best: PlayerLocation | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const candidateTs = parseTs(candidate.updatedAt);
    if (candidateTs <= 0) continue;

    const delta = Math.abs(targetTs - candidateTs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }

  if (!best) return null;

  return {
    seeker: target,
    hider: best,
    timeDeltaMs: bestDelta
  };
}

function buildTimeAlignedPairs({
  seekerSamples,
  hiderSamples,
  maxPairTimeDeltaMs
}: {
  seekerSamples: PlayerLocation[];
  hiderSamples: PlayerLocation[];
  maxPairTimeDeltaMs: number;
}): TimedPair[] {
  // Temporal alignment approach:
  // For each seeker sample, find the closest hider sample in time and keep the pair only
  // if both timestamps are near enough (`maxPairTimeDeltaMs`). This avoids comparing
  // locations from unrelated moments and reduces false captures from asynchronous updates.
  const pairs: TimedPair[] = [];

  for (const seekerSample of seekerSamples) {
    const nearest = findNearestByTimestamp(seekerSample, hiderSamples);
    if (!nearest) continue;
    if (nearest.timeDeltaMs > maxPairTimeDeltaMs) continue;
    pairs.push(nearest);
  }

  return pairs.sort((a, b) => parseTs(b.seeker.updatedAt) - parseTs(a.seeker.updatedAt));
}

async function logSuspiciousEvent({
  gameId,
  seekerUserId,
  hiderUserId,
  eventType,
  reasons,
  summary
}: {
  gameId: string;
  seekerUserId: string;
  hiderUserId: string;
  eventType: SuspiciousEventType;
  reasons: CaptureDenyReasonCode[];
  summary: CaptureAuditSummary;
}) {
  await restInsert("suspicious_events", {
    game_id: gameId,
    seeker_user_id: seekerUserId,
    hider_user_id: hiderUserId,
    event_type: eventType,
    reasons,
    metrics: summary,
    created_at: new Date().toISOString()
  });
}

async function logCaptureAudit({
  gameId,
  seekerUserId,
  hiderUserId,
  response,
  summary
}: {
  gameId: string;
  seekerUserId: string;
  hiderUserId: string;
  response: CaptureCheckResponse;
  summary: CaptureAuditSummary;
}) {
  await restInsert("capture_audit_logs", {
    game_id: gameId,
    seeker_user_id: seekerUserId,
    hider_user_id: hiderUserId,
    decision: response.captured ? "captured" : "denied",
    denied_reasons: response.deniedReasons,
    evaluated_at: new Date().toISOString(),
    metrics: summary
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const gameId = String(body.gameId ?? "").trim();
    const seekerUserId = String(body.seekerUserId ?? "").trim();
    const hiderUserId = String(body.hiderUserId ?? "").trim();

    if (!gameId || !seekerUserId || !hiderUserId) {
      return NextResponse.json(
        {
          captured: false,
          deniedReasons: ["invalid_payload"]
        } satisfies CaptureCheckResponse,
        { status: 400 }
      );
    }

    const config = await resolveCaptureConfig(gameId);
    const captureRadiusMeters = Number(body.captureRadiusMeters ?? config.defaultCaptureRadiusMeters);
    const holdWindowSeconds = Number(body.holdWindowSeconds ?? config.defaultHoldWindowSeconds);
    const minValidSamples = Number(body.minValidSamples ?? config.defaultMinValidSamples);

    const summaryBase: CaptureAuditSummary = {
      seekerTotalSamples: 0,
      hiderTotalSamples: 0,
      seekerValidSamples: 0,
      hiderValidSamples: 0,
      holdWindowSeconds,
      holdWindowCoverageMs: 0,
      alignedPairCount: 0,
      inRadiusPairCount: 0,
      maxPairTimeDeltaMs: 0,
      minDistanceMeters: null,
      maxDistanceMeters: null,
      latestDistanceMeters: null
    };

    const activeSpeedRewards = await restSelect<{
      id: string;
      game_id: string;
      mission_id: string | null;
      user_id: string;
      reward_type: "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
      role_suitability: "hider" | "seeker" | "both";
      started_at: string;
      expires_at: string;
      metadata: Record<string, unknown> | null;
    }>("mission_reward_activations", {
      select: "id,game_id,mission_id,user_id,reward_type,role_suitability,started_at,expires_at,metadata",
      eq: { game_id: gameId },
      order: "started_at",
      ascending: false,
      limit: 100
    });

    const [seekerRows, hiderRows] = await Promise.all([
      restSelect<LocationRow>("location_updates", {
        select: "latitude,longitude,created_at,accuracy_meters",
        eq: { game_id: gameId, user_id: seekerUserId },
        order: "created_at",
        ascending: false,
        limit: 60
      }),
      restSelect<LocationRow>("location_updates", {
        select: "latitude,longitude,created_at,accuracy_meters",
        eq: { game_id: gameId, user_id: hiderUserId },
        order: "created_at",
        ascending: false,
        limit: 60
      })
    ]);

    const seekerSamplesAll = seekerRows.map((row) => toLocation(seekerUserId, row));
    const hiderSamplesAll = hiderRows.map((row) => toLocation(hiderUserId, row));
    summaryBase.seekerTotalSamples = seekerSamplesAll.length;
    summaryBase.hiderTotalSamples = hiderSamplesAll.length;

    if (seekerSamplesAll.length === 0 || hiderSamplesAll.length === 0) {
      const denied = { captured: false, deniedReasons: ["insufficient_samples"] } satisfies CaptureCheckResponse;
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const newestSeeker = seekerSamplesAll[0];
    const newestHider = hiderSamplesAll[0];
    const newestDistance = haversineDistanceMeters(newestSeeker, newestHider);
    summaryBase.latestDistanceMeters = Math.round(newestDistance);

    const freshestTimestamp = Math.max(parseTs(newestSeeker.updatedAt), parseTs(newestHider.updatedAt));
    const oldestTimestamp = Math.min(parseTs(newestSeeker.updatedAt), parseTs(newestHider.updatedAt));
    summaryBase.holdWindowCoverageMs = Math.max(0, freshestTimestamp - oldestTimestamp);

    if (nowMs() - freshestTimestamp > config.staleWindowMs) {
      const denied = buildDeniedResponse(["stale_data"], newestDistance);
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const validAccuracySeeker = seekerSamplesAll.filter(
      (sample) => (sample.accuracyMeters ?? 0) <= config.maxValidAccuracyMeters
    );
    const validAccuracyHider = hiderSamplesAll.filter(
      (sample) => (sample.accuracyMeters ?? 0) <= config.maxValidAccuracyMeters
    );
    summaryBase.seekerValidSamples = validAccuracySeeker.length;
    summaryBase.hiderValidSamples = validAccuracyHider.length;

    if (validAccuracySeeker.length < minValidSamples || validAccuracyHider.length < minValidSamples) {
      const denied = buildDeniedResponse(["poor_accuracy", "insufficient_samples"], newestDistance);
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const seekerSpeedMultiplier = resolveSpeedMultiplier(activeSpeedRewards, seekerUserId);
    const hiderSpeedMultiplier = resolveSpeedMultiplier(activeSpeedRewards, hiderUserId);

    const movementReason =
      findMovementAnomaly(
        validAccuracySeeker.slice(0, 8),
        config.suspiciousSpeedMps * seekerSpeedMultiplier,
        config.impossibleSpeedMps * Math.min(1.5, seekerSpeedMultiplier)
      ) ??
      findMovementAnomaly(
        validAccuracyHider.slice(0, 8),
        config.suspiciousSpeedMps * hiderSpeedMultiplier,
        config.impossibleSpeedMps * Math.min(1.5, hiderSpeedMultiplier)
      );

    if (movementReason) {
      const denied = buildDeniedResponse([movementReason], newestDistance);
      await Promise.all([
        logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase }),
        logSuspiciousEvent({
          gameId,
          seekerUserId,
          hiderUserId,
          eventType: movementReason === "impossible_jump" ? "impossible_jump" : "suspicious_movement",
          reasons: denied.deniedReasons,
          summary: summaryBase
        })
      ]);
      return NextResponse.json(denied);
    }

    const windowStart = freshestTimestamp - holdWindowSeconds * 1000;
    const seekerWindow = withinWindow(validAccuracySeeker, windowStart);
    const hiderWindow = withinWindow(validAccuracyHider, windowStart);

    if (seekerWindow.length < minValidSamples || hiderWindow.length < minValidSamples) {
      const denied = buildDeniedResponse(["insufficient_samples"], newestDistance);
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const alignedPairs = buildTimeAlignedPairs({
      seekerSamples: seekerWindow,
      hiderSamples: hiderWindow,
      maxPairTimeDeltaMs: config.maxPairTimeDeltaMs
    });
    summaryBase.alignedPairCount = alignedPairs.length;
    summaryBase.maxPairTimeDeltaMs = alignedPairs.reduce((max, p) => Math.max(max, p.timeDeltaMs), 0);

    if (alignedPairs.length < minValidSamples) {
      const denied = buildDeniedResponse(["insufficient_samples"], newestDistance);
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const pairDistances = alignedPairs.map((pair) => haversineDistanceMeters(pair.seeker, pair.hider));
    summaryBase.minDistanceMeters = Math.round(Math.min(...pairDistances));
    summaryBase.maxDistanceMeters = Math.round(Math.max(...pairDistances));

    const inRadiusPairs = pairDistances.filter((distance) => distance <= captureRadiusMeters);
    summaryBase.inRadiusPairCount = inRadiusPairs.length;

    if (inRadiusPairs.length < minValidSamples) {
      const denied = buildDeniedResponse(["outside_radius"], newestDistance);
      await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: denied, summary: summaryBase });
      return NextResponse.json(denied);
    }

    const captured = {
      captured: true,
      distanceMeters: Math.round(newestDistance),
      clue: buildClue(newestDistance),
      nextRole: "spectator",
      deniedReasons: []
    } satisfies CaptureCheckResponse;

    await logCaptureAudit({ gameId, seekerUserId, hiderUserId, response: captured, summary: summaryBase });
    void sendPushToUsers({
      userIds: [seekerUserId, hiderUserId],
      title: "Capture Alert",
      body: "A capture has been confirmed in your game.",
      eventType: "capture_alert",
      gameId
    });
    return NextResponse.json(captured);
  } catch (error) {
    return NextResponse.json(
      {
        captured: false,
        deniedReasons: ["internal_error"],
        error: error instanceof Error ? error.message : "Capture validation failed"
      } satisfies CaptureCheckResponse & { error: string },
      { status: 500 }
    );
  }
}
