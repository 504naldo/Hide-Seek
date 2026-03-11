"use client";

import { useEffect, useState } from "react";
import { LeaderboardRow } from "@/lib/types";

export default function StatsPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadLeaderboard() {
      try {
        const gameId = localStorage.getItem("activeGameId");
        if (!gameId) {
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/leaderboard?gameId=${gameId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Unable to load leaderboard");
        setRows(data.leaderboard);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to load leaderboard");
      } finally {
        setLoading(false);
      }
    }

    void loadLeaderboard();
  }, []);

  return (
    <main>
      <h1>Leaderboard</h1>
      <div className="card">
        {loading ? <p>Loading leaderboard…</p> : null}
        {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p>No stats yet for this game.</p> : null}
        {rows.map((row, index) => (
          <div key={row.player_id} style={{ borderBottom: "1px solid #2d3970", padding: "0.5rem 0" }}>
            <strong>
              #{index + 1} {row.player_id}
            </strong>
            <p>
              Distance {row.distance_km}km • Missions {row.missions_completed} • Survival {row.longest_survival_minutes}m • Captures {row.captures}
            </p>
          </div>
        ))}
      </div>
    </main>
  );
}
