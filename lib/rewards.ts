import { Role } from "@/lib/types";

export type RewardType = "radar_ping" | "ghost_mode" | "speed_boost" | "false_signal";
export type RoleSuitability = "hider" | "seeker" | "both";

export interface RewardDefinition {
  reward_type: RewardType;
  role_suitability: RoleSuitability;
  duration_seconds: number;
  usable_until?: string | null;
  metadata: Record<string, unknown>;
  label?: string | null;
  description?: string | null;
}

export interface ActiveRewardRecord {
  id: string;
  game_id: string;
  mission_id: string | null;
  user_id: string;
  reward_type: RewardType;
  role_suitability: RoleSuitability;
  started_at: string;
  expires_at: string;
  metadata: Record<string, unknown> | null;
  label?: string | null;
  description?: string | null;
}

const DEFAULTS: Record<RewardType, RewardDefinition> = {
  radar_ping: {
    reward_type: "radar_ping",
    role_suitability: "seeker",
    duration_seconds: 45,
    metadata: {
      radius_meters: 350,
      reveal_duration_seconds: 45,
      clue_precision: 0.0025
    },
    label: "Radar Ping",
    description: "Briefly improves seeker clue precision for nearby hiders."
  },
  ghost_mode: {
    reward_type: "ghost_mode",
    role_suitability: "hider",
    duration_seconds: 40,
    metadata: {
      visibility_freeze: true,
      suppress_realtime_updates: true
    },
    label: "Ghost Mode",
    description: "Briefly freezes seeker-visible updates for your position."
  },
  speed_boost: {
    reward_type: "speed_boost",
    role_suitability: "both",
    duration_seconds: 35,
    metadata: {
      speed_multiplier: 1.35
    },
    label: "Speed Boost",
    description: "Temporarily raises movement threshold allowance."
  },
  false_signal: {
    reward_type: "false_signal",
    role_suitability: "hider",
    duration_seconds: 45,
    metadata: {
      offset_radius_meters: 120,
      clue_label: "Decoy Signal"
    },
    label: "False Signal",
    description: "Creates a short-lived decoy clue visible to seekers."
  }
};

function asNumber(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

export function isRewardType(input: string): input is RewardType {
  return input === "radar_ping" || input === "ghost_mode" || input === "speed_boost" || input === "false_signal";
}

export function validateRewardMetadata(type: RewardType, metadata: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const merged = { ...DEFAULTS[type].metadata, ...(metadata ?? {}) };

  if (type === "speed_boost") {
    const safeMultiplier = Math.min(1.8, Math.max(1.05, asNumber(merged.speed_multiplier, 1.35)));
    merged.speed_multiplier = safeMultiplier;
  }

  if (type === "radar_ping") {
    merged.radius_meters = Math.min(1000, Math.max(100, asNumber(merged.radius_meters, 350)));
    merged.reveal_duration_seconds = Math.min(120, Math.max(10, asNumber(merged.reveal_duration_seconds, 45)));
    merged.clue_precision = Math.min(0.01, Math.max(0.0005, asNumber(merged.clue_precision, 0.0025)));
  }

  if (type === "false_signal") {
    merged.offset_radius_meters = Math.min(300, Math.max(30, asNumber(merged.offset_radius_meters, 120)));
    if (typeof merged.clue_label !== "string" || !merged.clue_label.trim()) {
      merged.clue_label = "Decoy Signal";
    }
  }

  return merged;
}

export function normalizeRewardDefinition(raw: {
  reward_type?: string | null;
  reward_definition?: Record<string, unknown> | null;
  reward_value?: Record<string, unknown> | null;
}): RewardDefinition {
  const rawType = raw.reward_definition?.["reward_type"];
  const explicitType = typeof rawType === "string" ? rawType : raw.reward_type;
  const type: RewardType = isRewardType(String(explicitType ?? "")) ? (explicitType as RewardType) : "radar_ping";
  const base = DEFAULTS[type];
  const source = raw.reward_definition ?? {};

  const merged: RewardDefinition = {
    reward_type: type,
    role_suitability: source["role_suitability"] === "hider" || source["role_suitability"] === "seeker" || source["role_suitability"] === "both"
      ? (source["role_suitability"] as RoleSuitability)
      : base.role_suitability,
    duration_seconds: Math.min(180, Math.max(10, asNumber(source["duration_seconds"], base.duration_seconds))),
    usable_until: typeof source["usable_until"] === "string" ? (source["usable_until"] as string) : null,
    metadata: validateRewardMetadata(type, {
      ...(raw.reward_value ?? {}),
      ...(typeof source["metadata"] === "object" && source["metadata"] ? source["metadata"] as Record<string, unknown> : {})
    }),
    label: typeof source["label"] === "string" && (source["label"] as string).trim() ? (source["label"] as string) : base.label,
    description: typeof source["description"] === "string" && (source["description"] as string).trim() ? (source["description"] as string) : base.description
  };

  return merged;
}

export function rewardAppliesToRole(definition: RewardDefinition, role: Role | null): boolean {
  if (!role) return false;
  if (definition.role_suitability === "both") return role === "hider" || role === "seeker";
  return definition.role_suitability === role;
}

export function computeExpiry(startedAtIso: string, durationSeconds: number): string {
  return new Date(Date.parse(startedAtIso) + durationSeconds * 1000).toISOString();
}

export function isRewardActive(reward: Pick<ActiveRewardRecord, "started_at" | "expires_at">, nowMs = Date.now()): boolean {
  const starts = Date.parse(reward.started_at);
  const ends = Date.parse(reward.expires_at);
  if (Number.isNaN(starts) || Number.isNaN(ends)) return false;
  return starts <= nowMs && nowMs < ends;
}

export function resolveSpeedMultiplier(activeRewards: ActiveRewardRecord[], userId: string): number {
  const active = activeRewards.find((reward) => reward.user_id === userId && reward.reward_type === "speed_boost" && isRewardActive(reward));
  if (!active) return 1;
  const metadata = validateRewardMetadata("speed_boost", active.metadata);
  return Number(metadata.speed_multiplier ?? 1.35);
}

export function formatRewardDisplay(definition: RewardDefinition): string {
  const label = definition.label ?? definition.reward_type;
  return `${label} • ${definition.role_suitability} • ${definition.duration_seconds}s`;
}

export function approximateWithPrecision(value: number, precision: number): number {
  return Math.round(value / precision) * precision;
}


export interface RewardCooldownRecord {
  game_id: string;
  user_id: string;
  reward_type: RewardType;
  last_activated_at: string;
  cooldown_ends_at: string;
}

export interface InventoryBalanceRules {
  max_inventory_size: number;
  max_duplicates_per_type: number;
  cooldown_seconds: number;
}

export const DEFAULT_INVENTORY_BALANCE_RULES: InventoryBalanceRules = {
  max_inventory_size: 8,
  max_duplicates_per_type: 3,
  cooldown_seconds: 60
};

export function resolveInventoryBalanceRules(metadata: Record<string, unknown> | null | undefined): InventoryBalanceRules {
  return {
    max_inventory_size: Math.min(30, Math.max(1, asNumber(metadata?.max_inventory_size, DEFAULT_INVENTORY_BALANCE_RULES.max_inventory_size))),
    max_duplicates_per_type: Math.min(10, Math.max(1, asNumber(metadata?.max_duplicates_per_type, DEFAULT_INVENTORY_BALANCE_RULES.max_duplicates_per_type))),
    cooldown_seconds: Math.min(1800, Math.max(5, asNumber(metadata?.cooldown_seconds, DEFAULT_INVENTORY_BALANCE_RULES.cooldown_seconds)))
  };
}

export function computeCooldownEnds(expiresAtIso: string, cooldownSeconds: number): string {
  return new Date(Date.parse(expiresAtIso) + cooldownSeconds * 1000).toISOString();
}

export function isCooldownActive(cooldown: Pick<RewardCooldownRecord, "cooldown_ends_at">, nowMs = Date.now()): boolean {
  const ends = Date.parse(cooldown.cooldown_ends_at);
  if (Number.isNaN(ends)) return false;
  return nowMs < ends;
}
