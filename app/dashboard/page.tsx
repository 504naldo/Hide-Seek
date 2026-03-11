"use client";

import { useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { GameRecord } from "@/lib/types";

export default function DashboardPage() {
  const [game, setGame] = useState<GameRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadGame() {
      try {
        const userId = localStorage.getItem("userId");
        if (!userId) {
          setLoading(false);
          return;
        }

        const response = await fetch(`/api/game/active?userId=${encodeURIComponent(userId)}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to load game");
        }
        setGame(data.game);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load game");
      } finally {
        setLoading(false);
      }
    }

    void loadGame();
  }, []);

  return (
    <main>
      <h1>Mission Control</h1>

      <div className="card">
        <h3>Beta tester checklist</h3>
        <p>Before leaving this page, confirm these steps:</p>
        <ul>
          <li>Account is logged in on this device.</li>
          <li>You have an invite code from host.</li>
          <li>Location services are enabled for browser.</li>
          <li>Push notifications are enabled (recommended).</li>
        </ul>
      </div>

      <div className="grid two">
        <section className="card">
          <h3>Active game</h3>
          {loading ? <p>Loading active session…</p> : null}
          {error ? <p style={{ color: "var(--danger)" }}>{error}</p> : null}
          {!loading && !error && game ? (
            <>
              <p>
                {game.name} • {game.city}
              </p>
              <span className="badge">Invite code: {game.invite_code}</span>
            </>
          ) : null}
          {!loading && !error && !game ? <p>No joined game yet. Open Join Game and enter your invite code.</p> : null}
        </section>
        <section className="card">
          <h3>Your stats</h3>
          <p>Wins: tracked in leaderboard</p>
          <p>Captures: tracked in leaderboard</p>
          <p>Distance: tracked in leaderboard</p>
        </section>
      </div>
      <div className="card">
        <h3>Safety Controls</h3>
        <button className="button" style={{ background: "var(--danger)", color: "white" }}>
          Emergency Stop
        </button>
        <p>Immediately pauses tracking and alerts host/admin.</p>
      </div>
      <NavBar />
    </main>
  );
}
