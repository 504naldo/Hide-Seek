import { GameRecord } from "@/lib/types";

export type GameLifecycleAction = "start" | "pause" | "resume" | "end";

const TRANSITIONS: Record<GameLifecycleAction, GameRecord["status"][]> = {
  start: ["pending"],
  pause: ["active"],
  resume: ["paused"],
  end: ["pending", "active", "paused"]
};

const NEXT_STATUS: Record<GameLifecycleAction, GameRecord["status"]> = {
  start: "active",
  pause: "paused",
  resume: "active",
  end: "ended"
};

export function canTransitionGameStatus(currentStatus: GameRecord["status"], action: GameLifecycleAction): boolean {
  return TRANSITIONS[action].includes(currentStatus);
}

export function getNextGameStatus(action: GameLifecycleAction): GameRecord["status"] {
  return NEXT_STATUS[action];
}
