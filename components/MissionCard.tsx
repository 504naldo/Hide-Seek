import { Mission } from "@/lib/types";

export function MissionCard({
  mission,
  onActivate,
  activateLabel = "Activate",
  activating = false
}: {
  mission: Mission;
  onActivate?: (missionId: string) => void;
  activateLabel?: string;
  activating?: boolean;
}) {
  const rewardDetails = mission.rewardDefinition;

  return (
    <article className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <h3>{mission.title}</h3>
        <span className="badge">{mission.status}</span>
      </div>
      {mission.description ? <p>{mission.description}</p> : null}
      <p>Difficulty: {mission.difficulty}</p>
      <p>Reward: {rewardDetails?.label ?? mission.reward}</p>
      {rewardDetails ? (
        <>
          <p>
            For: {rewardDetails.role_suitability} • Duration: {rewardDetails.duration_seconds}s
          </p>
          <p>{rewardDetails.description ?? "Tactical temporary advantage."}</p>
        </>
      ) : null}
      {mission.expiresAt ? <p>Mission expires: {new Date(mission.expiresAt).toLocaleString()}</p> : null}
      {onActivate && mission.status === "available" ? (
        <button className="button" onClick={() => onActivate(mission.id)} disabled={activating}>
          {activating ? "Working…" : activateLabel}
        </button>
      ) : null}
    </article>
  );
}
