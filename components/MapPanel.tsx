"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyRoleVisibility, newestValidLocations, RawLocationSample } from "@/lib/location-visibility";
import { ActiveRewardState, PlayerLocation, Role } from "@/lib/types";
import { getRealtimeClient } from "@/lib/realtime-client";

type GeoPoint = [number, number];

interface MapBoundary {
  type: "Polygon";
  coordinates: GeoPoint[][];
}

interface Zone {
  id: string;
  type: "point" | "polygon";
  center?: GeoPoint;
  polygon?: GeoPoint[];
}

interface MapPanelProps {
  locations: PlayerLocation[];
  gameId?: string;
  currentUserId?: string | null;
  currentUserRole?: Role | null;
  hostUserId?: string | null;
  playerRoles?: Record<string, Role>;
  safeZones?: Zone[];
  missionZones?: Zone[];
  gameBoundary?: MapBoundary;
  activeRewards?: ActiveRewardState[];
}

const DEFAULT_CENTER: GeoPoint = [-73.935242, 40.73061];

function zoneFeatures(zones: Zone[]) {
  const pointFeatures = zones
    .filter((zone) => zone.type === "point" && zone.center)
    .map((zone) => ({
      type: "Feature",
      properties: { id: zone.id },
      geometry: { type: "Point", coordinates: zone.center }
    }));

  const polygonFeatures = zones
    .filter((zone) => zone.type === "polygon" && zone.polygon && zone.polygon.length >= 3)
    .map((zone) => ({
      type: "Feature",
      properties: { id: zone.id },
      geometry: { type: "Polygon", coordinates: [zone.polygon] }
    }));

  return [...pointFeatures, ...polygonFeatures];
}

export function MapPanel({
  locations,
  gameId,
  currentUserId = null,
  currentUserRole = null,
  hostUserId = null,
  playerRoles = {},
  safeZones = [],
  missionZones = [],
  gameBoundary,
  activeRewards = []
}: MapPanelProps) {
  const [liveLocations, setLiveLocations] = useState<PlayerLocation[]>(locations);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const mapboxRef = useRef<import("mapbox-gl").default | null>(null);
  const markersRef = useRef<import("mapbox-gl").Marker[]>([]);

  const visibleLocations = useMemo(
    () =>
      applyRoleVisibility({
        locations: liveLocations.length > 0 ? liveLocations : locations,
        playerRoles,
        currentUserId,
        currentUserRole,
        hostUserId,
        activeRewards
      }),
    [liveLocations, locations, playerRoles, currentUserId, currentUserRole, hostUserId, activeRewards]
  );

  const center = useMemo(() => {
    const source = visibleLocations;
    if (source.length === 0) return { lat: "0.0000", lng: "0.0000" };
    const lat = source.reduce((sum, item) => sum + item.lat, 0) / source.length;
    const lng = source.reduce((sum, item) => sum + item.lng, 0) / source.length;
    return { lat: lat.toFixed(4), lng: lng.toFixed(4) };
  }, [visibleLocations]);

  const fetchLatestLocations = useCallback(async () => {
    if (!gameId) return;

    try {
      const response = await fetch(`/api/locations?gameId=${encodeURIComponent(gameId)}`);
      const data = (await response.json()) as { updates?: RawLocationSample[] };
      if (!response.ok) return;

      setLiveLocations(newestValidLocations(data.updates ?? []));
    } catch {
      // retain latest valid set
    }
  }, [gameId]);

  useEffect(() => {
    setLiveLocations(locations);
  }, [locations]);

  useEffect(() => {
    if (!gameId) return;

    const supabase = getRealtimeClient();
    if (!supabase) {
      setRealtimeConnected(false);
      const pollOnly = window.setInterval(() => {
        void fetchLatestLocations();
      }, 15000);
      void fetchLatestLocations();
      return () => window.clearInterval(pollOnly);
    }

    let pollingTimer: number | null = null;

    const startPollingFallback = () => {
      if (pollingTimer !== null) return;
      pollingTimer = window.setInterval(() => {
        void fetchLatestLocations();
      }, 15000);
      void fetchLatestLocations();
    };

    const stopPollingFallback = () => {
      if (pollingTimer === null) return;
      window.clearInterval(pollingTimer);
      pollingTimer = null;
    };

    const channel = supabase
      .channel(`locations-${gameId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "location_updates",
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          const row = payload.new as RawLocationSample;
          const next = newestValidLocations([row]);
          if (next.length === 0) return;

          setLiveLocations((current) => {
            const merged = [
              ...current.filter((item) => item.playerId !== next[0].playerId),
              next[0]
            ];
            return merged.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          });
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setRealtimeConnected(true);
          stopPollingFallback();
          void fetchLatestLocations();
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeConnected(false);
          startPollingFallback();
        }
      });

    return () => {
      stopPollingFallback();
      void supabase.removeChannel(channel);
      setRealtimeConnected(false);
    };
  }, [gameId, fetchLatestLocations]);

  useEffect(() => {
    async function initializeMap() {
      if (!mapNodeRef.current || mapRef.current) return;

      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token) return;

      const mapboxModule = await import("mapbox-gl");
      const mapbox = mapboxModule.default;
      mapbox.accessToken = token;

      mapboxRef.current = mapbox;
      mapRef.current = new mapbox.Map({
        container: mapNodeRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: DEFAULT_CENTER,
        zoom: 12
      });

      mapRef.current.addControl(new mapbox.NavigationControl({ showCompass: false }), "top-right");

      mapRef.current.on("load", () => {
        if (!mapRef.current) return;

        if (gameBoundary) {
          mapRef.current.addSource("game-boundary", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: gameBoundary
            }
          });

          mapRef.current.addLayer({
            id: "game-boundary-line",
            type: "line",
            source: "game-boundary",
            paint: {
              "line-color": "#5cc8ff",
              "line-width": 3
            }
          });
        }

        const safeFeatures = zoneFeatures(safeZones);
        if (safeFeatures.length > 0) {
          mapRef.current.addSource("safe-zones", {
            type: "geojson",
            data: { type: "FeatureCollection", features: safeFeatures }
          });

          mapRef.current.addLayer({
            id: "safe-zones-point",
            type: "circle",
            source: "safe-zones",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 10,
              "circle-color": "#38d39f",
              "circle-opacity": 0.7
            }
          });

          mapRef.current.addLayer({
            id: "safe-zones-polygon",
            type: "fill",
            source: "safe-zones",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": "#38d39f",
              "fill-opacity": 0.2
            }
          });
        }

        const missionFeatures = zoneFeatures(missionZones);
        if (missionFeatures.length > 0) {
          mapRef.current.addSource("mission-zones", {
            type: "geojson",
            data: { type: "FeatureCollection", features: missionFeatures }
          });

          mapRef.current.addLayer({
            id: "mission-zones-point",
            type: "circle",
            source: "mission-zones",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 8,
              "circle-color": "#ffc857",
              "circle-opacity": 0.8
            }
          });

          mapRef.current.addLayer({
            id: "mission-zones-polygon",
            type: "fill",
            source: "mission-zones",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": "#ffc857",
              "fill-opacity": 0.15
            }
          });
        }
      });
    }

    void initializeMap();

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [gameBoundary, safeZones, missionZones]);

  useEffect(() => {
    if (!mapRef.current || !mapboxRef.current) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    visibleLocations.forEach((point) => {
      if (!mapRef.current || !mapboxRef.current) return;
      const isDecoy = point.playerId.startsWith("decoy-");
      const marker = new mapboxRef.current.Marker({ color: isDecoy ? "#9f7bff" : point.isApproximate ? "#ffc857" : "#ff6681" })
        .setLngLat([point.lng, point.lat])
        .setPopup(
          new mapboxRef.current.Popup({ offset: 10 }).setText(
            `${isDecoy ? "Decoy signal" : point.playerId}${point.isApproximate ? " (approx clue)" : ""}`
          )
        )
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    });

    if (visibleLocations.length > 0 && mapRef.current) {
      const bounds = new mapboxRef.current.LngLatBounds();
      visibleLocations.forEach((point) => bounds.extend([point.lng, point.lat]));
      mapRef.current.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 400 });
    }
  }, [visibleLocations]);

  return (
    <div className="card">
      <h3>Live GPS Map (Mapbox)</h3>
      <p>
        Center: {center.lat}, {center.lng}
      </p>
      <p className="badge">Updates every 15-30 seconds • {realtimeConnected ? "Realtime connected" : "Polling fallback"}</p>
      <div ref={mapNodeRef} className="map-canvas" />
      {!process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ? <p>Missing NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN.</p> : null}
      {visibleLocations.length === 0 ? <p>No visible location updates right now.</p> : null}
      <ul>
        {visibleLocations.map((point) => (
          <li key={`${point.playerId}-${point.updatedAt}`}>
            {point.playerId.startsWith("decoy-") ? "Decoy signal" : point.playerId}: {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
            {point.isApproximate ? " (approx clue)" : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
