import { PlayerLocation } from "./types";

const EARTH_RADIUS_M = 6371000;

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineDistanceMeters(a: PlayerLocation, b: PlayerLocation): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function isCaptureConfirmed({
  seeker,
  hider,
  captureRadiusMeters,
  holdTimeSeconds,
  samples
}: {
  seeker: PlayerLocation;
  hider: PlayerLocation;
  captureRadiusMeters: number;
  holdTimeSeconds: number;
  samples: Array<{ seeker: PlayerLocation; hider: PlayerLocation }>;
}): boolean {
  const withinRadiusNow = haversineDistanceMeters(seeker, hider) <= captureRadiusMeters;
  if (!withinRadiusNow || samples.length < holdTimeSeconds) return false;

  const recent = samples.slice(-holdTimeSeconds);
  return recent.every((sample) => haversineDistanceMeters(sample.seeker, sample.hider) <= captureRadiusMeters);
}

export function buildClue(distanceMeters: number): string {
  if (distanceMeters < 200) return "Target is in your immediate area.";
  if (distanceMeters < 800) return "Target is within a short walk.";
  if (distanceMeters < 2500) return "Target is likely in a nearby district.";
  return "Target is far away—consider transport and route planning.";
}
