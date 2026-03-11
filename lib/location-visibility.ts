import { ActiveRewardState, PlayerLocation, Role } from "./types";
import { haversineDistanceMeters } from "./game-logic";
import { approximateWithPrecision, isRewardActive, validateRewardMetadata } from "./rewards";

export const MAX_CAPTURE_READY_ACCURACY_METERS = 75;

export interface RawLocationSample {
  user_id: string;
  latitude: number;
  longitude: number;
  created_at: string;
  accuracy_meters?: number | null;
}

export function newestValidLocations(samples: RawLocationSample[]): PlayerLocation[] {
  const byPlayer = new Map<string, RawLocationSample>();

  for (const sample of samples) {
    if (sample.accuracy_meters && sample.accuracy_meters > MAX_CAPTURE_READY_ACCURACY_METERS) {
      continue;
    }

    const existing = byPlayer.get(sample.user_id);
    if (!existing || sample.created_at > existing.created_at) {
      byPlayer.set(sample.user_id, sample);
    }
  }

  return Array.from(byPlayer.values()).map((sample) => ({
    playerId: sample.user_id,
    lat: sample.latitude,
    lng: sample.longitude,
    updatedAt: sample.created_at,
    accuracyMeters: sample.accuracy_meters ?? null
  }));
}

function approximateCoordinate(value: number, clueGrid = 0.005): number {
  return approximateWithPrecision(value, clueGrid);
}

function activeRewardsForUser(activeRewards: ActiveRewardState[], userId: string) {
  return activeRewards.filter((reward) => reward.user_id === userId && isRewardActive(reward));
}

export function applyRoleVisibility({
  locations,
  playerRoles,
  currentUserId,
  currentUserRole,
  hostUserId,
  activeRewards = []
}: {
  locations: PlayerLocation[];
  playerRoles: Record<string, Role>;
  currentUserId: string | null;
  currentUserRole: Role | null;
  hostUserId: string | null;
  activeRewards?: ActiveRewardState[];
}): PlayerLocation[] {
  if (!currentUserId || !currentUserRole) return [];
  if (hostUserId && currentUserId === hostUserId) return locations;

  if (currentUserRole === "hider") {
    return locations.filter((location) => location.playerId === currentUserId);
  }

  if (currentUserRole === "seeker") {
    const seekerRewards = activeRewardsForUser(activeRewards, currentUserId);
    const radar = seekerRewards.find((reward) => reward.reward_type === "radar_ping");
    const radarMetadata = radar ? validateRewardMetadata("radar_ping", radar.metadata ?? {}) : null;
    const defaultGrid = 0.005;
    const clueGrid = Number(radarMetadata?.clue_precision ?? defaultGrid);
    const radarRadius = Number(radarMetadata?.radius_meters ?? 350);
    const seekerLocation = locations.find((location) => location.playerId === currentUserId) ?? null;

    const withHiderVisibility = locations.map((location) => {
      const role = playerRoles[location.playerId] ?? "spectator";
      if (role !== "hider") return location;

      const hiderRewards = activeRewardsForUser(activeRewards, location.playerId);
      const ghost = hiderRewards.find((reward) => reward.reward_type === "ghost_mode");
      const ghostMetadata = ghost ? validateRewardMetadata("ghost_mode", ghost.metadata ?? {}) : null;

      const freeze = Boolean(ghostMetadata?.visibility_freeze);
      const frozenLat = Number(ghostMetadata?.frozen_lat ?? location.lat);
      const frozenLng = Number(ghostMetadata?.frozen_lng ?? location.lng);
      const sourceLat = freeze ? frozenLat : location.lat;
      const sourceLng = freeze ? frozenLng : location.lng;

      const distanceFromSeeker = seekerLocation
        ? haversineDistanceMeters(
            { playerId: currentUserId, lat: seekerLocation.lat, lng: seekerLocation.lng, updatedAt: seekerLocation.updatedAt },
            { playerId: location.playerId, lat: sourceLat, lng: sourceLng, updatedAt: location.updatedAt }
          )
        : Number.POSITIVE_INFINITY;
      const effectiveGrid = radar && distanceFromSeeker <= radarRadius ? clueGrid : defaultGrid;

      return {
        ...location,
        lat: approximateCoordinate(sourceLat, effectiveGrid),
        lng: approximateCoordinate(sourceLng, effectiveGrid),
        isApproximate: true
      };
    });

    const decoys = activeRewards
      .filter((reward) => reward.reward_type === "false_signal" && isRewardActive(reward))
      .map((reward) => {
        const metadata = validateRewardMetadata("false_signal", reward.metadata ?? {});
        const decoyLat = Number(metadata.decoy_lat);
        const decoyLng = Number(metadata.decoy_lng);
        if (!Number.isFinite(decoyLat) || !Number.isFinite(decoyLng)) return null;

        return {
          playerId: `decoy-${reward.id}`,
          lat: approximateCoordinate(decoyLat, clueGrid),
          lng: approximateCoordinate(decoyLng, clueGrid),
          updatedAt: reward.started_at,
          isApproximate: true,
          accuracyMeters: null
        } satisfies PlayerLocation;
      })
      .filter((item): item is PlayerLocation => Boolean(item));

    return [...withHiderVisibility, ...decoys];
  }

  return locations;
}
