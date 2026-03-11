"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJsonGeometry } from "@/lib/types";

type GeoPoint = [number, number];

interface ZoneAuthoringMapProps {
  geometry: GeoJsonGeometry | null;
  mode: "point" | "polygon";
  onGeometryChange: (geometry: GeoJsonGeometry) => void;
}

const DEFAULT_CENTER: GeoPoint = [-73.935242, 40.73061];

function buildPolygonRing(coords: number[][][]): GeoPoint[] {
  const ring = coords[0] ?? [];
  return ring
    .filter((point) => Array.isArray(point) && point.length >= 2)
    .map((point) => [point[0], point[1]] as GeoPoint);
}

function removeClosingPoint(points: GeoPoint[]): GeoPoint[] {
  if (points.length < 2) return points;
  const [startLng, startLat] = points[0];
  const [endLng, endLat] = points[points.length - 1];
  if (startLng === endLng && startLat === endLat) {
    return points.slice(0, -1);
  }
  return points;
}

function ensureClosedRing(points: GeoPoint[]): GeoPoint[] {
  if (points.length < 3) return points;
  const [startLng, startLat] = points[0];
  const [endLng, endLat] = points[points.length - 1];
  if (startLng === endLng && startLat === endLat) {
    return points;
  }
  return [...points, [startLng, startLat]];
}

function polygonVerticesFromGeometry(geometry: GeoJsonGeometry | null): GeoPoint[] {
  if (!geometry || geometry.type !== "Polygon") return [];
  return removeClosingPoint(buildPolygonRing(geometry.coordinates as number[][][]));
}

export function ZoneAuthoringMap({ geometry, mode, onGeometryChange }: ZoneAuthoringMapProps) {
  const mapNodeRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("mapbox-gl").Map | null>(null);
  const modeRef = useRef(mode);
  const geometryRef = useRef(geometry);
  const onGeometryChangeRef = useRef(onGeometryChange);
  const selectedVertexRef = useRef<number | null>(null);
  const isDraggingVertexRef = useRef(false);
  const polygonClosedRef = useRef(false);

  const [selectedVertex, setSelectedVertex] = useState<number | null>(null);
  const [polygonClosed, setPolygonClosed] = useState(false);

  const polygonVertices = useMemo(() => polygonVerticesFromGeometry(geometry), [geometry]);
  const canCompletePolygon = mode === "polygon" && !polygonClosed && polygonVertices.length >= 3;

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    geometryRef.current = geometry;
  }, [geometry]);

  useEffect(() => {
    onGeometryChangeRef.current = onGeometryChange;
  }, [onGeometryChange]);

  useEffect(() => {
    selectedVertexRef.current = selectedVertex;
  }, [selectedVertex]);

  useEffect(() => {
    polygonClosedRef.current = polygonClosed;
  }, [polygonClosed]);

  useEffect(() => {
    if (mode === "point") {
      setSelectedVertex(null);
      setPolygonClosed(false);
      return;
    }

    const ring = geometry?.type === "Polygon" ? buildPolygonRing(geometry.coordinates as number[][][]) : [];
    if (ring.length >= 4) {
      const [startLng, startLat] = ring[0];
      const [endLng, endLat] = ring[ring.length - 1];
      setPolygonClosed(startLng === endLng && startLat === endLat);
    } else {
      setPolygonClosed(false);
    }

    if (selectedVertex !== null && selectedVertex >= polygonVertices.length) {
      setSelectedVertex(null);
    }
  }, [geometry, mode, polygonVertices.length, selectedVertex]);

  useEffect(() => {
    let mounted = true;

    async function initMap() {
      if (!mapNodeRef.current || mapRef.current) return;

      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!token) return;

      const mapbox = (await import("mapbox-gl")).default;
      if (!mounted) return;

      mapbox.accessToken = token;

      mapRef.current = new mapbox.Map({
        container: mapNodeRef.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: DEFAULT_CENTER,
        zoom: 12
      });

      mapRef.current.addControl(new mapbox.NavigationControl({ showCompass: false }), "top-right");

      const syncPolygonWithVertex = (nextPoint: GeoPoint) => {
        const currentGeometry = geometryRef.current;
        const vertices = polygonVerticesFromGeometry(currentGeometry);
        const activeVertex = selectedVertexRef.current;

        if (activeVertex === null || activeVertex < 0 || activeVertex >= vertices.length) {
          return;
        }

        const nextVertices = vertices.map((vertex, index) => (index === activeVertex ? nextPoint : vertex));
        const ring = polygonClosedRef.current ? ensureClosedRing(nextVertices) : nextVertices;
        onGeometryChangeRef.current({ type: "Polygon", coordinates: [ring] });
      };

      mapRef.current.on("click", (event) => {
        if (isDraggingVertexRef.current) return;

        const clicked: GeoPoint = [event.lngLat.lng, event.lngLat.lat];
        const currentMode = modeRef.current;

        if (currentMode === "point") {
          onGeometryChangeRef.current({ type: "Point", coordinates: clicked });
          return;
        }

        if (polygonClosedRef.current) {
          return;
        }

        const currentGeometry = geometryRef.current;
        const existingPoints = polygonVerticesFromGeometry(currentGeometry);
        const nextPoints = [...existingPoints, clicked];

        onGeometryChangeRef.current({ type: "Polygon", coordinates: [nextPoints] });
        setSelectedVertex(nextPoints.length - 1);
      });

      mapRef.current.on("load", () => {
        if (!mapRef.current) return;
        mapRef.current.addSource("authoring-zone", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: []
          }
        });

        mapRef.current.addSource("authoring-zone-vertices", {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: []
          }
        });

        mapRef.current.addLayer({
          id: "authoring-zone-point",
          type: "circle",
          source: "authoring-zone",
          filter: ["==", ["geometry-type"], "Point"],
          paint: {
            "circle-radius": 9,
            "circle-color": "#5cc8ff"
          }
        });

        mapRef.current.addLayer({
          id: "authoring-zone-polygon-fill",
          type: "fill",
          source: "authoring-zone",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "fill-color": "#5cc8ff",
            "fill-opacity": 0.2
          }
        });

        mapRef.current.addLayer({
          id: "authoring-zone-polygon-line",
          type: "line",
          source: "authoring-zone",
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: {
            "line-color": "#5cc8ff",
            "line-width": 2
          }
        });

        mapRef.current.addLayer({
          id: "authoring-zone-vertex-points",
          type: "circle",
          source: "authoring-zone-vertices",
          paint: {
            "circle-radius": ["case", ["==", ["get", "selected"], true], 7, 5],
            "circle-color": ["case", ["==", ["get", "selected"], true], "#f8d66d", "#ffffff"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#1f2738"
          }
        });

        mapRef.current.on("mouseenter", "authoring-zone-vertex-points", () => {
          if (mapRef.current) {
            mapRef.current.getCanvas().style.cursor = "pointer";
          }
        });

        mapRef.current.on("mouseleave", "authoring-zone-vertex-points", () => {
          if (mapRef.current && !isDraggingVertexRef.current) {
            mapRef.current.getCanvas().style.cursor = "";
          }
        });

        mapRef.current.on("mousedown", "authoring-zone-vertex-points", (event) => {
          if (!mapRef.current || modeRef.current !== "polygon") return;

          const firstFeature = event.features?.[0];
          const vertexIndex = typeof firstFeature?.properties?.index === "number"
            ? firstFeature.properties.index
            : Number(firstFeature?.properties?.index);

          if (!Number.isFinite(vertexIndex)) return;

          mapRef.current.dragPan.disable();
          isDraggingVertexRef.current = true;
          setSelectedVertex(vertexIndex);
          selectedVertexRef.current = vertexIndex;

          mapRef.current.getCanvas().style.cursor = "grabbing";
        });

        mapRef.current.on("mousemove", (event) => {
          if (!isDraggingVertexRef.current || modeRef.current !== "polygon") return;
          syncPolygonWithVertex([event.lngLat.lng, event.lngLat.lat]);
        });

        mapRef.current.on("mouseup", () => {
          if (!mapRef.current || !isDraggingVertexRef.current) return;
          isDraggingVertexRef.current = false;
          mapRef.current.dragPan.enable();
          mapRef.current.getCanvas().style.cursor = "";
        });

        mapRef.current.on("click", "authoring-zone-vertex-points", (event) => {
          const firstFeature = event.features?.[0];
          const vertexIndex = typeof firstFeature?.properties?.index === "number"
            ? firstFeature.properties.index
            : Number(firstFeature?.properties?.index);

          if (!Number.isFinite(vertexIndex)) return;
          setSelectedVertex(vertexIndex);
          selectedVertexRef.current = vertexIndex;
        });
      });
    }

    void initMap();

    return () => {
      mounted = false;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapRef.current.isStyleLoaded()) return;
    const source = mapRef.current.getSource("authoring-zone") as import("mapbox-gl").GeoJSONSource | undefined;
    const vertexSource = mapRef.current.getSource("authoring-zone-vertices") as import("mapbox-gl").GeoJSONSource | undefined;
    if (!source || !vertexSource) return;

    const feature = geometry
      ? {
          type: "Feature",
          properties: {},
          geometry
        }
      : null;

    source.setData({
      type: "FeatureCollection",
      features: feature ? [feature] : []
    } as any);

    const vertexFeatures = mode === "polygon"
      ? polygonVertices.map((vertex, index) => ({
          type: "Feature",
          properties: {
            index,
            selected: index === selectedVertex
          },
          geometry: {
            type: "Point",
            coordinates: vertex
          }
        }))
      : [];

    vertexSource.setData({
      type: "FeatureCollection",
      features: vertexFeatures
    } as any);
  }, [geometry, mode, polygonVertices, selectedVertex]);

  function completePolygon() {
    if (!canCompletePolygon) return;
    const ring = ensureClosedRing(polygonVertices);
    onGeometryChange({ type: "Polygon", coordinates: [ring] });
    setPolygonClosed(true);
  }

  function reopenPolygon() {
    if (mode !== "polygon") return;
    const openPoints = removeClosingPoint(polygonVertices);
    onGeometryChange({ type: "Polygon", coordinates: [openPoints] });
    setPolygonClosed(false);
  }

  function deleteSelectedVertex() {
    if (mode !== "polygon" || selectedVertex === null) return;
    const nextVertices = polygonVertices.filter((_, index) => index !== selectedVertex);

    if (nextVertices.length === 0) {
      setSelectedVertex(null);
      setPolygonClosed(false);
      return;
    }

    if (nextVertices.length < 3) {
      setPolygonClosed(false);
      onGeometryChange({ type: "Polygon", coordinates: [nextVertices] });
      setSelectedVertex(Math.min(selectedVertex, nextVertices.length - 1));
      return;
    }

    const ring = polygonClosed ? ensureClosedRing(nextVertices) : nextVertices;
    onGeometryChange({ type: "Polygon", coordinates: [ring] });
    setSelectedVertex(Math.min(selectedVertex, nextVertices.length - 1));
  }

  return (
    <div>
      <p>
        Map authoring mode: {mode}. {mode === "point" ? "Tap map to place zone center." : "Tap to add vertices, drag points to reshape polygon."}
      </p>
      {mode === "polygon" ? (
        <div style={{ display: "grid", gap: "0.4rem", marginBottom: "0.5rem" }}>
          <span className="badge">{polygonClosed ? "Polygon complete" : "Polygon edit mode"}</span>
          <span>
            Vertices: {polygonVertices.length}{selectedVertex !== null ? ` • Selected #${selectedVertex + 1}` : ""}
          </span>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="button" onClick={completePolygon} disabled={!canCompletePolygon}>
              Complete Polygon
            </button>
            <button type="button" className="button" onClick={reopenPolygon} disabled={!polygonClosed}>
              Reopen Polygon Editing
            </button>
            <button type="button" className="button" onClick={deleteSelectedVertex} disabled={selectedVertex === null}>
              Delete Selected Vertex
            </button>
          </div>
        </div>
      ) : null}
      <div ref={mapNodeRef} className="map-canvas" style={{ height: "220px" }} />
    </div>
  );
}
