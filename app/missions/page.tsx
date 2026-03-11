"use client";

import { useEffect, useState } from "react";
import { MissionCard } from "@/components/MissionCard";
import { ActiveRewardState, Mission } from "@/lib/types";

type InventoryReward = {
  id: string;
  reward_type: string;
  earned_at: string;
  used_at: string | null;
  expires_at: string | null;
  cooldown_ends_at?: string | null;
  unavailable_reason?: "used" | "expired" | "active" | "cooldown" | null;
  reward_definition?: Mission["rewardDefinition"];
};

type CooldownRow = {
  id: string;
  reward_type: string;
  last_activated_at: string;
  cooldown_ends_at: string;
};

function unavailableLabel(reward: InventoryReward): string | null {
  if (!reward.unavailable_reason) return null;
  if (reward.unavailable_reason === "used") return "Already used";
  if (reward.unavailable_reason === "expired") return "Expired";
  if (reward.unavailable_reason === "active") return "Same reward type is currently active";
  if (reward.unavailable_reason === "cooldown") {
    return `On cooldown until ${reward.cooldown_ends_at ? new Date(reward.cooldown_ends_at).toLocaleTimeString() : "later"}`;
  }
  return "Unavailable";
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [inventory, setInventory] = useState<InventoryReward[]>([]);
  const [activeRewards, setActiveRewards] = useState<ActiveRewardState[]>([]);
  const [cooldowns, setCooldowns] = useState<CooldownRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const gameId = localStorage.getItem("activeGameId");
        if (!gameId) {
          setLoading(false);
          return;
        }

        const [missionsResponse, inventoryResponse] = await Promise.all([
          fetch(`/api/missions?gameId=${gameId}`),
          fetch(`/api/rewards/inventory?gameId=${gameId}`)
        ]);

        const missionsData = await missionsResponse.json();
        const inventoryData = await inventoryResponse.json();

        if (!missionsResponse.ok) throw new Error(missionsData.error ?? "Failed to load missions");
        if (!inventoryResponse.ok) throw new Error(inventoryData.error ?? "Failed to load reward inventory");

        const mapped: Mission[] = (missionsData.missions ?? []).map((mission: {
          id: string;
          title: string;
          description?: string | null;
          difficulty: "easy" | "medium" | "hard";
          reward: string;
          reward_definition?: Mission["rewardDefinition"];
          expires_at?: string | null;
        }) => ({
          id: mission.id,
          title: mission.title,
          description: mission.description ?? null,
          difficulty: mission.difficulty,
          reward: mission.reward,
          rewardDefinition: mission.reward_definition,
          expiresAt: mission.expires_at ?? null,
          status: "available"
        }));

        setMissions(mapped);
        setInventory(inventoryData.rewards ?? []);
        setActiveRewards(inventoryData.activeRewards ?? []);
        setCooldowns(inventoryData.cooldowns ?? []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load missions");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function completeMission(missionId: string) {
    setActioningId(missionId);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/missions/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to complete mission");

      setMissions((current) => current.map((mission) => mission.id === missionId ? { ...mission, status: "completed" } : mission));
      if (data.playerReward) {
        setInventory((current) => [data.playerReward, ...current]);
      }
      setStatus("Mission completed. Reward added to your inventory.");
    } catch (completionError) {
      setError(completionError instanceof Error ? completionError.message : "Unable to complete mission");
    } finally {
      setActioningId(null);
    }
  }

  async function activateInventoryReward(playerRewardId: string) {
    setActioningId(playerRewardId);
    setError(null);
    setStatus(null);

    try {
      const response = await fetch("/api/rewards/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerRewardId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to activate reward");

      setInventory((current) => current.map((reward) => reward.id === playerRewardId ? { ...reward, used_at: new Date().toISOString() } : reward));
      if (data.activation) {
        setActiveRewards((current) => [data.activation, ...current]);
      }
      if (data.cooldownEndsAt && data.activation?.reward_type) {
        setCooldowns((current) => {
          const remaining = current.filter((row) => row.reward_type !== data.activation.reward_type);
          return [{ id: `temp-${Date.now()}`, reward_type: data.activation.reward_type, last_activated_at: new Date().toISOString(), cooldown_ends_at: data.cooldownEndsAt }, ...remaining];
        });
      }
      setStatus("Reward activated. Tactical effect is now live.");
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Unable to activate reward");
    } finally {
      setActioningId(null);
    }
  }

  return (
    <main>
      <h1>Mission List</h1>
      {loading ? <div className="card">Loading missions…</div> : null}
      {status ? <div className="card">{status}</div> : null}
      {error ? <div className="card" style={{ color: "var(--danger)" }}>{error}</div> : null}

      {!loading && !error && missions.length === 0 ? <div className="card">No missions available.</div> : null}
      {missions.map((mission) => (
        <MissionCard
          key={mission.id}
          mission={mission}
          onActivate={completeMission}
          activateLabel="Complete Mission"
          activating={actioningId === mission.id}
        />
      ))}

      <section className="card">
        <h3>Active Rewards</h3>
        {activeRewards.filter((reward) => Date.parse(reward.expires_at) > Date.now()).length === 0 ? <p>No active rewards.</p> : null}
        <ul>
          {activeRewards
            .filter((reward) => Date.parse(reward.expires_at) > Date.now())
            .map((reward) => (
              <li key={reward.id}>
                <strong>{reward.label ?? reward.reward_type}</strong> • active until {new Date(reward.expires_at).toLocaleTimeString()}
              </li>
            ))}
        </ul>
      </section>

      <section className="card">
        <h3>Reward Inventory</h3>
        {inventory.length === 0 ? <p>No earned rewards yet. Complete missions to earn tactical rewards.</p> : null}
        <ul>
          {inventory.map((reward) => (
            <li key={reward.id} style={{ marginBottom: "0.7rem" }}>
              <strong>{reward.reward_definition?.label ?? reward.reward_type}</strong>
              <div>
                Earned: {new Date(reward.earned_at).toLocaleString()}
                {reward.expires_at ? ` • Expires: ${new Date(reward.expires_at).toLocaleString()}` : ""}
              </div>
              <div>{reward.reward_definition?.description ?? "Tactical temporary effect"}</div>
              {unavailableLabel(reward) ? <div className="badge">{unavailableLabel(reward)}</div> : null}
              {!reward.unavailable_reason ? (
                <button className="button" onClick={() => void activateInventoryReward(reward.id)} disabled={actioningId === reward.id}>
                  {actioningId === reward.id ? "Activating…" : "Activate Reward"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h3>Cooldowns</h3>
        {cooldowns.filter((cooldown) => Date.parse(cooldown.cooldown_ends_at) > Date.now()).length === 0 ? <p>No cooldowns active.</p> : null}
        <ul>
          {cooldowns
            .filter((cooldown) => Date.parse(cooldown.cooldown_ends_at) > Date.now())
            .map((cooldown) => (
              <li key={cooldown.id}>{cooldown.reward_type} available after {new Date(cooldown.cooldown_ends_at).toLocaleTimeString()}</li>
            ))}
        </ul>
      </section>
    </main>
  );
}
