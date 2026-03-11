"use client";

import { FormEvent, useState } from "react";

export default function JoinPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [gameName, setGameName] = useState("");
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleJoin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const userId = localStorage.getItem("userId");
      if (!userId) throw new Error("Please login first.");
      if (!inviteCode.trim()) throw new Error("Enter a valid invite code.");

      const response = await fetch("/api/game/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: inviteCode.trim(), userId })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to join game");

      localStorage.setItem("activeGameId", data.game.id);
      setStatus(`Joined ${data.game.name}`);
      window.location.href = `/game/${data.game.id}`;
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join game");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setStatus(null);

    try {
      const userId = localStorage.getItem("userId");
      if (!userId) throw new Error("Please login first.");
      if (!gameName.trim() || !city.trim()) throw new Error("Game name and city are required.");

      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostUserId: userId,
          name: gameName,
          city,
          boundaryGeoJson: { type: "Polygon", coordinates: [] },
          durationMinutes: 180
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to create game");

      localStorage.setItem("activeGameId", data.id);
      setStatus(`Created ${data.name} (${data.invite_code})`);
      window.location.href = `/game/${data.id}`;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create game");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>Join a Game</h1>

      <div className="card">
        <h3>Tester onboarding</h3>
        <ol>
          <li>Get invite code from host.</li>
          <li>Paste code and tap Join Session.</li>
          <li>On game page, allow location access.</li>
          <li>Enable notifications for event alerts.</li>
          <li>Wait for host to run preflight and start game.</li>
        </ol>
      </div>

      <form className="card grid" onSubmit={handleJoin}>
        <label>
          Invite code
          <input type="text" value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="SPY-92X" />
        </label>
        <button className="button" disabled={loading}>{loading ? "Working..." : "Join Session"}</button>
      </form>

      <form className="card grid" onSubmit={handleCreate}>
        <h3>Create game (hosts)</h3>
        <label>
          Game name
          <input type="text" value={gameName} onChange={(event) => setGameName(event.target.value)} placeholder="Night Chase" />
        </label>
        <label>
          City
          <input type="text" value={city} onChange={(event) => setCity(event.target.value)} placeholder="New York" />
        </label>
        <button className="button" disabled={loading}>{loading ? "Working..." : "Create Session"}</button>
      </form>

      {status ? <p className="card">{status}</p> : null}
      {error ? <p className="card" style={{ color: "var(--danger)" }}>{error}</p> : null}
    </main>
  );
}
