"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { MapPanel } from "@/components/MapPanel";
import { ZoneAuthoringMap } from "@/components/ZoneAuthoringMap";
import { NavBar } from "@/components/NavBar";
import { newestValidLocations } from "@/lib/location-visibility";
import { ActiveRewardState, CaptureAuditLogRecord, CaptureRecord, GameRecord, GeoJsonGeometry, MissionZoneRecord, PlayerActivitySummary, PlayerLocation, Role, SafeZoneRecord, SuspiciousEventRecord } from "@/lib/types";

const TRACK_INTERVAL_MS = 15000;

type ZoneOverlay = {
  id: string;
  type: "point" | "polygon";
  center?: [number, number];
  polygon?: [number, number][];
};

function toZoneOverlay(id: string, geometry: GeoJsonGeometry): ZoneOverlay | null {
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
    const [lng, lat] = geometry.coordinates as number[];
    return { id, type: "point", center: [lng, lat] };
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    const firstRing = geometry.coordinates[0] as number[][];
    const polygon = firstRing
      .filter((coord) => Array.isArray(coord) && coord.length >= 2)
      .map((coord) => [coord[0], coord[1]] as [number, number]);

    if (polygon.length >= 3) {
      return { id, type: "polygon", polygon };
    }
  }

  return null;
}

export default function GamePage({ params }: { params: { gameId: string } }) {
  const [locations, setLocations] = useState<PlayerLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<Role | null>(null);
  const [hostUserId, setHostUserId] = useState<string | null>(null);
  const [gameStatus, setGameStatus] = useState<GameRecord["status"] | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [preflightChecks, setPreflightChecks] = useState({
    inviteShared: false,
    rolesChecked: false,
    locationReady: false,
    notificationsPrompted: false
  });

  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [suspiciousEvents, setSuspiciousEvents] = useState<SuspiciousEventRecord[]>([]);
  const [captureAudits, setCaptureAudits] = useState<CaptureAuditLogRecord[]>([]);
  const [recentCaptures, setRecentCaptures] = useState<CaptureRecord[]>([]);
  const [playerActivity, setPlayerActivity] = useState<PlayerActivitySummary[]>([]);
  const [playerRoles, setPlayerRoles] = useState<Record<string, Role>>({});
  const [activeRewards, setActiveRewards] = useState<ActiveRewardState[]>([]);
  const [safeZones, setSafeZones] = useState<ZoneOverlay[]>([]);
  const [missionZones, setMissionZones] = useState<ZoneOverlay[]>([]);
  const [safeZoneRows, setSafeZoneRows] = useState<SafeZoneRecord[]>([]);
  const [missionZoneRows, setMissionZoneRows] = useState<MissionZoneRecord[]>([]);
  const [gameBoundary, setGameBoundary] = useState<{ type: "Polygon"; coordinates: [number, number][][] } | undefined>(undefined);
  const [safeName, setSafeName] = useState("");
  const [safeGeometry, setSafeGeometry] = useState('{"type":"Point","coordinates":[-73.9437,40.7325]}');
  const [missionTitle, setMissionTitle] = useState("");
  const [missionDescription, setMissionDescription] = useState("");
  const [missionGeometry, setMissionGeometry] = useState('{"type":"Point","coordinates":[-73.9392,40.7288]}');
  const [missionRewardMetadata, setMissionRewardMetadata] = useState('{"reward":"reveal_enemy_zone"}');
  const [missionExpiresAt, setMissionExpiresAt] = useState("");
  const [safeMetadata, setSafeMetadata] = useState("{}");
  const [safeDraftGeometry, setSafeDraftGeometry] = useState<GeoJsonGeometry | null>(JSON.parse('{"type":"Point","coordinates":[-73.9437,40.7325]}'));
  const [missionDraftGeometry, setMissionDraftGeometry] = useState<GeoJsonGeometry | null>(JSON.parse('{"type":"Point","coordinates":[-73.9392,40.7288]}'));
  const [safeDraftMode, setSafeDraftMode] = useState<"point" | "polygon">("point");
  const [missionDraftMode, setMissionDraftMode] = useState<"point" | "polygon">("point");
  const [editingSafeZoneId, setEditingSafeZoneId] = useState<string | null>(null);
  const [editingMissionZoneId, setEditingMissionZoneId] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);

  const isHost = !!userId && !!hostUserId && userId === hostUserId;
  const preflightComplete = Object.values(preflightChecks).every(Boolean);

  const loadLocations = useCallback(async () => {
    try {
      const response = await fetch(`/api/locations?gameId=${params.gameId}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load locations");

      setLocations(newestValidLocations(data.updates ?? []));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load locations");
    } finally {
      setLoading(false);
    }
  }, [params.gameId]);

  const loadVisibilityContext = useCallback(async (activeUserId: string) => {
    try {
      const [activeResponse, playersResponse] = await Promise.all([
        fetch(`/api/game/active?userId=${encodeURIComponent(activeUserId)}`),
        fetch(`/api/game/players?gameId=${encodeURIComponent(params.gameId)}`)
      ]);

      const activeData = (await activeResponse.json()) as { game?: GameRecord | null; role?: Role | null };
      const playersData = await playersResponse.json();

      if (activeResponse.ok) {
        setCurrentRole(activeData.role ?? null);
        setHostUserId(activeData.game?.host_user_id ?? null);
        setGameStatus(activeData.game?.status ?? null);

        const boundary = activeData.game?.boundary_geojson;
        if (boundary && boundary.type === "Polygon") {
          setGameBoundary(boundary as { type: "Polygon"; coordinates: [number, number][][] });
        }
      }

      if (playersResponse.ok) {
        const roleMap: Record<string, Role> = {};
        (playersData.players ?? []).forEach((player: { user_id: string; role: Role }) => {
          roleMap[player.user_id] = player.role;
        });
        setPlayerRoles(roleMap);
      }
    } catch {
      // keep fallback defaults
    }
  }, [params.gameId]);



  const loadActiveRewards = useCallback(async () => {
    try {
      const response = await fetch(`/api/missions/active?gameId=${encodeURIComponent(params.gameId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Unable to load active rewards");
      setActiveRewards(data.activeRewards ?? []);
    } catch (rewardError) {
      setError(rewardError instanceof Error ? rewardError.message : "Unable to load active rewards");
    }
  }, [params.gameId]);

  const loadMonitoringData = useCallback(async () => {
    if (!isHost) {
      setSuspiciousEvents([]);
      setCaptureAudits([]);
      setRecentCaptures([]);
      setPlayerActivity([]);
      return;
    }

    try {
      setMonitoringLoading(true);
      const [suspiciousResponse, auditsResponse, capturesResponse, activityResponse] = await Promise.all([
        fetch(`/api/game/monitoring/suspicious?gameId=${encodeURIComponent(params.gameId)}&limit=10`),
        fetch(`/api/game/monitoring/capture-audits?gameId=${encodeURIComponent(params.gameId)}&limit=20`),
        fetch(`/api/game/monitoring/captures?gameId=${encodeURIComponent(params.gameId)}&limit=10`),
        fetch(`/api/game/monitoring/player-activity?gameId=${encodeURIComponent(params.gameId)}&limit=50`)
      ]);

      const [suspiciousData, auditsData, capturesData, activityData] = await Promise.all([
        suspiciousResponse.json(),
        auditsResponse.json(),
        capturesResponse.json(),
        activityResponse.json()
      ]);

      if (!suspiciousResponse.ok) throw new Error(suspiciousData.error ?? "Unable to load suspicious events");
      if (!auditsResponse.ok) throw new Error(auditsData.error ?? "Unable to load capture audits");
      if (!capturesResponse.ok) throw new Error(capturesData.error ?? "Unable to load captures");
      if (!activityResponse.ok) throw new Error(activityData.error ?? "Unable to load player activity");

      setSuspiciousEvents(suspiciousData.events ?? []);
      setCaptureAudits(auditsData.audits ?? []);
      setRecentCaptures(capturesData.captures ?? []);
      setPlayerActivity(activityData.players ?? []);
    } catch (monitoringError) {
      setError(monitoringError instanceof Error ? monitoringError.message : "Unable to load host monitoring panel");
    } finally {
      setMonitoringLoading(false);
    }
  }, [isHost, params.gameId]);

  const loadZones = useCallback(async () => {
    try {
      const response = await fetch(`/api/zones?gameId=${encodeURIComponent(params.gameId)}`);
      const data = (await response.json()) as { safeZones?: SafeZoneRecord[]; missionZones?: MissionZoneRecord[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to load zones");

      const safeRows = data.safeZones ?? [];
      const missionRows = (data.missionZones ?? []).filter((zone) => !zone.expires_at || Date.parse(zone.expires_at) > Date.now());
      setSafeZoneRows(safeRows);
      setMissionZoneRows(missionRows);

      const loadedSafe = safeRows
        .map((zone) => toZoneOverlay(zone.id, zone.geometry))
        .filter((zone): zone is ZoneOverlay => zone !== null);

      const loadedMission = missionRows
        .map((zone) => toZoneOverlay(zone.id, zone.geometry))
        .filter((zone): zone is ZoneOverlay => zone !== null);

      setSafeZones(loadedSafe);
      setMissionZones(loadedMission);
    } catch (zoneError) {
      setError(zoneError instanceof Error ? zoneError.message : "Unable to load zones");
    }
  }, [params.gameId]);

  const postLocation = useCallback(async (position: GeolocationPosition, force = false) => {
    const now = Date.now();
    if (!force && now - lastSentAtRef.current < TRACK_INTERVAL_MS) {
      return;
    }

    const activeUserId = localStorage.getItem("userId");
    if (!activeUserId) {
      setError("Please login first.");
      return;
    }

    const response = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameId: params.gameId,
        userId: activeUserId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        timestamp: new Date(position.timestamp).toISOString()
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error ?? "Unable to post location");
    }

    lastSentAtRef.current = now;
  }, [params.gameId]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setError("Geolocation is unavailable.");
      return;
    }

    if (watchIdRef.current !== null) {
      return;
    }

    const id = navigator.geolocation.watchPosition(
      async (position) => {
        try {
          setError(null);
          await postLocation(position);
        } catch (trackingError) {
          setError(trackingError instanceof Error ? trackingError.message : "Unable to post location");
        }
      },
      (geoError) => {
        if (geoError.code === geoError.PERMISSION_DENIED) {
          setError("Location permission denied. Enable location access to track your game progress.");
          stopTracking();
          return;
        }

        if (geoError.code === geoError.POSITION_UNAVAILABLE) {
          setError("Location unavailable. Check GPS signal and try again.");
          return;
        }

        if (geoError.code === geoError.TIMEOUT) {
          setError("Location request timed out. Tracking will retry automatically.");
          return;
        }

        setError(geoError.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 20000
      }
    );

    watchIdRef.current = id;
  }, [postLocation, stopTracking]);

  useEffect(() => {
    const activeUserId = localStorage.getItem("userId");
    if (!activeUserId) {
      setError("Please login first.");
      setLoading(false);
      return;
    }

    setUserId(activeUserId);
    void Promise.all([loadLocations(), loadVisibilityContext(activeUserId), loadZones(), loadActiveRewards()]);
  }, [loadActiveRewards, loadLocations, loadVisibilityContext, loadZones]);

  useEffect(() => {
    if (!isHost) return;
    void loadMonitoringData();
  }, [isHost, loadMonitoringData]);

  useEffect(() => {
    if (!userId) return;

    startTracking();

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        stopTracking();
      } else {
        startTracking();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      stopTracking();
    };
  }, [userId, startTracking, stopTracking]);


  function geometryForMode(geometry: GeoJsonGeometry | null, mode: "point" | "polygon", fallback: [number, number]): GeoJsonGeometry {
    if (geometry) {
      if (mode === "point" && geometry.type === "Point") return geometry;
      if (mode === "polygon" && geometry.type === "Polygon") return geometry;
    }

    if (mode === "point") {
      return { type: "Point", coordinates: fallback };
    }

    const [lng, lat] = fallback;
    return {
      type: "Polygon",
      coordinates: [[[lng, lat], [lng + 0.0015, lat], [lng + 0.001, lat + 0.0015], [lng, lat]]]
    };
  }

  async function sendLocation() {
    try {
      setError(null);
      if (!navigator.geolocation) throw new Error("Geolocation is unavailable.");

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            await postLocation(position, true);
            await loadLocations();
          } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Unable to post location");
          }
        },
        (geoError) => setError(geoError.message)
      );
    } catch (locationError) {
      setError(locationError instanceof Error ? locationError.message : "Unable to post location");
    }
  }

  async function createSafeZone(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;

    try {
      const geometry = safeDraftGeometry ?? JSON.parse(safeGeometry);
      const metadata = safeMetadata.trim() ? JSON.parse(safeMetadata) : null;
      const response = await fetch("/api/zones/safe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: params.gameId, name: safeName, geometry, metadata })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create safe zone");
      setSafeName("");
      await loadZones();
    } catch (zoneError) {
      setError(zoneError instanceof Error ? zoneError.message : "Failed to create safe zone");
    }
  }

  async function createMissionZone(event: FormEvent) {
    event.preventDefault();
    if (!userId) return;

    try {
      const geometry = missionDraftGeometry ?? JSON.parse(missionGeometry);
      const rewardMetadata = missionRewardMetadata.trim() ? JSON.parse(missionRewardMetadata) : null;
      const response = await fetch("/api/zones/mission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: params.gameId,
          title: missionTitle,
          description: missionDescription,
          geometry,
          rewardMetadata,
          expiresAt: missionExpiresAt ? new Date(missionExpiresAt).toISOString() : null
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to create mission zone");
      setMissionTitle("");
      setMissionDescription("");
      await loadZones();
    } catch (zoneError) {
      setError(zoneError instanceof Error ? zoneError.message : "Failed to create mission zone");
    }
  }


  function beginEditSafeZone(zone: SafeZoneRecord) {
    setEditingSafeZoneId(zone.id);
    setSafeName(zone.name);
    setSafeMetadata(JSON.stringify(zone.metadata ?? {}, null, 2));
    setSafeDraftGeometry(zone.geometry);
    setSafeDraftMode(zone.geometry.type === "Polygon" ? "polygon" : "point");
  }

  async function saveSafeZoneEdit() {
    if (!editingSafeZoneId) return;
    const response = await fetch(`/api/zones/safe/${editingSafeZoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: safeName,
        metadata: safeMetadata.trim() ? JSON.parse(safeMetadata) : null,
        geometry: safeDraftGeometry
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to update safe zone");
    setEditingSafeZoneId(null);
    await loadZones();
  }

  function beginEditMissionZone(zone: MissionZoneRecord) {
    setEditingMissionZoneId(zone.id);
    setMissionTitle(zone.title);
    setMissionDescription(zone.description ?? "");
    setMissionRewardMetadata(JSON.stringify(zone.reward_metadata ?? {}, null, 2));
    setMissionExpiresAt(zone.expires_at ? zone.expires_at.slice(0, 16) : "");
    setMissionDraftGeometry(zone.geometry);
    setMissionDraftMode(zone.geometry.type === "Polygon" ? "polygon" : "point");
  }

  async function saveMissionZoneEdit() {
    if (!editingMissionZoneId) return;
    const response = await fetch(`/api/zones/mission/${editingMissionZoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: missionTitle,
        description: missionDescription,
        rewardMetadata: missionRewardMetadata.trim() ? JSON.parse(missionRewardMetadata) : null,
        expiresAt: missionExpiresAt ? new Date(missionExpiresAt).toISOString() : null,
        geometry: missionDraftGeometry
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to update mission zone");
    setEditingMissionZoneId(null);
    await loadZones();
  }

  async function deleteSafeZone(zoneId: string) {
    if (!userId) return;
    const response = await fetch(`/api/zones/safe/${zoneId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to delete safe zone");
    await loadZones();
  }


  async function runLifecycleAction(action: "start" | "pause" | "resume" | "end") {
    if (!isHost || lifecycleLoading) return;

    try {
      setLifecycleLoading(true);
      setError(null);
      const response = await fetch(`/api/game/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: params.gameId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? `Failed to ${action} game`);
      setGameStatus(data.game?.status ?? gameStatus);
      await Promise.all([loadMonitoringData(), loadActiveRewards()]);
    } catch (lifecycleError) {
      setError(lifecycleError instanceof Error ? lifecycleError.message : "Failed to update game status");
    } finally {
      setLifecycleLoading(false);
    }
  }

  async function deleteMissionZone(zoneId: string) {
    if (!userId) return;
    const response = await fetch(`/api/zones/mission/${zoneId}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Failed to delete mission zone");
    await loadZones();
  }

  return (
    <main>
      <h1>Game Session: {params.gameId}</h1>
      <div className="card">
        <h3>Playtest onboarding</h3>
        <ul>
          <li>Allow location permission to stream your position.</li>
          <li>Enable notifications for missions and capture alerts.</li>
          <li>Join by invite code from host before match starts.</li>
          <li>Host should run preflight checklist before pressing start.</li>
        </ul>
      </div>

      <div className="card">
        <p>Role: {currentRole ?? "Unknown"}</p>
        <p>Capture radius: 50m (hold 10s)</p>
        <p>Next clue reveal: every 30 min</p>
        <button className="button" onClick={sendLocation}>Send current location</button>
      </div>
      {loading ? <div className="card">Loading map data…</div> : null}
      {error ? <div className="card" style={{ color: "var(--danger)" }}>{error}</div> : null}
      {!loading && !error ? (
        <MapPanel
          locations={locations}
          gameId={params.gameId}
          currentUserId={userId}
          currentUserRole={currentRole}
          hostUserId={hostUserId}
          playerRoles={playerRoles}
          safeZones={safeZones}
          missionZones={missionZones}
          gameBoundary={gameBoundary}
          activeRewards={activeRewards}
        />
      ) : null}

      {isHost ? (
        <>

          <div className="card">
            <h3>Host Preflight Checklist</h3>
            <p>Complete these before starting first playtest rounds:</p>
            <label><input type="checkbox" checked={preflightChecks.inviteShared} onChange={(event) => setPreflightChecks((c) => ({ ...c, inviteShared: event.target.checked }))} /> Invite code shared with all testers</label>
            <label><input type="checkbox" checked={preflightChecks.rolesChecked} onChange={(event) => setPreflightChecks((c) => ({ ...c, rolesChecked: event.target.checked }))} /> Team roles reviewed (hiders/seekers)</label>
            <label><input type="checkbox" checked={preflightChecks.locationReady} onChange={(event) => setPreflightChecks((c) => ({ ...c, locationReady: event.target.checked }))} /> Everyone has location permission enabled</label>
            <label><input type="checkbox" checked={preflightChecks.notificationsPrompted} onChange={(event) => setPreflightChecks((c) => ({ ...c, notificationsPrompted: event.target.checked }))} /> Notification opt-in prompt completed</label>
            <p className="badge">{preflightComplete ? "Preflight complete" : "Preflight incomplete"}</p>
          </div>

          <div className="card">
            <h3>Host Game Controls</h3>
            <p>Current status: {gameStatus ?? "unknown"}</p>
            <div className="grid">
              <button className="button" disabled={lifecycleLoading || gameStatus !== "pending" || !preflightComplete} onClick={() => void runLifecycleAction("start")}>Start Game</button>
              <button className="button" disabled={lifecycleLoading || gameStatus !== "active"} onClick={() => void runLifecycleAction("pause")}>Pause Game</button>
              <button className="button" disabled={lifecycleLoading || gameStatus !== "paused"} onClick={() => void runLifecycleAction("resume")}>Resume Game</button>
              <button className="button" disabled={lifecycleLoading || gameStatus === "ended"} onClick={() => void runLifecycleAction("end")}>End Game</button>
            </div>
          </div>


          <div className="card">
            <h3>Host Operations Panel</h3>
            <p>Current status: {gameStatus ?? "unknown"}</p>
            {monitoringLoading ? <p>Loading monitoring data…</p> : null}
            <p>Recent suspicious events: {suspiciousEvents.length}</p>
            {suspiciousEvents.slice(0, 5).map((event) => (
              <div key={event.id} style={{ marginTop: "0.4rem" }}>
                <strong>{event.event_type}</strong> · {new Date(event.created_at).toLocaleTimeString()}
                <div>Reasons: {(event.reasons ?? []).join(", ") || "none"}</div>
              </div>
            ))}

            <p style={{ marginTop: "0.8rem" }}>Recent denied capture reasons:</p>
            {captureAudits.filter((audit) => audit.decision === "denied").slice(0, 5).map((audit) => (
              <div key={audit.id} style={{ marginTop: "0.35rem" }}>
                <span>{new Date(audit.evaluated_at).toLocaleTimeString()} — {(audit.denied_reasons ?? []).join(", ") || "none"}</span>
              </div>
            ))}

            <p style={{ marginTop: "0.8rem" }}>Recent successful captures: {recentCaptures.length}</p>
            {recentCaptures.slice(0, 5).map((capture) => (
              <div key={capture.id} style={{ marginTop: "0.35rem" }}>
                <span>{new Date(capture.captured_at).toLocaleTimeString()} — seeker {capture.seeker_user_id.slice(0, 8)} captured hider {capture.hider_user_id.slice(0, 8)}</span>
              </div>
            ))}

            <p style={{ marginTop: "0.8rem" }}>Player activity freshness:</p>
            {playerActivity.slice(0, 8).map((player) => (
              <div key={player.user_id} style={{ marginTop: "0.35rem" }}>
                <span>{player.role} · {player.user_id.slice(0, 8)} · last activity {new Date(player.last_activity_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Host Zone Management</h3>
            <form className="grid" onSubmit={createSafeZone}>
              <label>
                Safe zone name
                <input value={safeName} onChange={(event) => setSafeName(event.target.value)} placeholder="Library Safe Zone" />
              </label>
              <label>
                Safe zone GeoJSON
                <textarea value={safeGeometry} onChange={(event) => {
                  setSafeGeometry(event.target.value);
                  try { setSafeDraftGeometry(JSON.parse(event.target.value)); } catch { }
                }} rows={3} />
              </label>
              <label>
                Safe metadata JSON
                <textarea value={safeMetadata} onChange={(event) => setSafeMetadata(event.target.value)} rows={2} />
              </label>
              <div>
                <button type="button" className="button" onClick={() => {
                  const g = geometryForMode(safeDraftGeometry, "point", [-73.9437, 40.7325]);
                  setSafeDraftMode("point");
                  setSafeDraftGeometry(g.type === "Point" ? g : { type: "Point", coordinates: [-73.9437, 40.7325] });
                }}>Point Mode</button>
                <button type="button" className="button" onClick={() => {
                  const g = geometryForMode(safeDraftGeometry, "polygon", [-73.9437, 40.7325]);
                  setSafeDraftMode("polygon");
                  setSafeDraftGeometry(g.type === "Polygon" ? g : g);
                }}>Polygon Mode</button>
              </div>
              <ZoneAuthoringMap
                mode={safeDraftMode}
                geometry={safeDraftGeometry}
                onGeometryChange={(next) => {
                  setSafeDraftGeometry(next);
                  setSafeGeometry(JSON.stringify(next));
                }}
              />
              <button className="button">Create Safe Zone</button>
              {editingSafeZoneId ? <button type="button" className="button" onClick={() => void saveSafeZoneEdit()}>Save Safe Zone Edit</button> : null}
            </form>
            {safeZoneRows.map((zone) => (
              <div key={zone.id} style={{ marginTop: "0.6rem" }}>
                <span>{zone.name}</span>
                <button className="button" style={{ marginTop: "0.4rem" }} onClick={() => beginEditSafeZone(zone)}>Edit</button>
                <button className="button" style={{ marginTop: "0.4rem" }} onClick={() => void deleteSafeZone(zone.id)}>Delete</button>
              </div>
            ))}
          </div>

          <div className="card">
            <form className="grid" onSubmit={createMissionZone}>
              <label>
                Mission zone title
                <input value={missionTitle} onChange={(event) => setMissionTitle(event.target.value)} placeholder="Checkpoint Alpha" />
              </label>
              <label>
                Mission description
                <input value={missionDescription} onChange={(event) => setMissionDescription(event.target.value)} placeholder="Reach this landmark" />
              </label>
              <label>
                Mission zone GeoJSON
                <textarea value={missionGeometry} onChange={(event) => {
                  setMissionGeometry(event.target.value);
                  try { setMissionDraftGeometry(JSON.parse(event.target.value)); } catch { }
                }} rows={3} />
              </label>
              <label>
                Reward metadata JSON
                <textarea value={missionRewardMetadata} onChange={(event) => setMissionRewardMetadata(event.target.value)} rows={2} />
              </label>
              <label>
                Expires at
                <input type="datetime-local" value={missionExpiresAt} onChange={(event) => setMissionExpiresAt(event.target.value)} />
              </label>
              <div>
                <button type="button" className="button" onClick={() => {
                  const g = geometryForMode(missionDraftGeometry, "point", [-73.9392, 40.7288]);
                  setMissionDraftMode("point");
                  setMissionDraftGeometry(g.type === "Point" ? g : { type: "Point", coordinates: [-73.9392, 40.7288] });
                }}>Point Mode</button>
                <button type="button" className="button" onClick={() => {
                  const g = geometryForMode(missionDraftGeometry, "polygon", [-73.9392, 40.7288]);
                  setMissionDraftMode("polygon");
                  setMissionDraftGeometry(g.type === "Polygon" ? g : g);
                }}>Polygon Mode</button>
              </div>
              <ZoneAuthoringMap
                mode={missionDraftMode}
                geometry={missionDraftGeometry}
                onGeometryChange={(next) => {
                  setMissionDraftGeometry(next);
                  setMissionGeometry(JSON.stringify(next));
                }}
              />
              <button className="button">Create Mission Zone</button>
              {editingMissionZoneId ? <button type="button" className="button" onClick={() => void saveMissionZoneEdit()}>Save Mission Zone Edit</button> : null}
            </form>
            {missionZoneRows.map((zone) => (
              <div key={zone.id} style={{ marginTop: "0.6rem" }}>
                <span>{zone.title}</span>
                <button className="button" style={{ marginTop: "0.4rem" }} onClick={() => beginEditMissionZone(zone)}>Edit</button>
                <button className="button" style={{ marginTop: "0.4rem" }} onClick={() => void deleteMissionZone(zone.id)}>Delete</button>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <NavBar />
    </main>
  );
}
