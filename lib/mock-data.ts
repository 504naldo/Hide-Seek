import { LeaderboardRow, Mission, PlayerLocation } from "./types";

export const missions: Mission[] = [
  { id: "m1", title: "Ride Line A to Central", difficulty: "medium", reward: "Reveal enemy zone", status: "available" },
  { id: "m2", title: "Visit City Hall", difficulty: "easy", reward: "+10m capture radius", status: "available" },
  { id: "m3", title: "Walk 1km", difficulty: "easy", reward: "Temporary GPS blur", status: "completed" }
];

export const locations: PlayerLocation[] = [
  { playerId: "seeker-1", lat: 40.73061, lng: -73.935242, updatedAt: new Date().toISOString() },
  { playerId: "hider-1", lat: 40.7323, lng: -73.937, updatedAt: new Date().toISOString() }
];

export const leaderboard: LeaderboardRow[] = [
  { player_id: "hider-1", distance_km: 8.2, missions_completed: 4, longest_survival_minutes: 103, captures: 0 },
  { player_id: "seeker-1", distance_km: 6.1, missions_completed: 3, longest_survival_minutes: 0, captures: 2 }
];
