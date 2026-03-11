export type Role = "hider" | "seeker" | "spectator";

export interface PlayerLocation {
  playerId: string;
  lat: number;
  lng: number;
  updatedAt: string;
  accuracyMeters?: number | null;
  isApproximate?: boolean;
}

export interface GeoJsonGeometry {
  type: "Point" | "Polygon";
  coordinates: number[] | number[][][];
}

export interface SafeZoneRecord {
  id: string;
  game_id?: string;
  name: string;
  geometry: GeoJsonGeometry;
  metadata?: Record<string, unknown> | null;
}


export type RewardType = "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
export type RoleSuitability = "hider" | "seeker" | "both";

export interface MissionRewardDefinition {
  reward_type: RewardType;
  role_suitability: RoleSuitability;
  duration_seconds: number;
  usable_until?: string | null;
  metadata: Record<string, unknown>;
  label?: string | null;
  description?: string | null;
}

export interface ActiveRewardState {
  id: string;
  game_id: string;
  mission_id: string | null;
  user_id: string;
  reward_type: RewardType;
  role_suitability: RoleSuitability;
  started_at: string;
  expires_at: string;
  metadata?: Record<string, unknown> | null;
  label?: string | null;
  description?: string | null;
}


export interface PlayerRewardRecord {
  id: string;
  game_id: string;
  user_id: string;
  reward_type: RewardType;
  metadata_json?: MissionRewardDefinition | Record<string, unknown> | null;
  earned_at: string;
  used_at?: string | null;
  expires_at?: string | null;
}


export interface PlayerRewardCooldownRecord {
  id?: string;
  game_id: string;
  user_id: string;
  reward_type: RewardType;
  last_activated_at: string;
  cooldown_ends_at: string;
}

export interface MissionZoneRecord {
  id: string;
  game_id?: string;
  title: string;
  description?: string | null;
  geometry: GeoJsonGeometry;
  reward_metadata?: Record<string, unknown> | null;
  expires_at?: string | null;
}

export interface Mission {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  description?: string | null;
  reward: string;
  rewardDefinition?: MissionRewardDefinition;
  expiresAt?: string | null;
  status: "available" | "completed" | "active";
}

export interface LeaderboardRow {
  player_id: string;
  distance_km: number;
  missions_completed: number;
  longest_survival_minutes: number;
  captures: number;
}

export interface GameRecord {
  id: string;
  name: string;
  city: string;
  invite_code: string;
  duration_minutes: number;
  reveal_interval_minutes: number;
  status: "pending" | "active" | "paused" | "ended";
  host_user_id?: string | null;
  boundary_geojson?: GeoJsonGeometry | null;
  capture_max_valid_accuracy_meters?: number | null;
  capture_stale_window_ms?: number | null;
  capture_radius_meters?: number | null;
  capture_hold_window_seconds?: number | null;
  capture_min_valid_samples?: number | null;
  capture_suspicious_speed_mps?: number | null;
  capture_impossible_speed_mps?: number | null;
  capture_max_pair_time_delta_ms?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
}

export interface ChatMessage {
  id: string;
  game_id: string;
  sender_user_id: string | null;
  channel: string;
  message: string;
  created_at: string;
}

export type CaptureDenyReasonCode =
  | "invalid_payload"
  | "poor_accuracy"
  | "insufficient_samples"
  | "outside_radius"
  | "stale_data"
  | "suspicious_movement"
  | "impossible_jump"
  | "internal_error";

export interface CaptureCheckResponse {
  captured: boolean;
  distanceMeters?: number;
  clue?: string;
  nextRole?: Role;
  deniedReasons: CaptureDenyReasonCode[];
}

export interface CaptureAuditSummary {
  seekerTotalSamples: number;
  hiderTotalSamples: number;
  seekerValidSamples: number;
  hiderValidSamples: number;
  holdWindowSeconds: number;
  holdWindowCoverageMs: number;
  alignedPairCount: number;
  inRadiusPairCount: number;
  maxPairTimeDeltaMs: number;
  minDistanceMeters: number | null;
  maxDistanceMeters: number | null;
  latestDistanceMeters: number | null;
}

export type SuspiciousEventType = "suspicious_movement" | "impossible_jump";


export interface SuspiciousEventRecord {
  id: string;
  game_id: string;
  seeker_user_id: string | null;
  hider_user_id: string | null;
  event_type: string;
  reasons: string[];
  metrics: Record<string, unknown>;
  created_at: string;
}

export interface CaptureAuditLogRecord {
  id: string;
  game_id: string;
  seeker_user_id: string;
  hider_user_id: string;
  decision: "captured" | "denied";
  denied_reasons: string[];
  metrics: Record<string, unknown>;
  evaluated_at: string;
}

export interface CaptureRecord {
  id: string;
  game_id: string;
  seeker_user_id: string;
  hider_user_id: string;
  capture_distance_meters: number | null;
  hold_time_seconds: number | null;
  captured_at: string;
}

export interface PlayerActivitySummary {
  user_id: string;
  role: Role;
  joined_at: string;
  last_location_at: string | null;
  last_chat_at: string | null;
  last_activity_at: string;
}


export type NotificationEventType =
  | "game_started"
  | "game_paused"
  | "game_resumed"
  | "mission_available"
  | "capture_alert"
  | "game_ended";

export interface PushSubscriptionRecord {
  id?: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string | null;
  created_at?: string;
  updated_at?: string;
}
