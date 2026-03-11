import { restSelect } from "./supabase";

export interface CaptureValidationConfig {
  maxValidAccuracyMeters: number;
  staleWindowMs: number;
  defaultCaptureRadiusMeters: number;
  defaultHoldWindowSeconds: number;
  defaultMinValidSamples: number;
  suspiciousSpeedMps: number;
  impossibleSpeedMps: number;
  maxPairTimeDeltaMs: number;
}

type GameCaptureRuleRow = {
  capture_max_valid_accuracy_meters: number | null;
  capture_stale_window_ms: number | null;
  capture_radius_meters: number | null;
  capture_hold_window_seconds: number | null;
  capture_min_valid_samples: number | null;
  capture_suspicious_speed_mps: number | null;
  capture_impossible_speed_mps: number | null;
  capture_max_pair_time_delta_ms: number | null;
};

export const DEFAULT_CAPTURE_CONFIG: CaptureValidationConfig = {
  maxValidAccuracyMeters: 75,
  staleWindowMs: 60_000,
  defaultCaptureRadiusMeters: 50,
  defaultHoldWindowSeconds: 10,
  defaultMinValidSamples: 3,
  suspiciousSpeedMps: 22,
  impossibleSpeedMps: 60,
  maxPairTimeDeltaMs: 7_500
};

function normalizePositive(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return fallback;
  return value;
}

export async function resolveCaptureConfig(gameId: string): Promise<CaptureValidationConfig> {
  try {
    const rows = await restSelect<GameCaptureRuleRow>("games", {
      select:
        "capture_max_valid_accuracy_meters,capture_stale_window_ms,capture_radius_meters,capture_hold_window_seconds,capture_min_valid_samples,capture_suspicious_speed_mps,capture_impossible_speed_mps,capture_max_pair_time_delta_ms",
      eq: { id: gameId },
      limit: 1
    });

    const game = rows[0];
    if (!game) return DEFAULT_CAPTURE_CONFIG;

    return {
      maxValidAccuracyMeters: normalizePositive(game.capture_max_valid_accuracy_meters, DEFAULT_CAPTURE_CONFIG.maxValidAccuracyMeters),
      staleWindowMs: normalizePositive(game.capture_stale_window_ms, DEFAULT_CAPTURE_CONFIG.staleWindowMs),
      defaultCaptureRadiusMeters: normalizePositive(game.capture_radius_meters, DEFAULT_CAPTURE_CONFIG.defaultCaptureRadiusMeters),
      defaultHoldWindowSeconds: normalizePositive(game.capture_hold_window_seconds, DEFAULT_CAPTURE_CONFIG.defaultHoldWindowSeconds),
      defaultMinValidSamples: normalizePositive(game.capture_min_valid_samples, DEFAULT_CAPTURE_CONFIG.defaultMinValidSamples),
      suspiciousSpeedMps: normalizePositive(game.capture_suspicious_speed_mps, DEFAULT_CAPTURE_CONFIG.suspiciousSpeedMps),
      impossibleSpeedMps: normalizePositive(game.capture_impossible_speed_mps, DEFAULT_CAPTURE_CONFIG.impossibleSpeedMps),
      maxPairTimeDeltaMs: normalizePositive(game.capture_max_pair_time_delta_ms, DEFAULT_CAPTURE_CONFIG.maxPairTimeDeltaMs)
    };
  } catch {
    return DEFAULT_CAPTURE_CONFIG;
  }
}
