import { Crosshair, MapPinned } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";

type Coordinates = { latitude: string; longitude: string };

type ArenaLocationPickerProps = {
  latitude: string;
  longitude: string;
  onChange: (coordinates: Coordinates) => void;
};

const INDIA_CENTER = { lat: 20.5937, lng: 78.9629 };

function parseCoordinates(latitude: string, longitude: string) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}

function asLiteral(position: unknown) {
  if (!position || typeof position !== "object") return null;
  const candidate = position as { lat?: number | (() => number); lng?: number | (() => number) };
  const lat = typeof candidate.lat === "function" ? candidate.lat() : candidate.lat;
  const lng = typeof candidate.lng === "function" ? candidate.lng() : candidate.lng;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

export function ArenaLocationPicker({ latitude, longitude, onChange }: ArenaLocationPickerProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [locationError, setLocationError] = useState("");
  const selected = useMemo(() => parseCoordinates(latitude, longitude), [latitude, longitude]);

  const commit = useCallback((position: google.maps.LatLngLiteral) => {
    onChange({ latitude: position.lat.toFixed(6), longitude: position.lng.toFixed(6) });
    setLocationError("");
  }, [onChange]);

  const placeMarker = useCallback((position: google.maps.LatLngLiteral) => {
    const map = mapRef.current;
    if (!map || !window.google) return;
    if (!markerRef.current) {
      const marker = new window.google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        title: "Exact arena location",
        gmpDraggable: true,
      } as google.maps.marker.AdvancedMarkerElementOptions);
      marker.addListener("dragend", () => {
        const nextPosition = asLiteral(marker.position);
        if (nextPosition) commit(nextPosition);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.position = position;
      markerRef.current.map = map;
    }
  }, [commit]);

  useEffect(() => {
    if (!selected || !mapRef.current) return;
    mapRef.current.panTo(selected);
    placeMarker(selected);
  }, [selected?.lat, selected?.lng, placeMarker]);

  const onMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    const startingPoint = parseCoordinates(latitude, longitude) ?? INDIA_CENTER;
    map.setCenter(startingPoint);
    if (parseCoordinates(latitude, longitude)) placeMarker(startingPoint);
    map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;
      const position = event.latLng.toJSON();
      placeMarker(position);
      commit(position);
    });
  }, [commit, latitude, longitude, placeMarker]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location detection. Place the pin manually on the map.");
      return;
    }
    setLocationError("");
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        mapRef.current?.panTo(next);
        mapRef.current?.setZoom(16);
        placeMarker(next);
        commit(next);
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED ? "Location permission was not granted. Place the pin manually on the map." : "Your current location could not be determined. Place the pin manually on the map.";
        setLocationError(message);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return <section className="arena-location-picker" aria-label="Arena location picker"><div className="location-picker-head"><div><p className="eyebrow">EXACT VENUE LOCATION</p><h3>Pin the real arena on Google Maps.</h3><p>Use your current location at the venue or click the map to place and adjust the marker.</p></div><Button type="button" variant="outline" onClick={useCurrentLocation}><Crosshair />Use current location</Button></div><MapView className="arena-location-map" initialCenter={selected ?? INDIA_CENTER} initialZoom={selected ? 15 : 5} onMapReady={onMapReady} /><div className="location-picker-foot"><span><MapPinned />{selected ? `Selected: ${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}` : "No exact location selected yet."}</span><small>Click anywhere on the map or drag the pin to set the arena’s precise location.</small></div>{locationError && <p className="form-error">{locationError}</p>}</section>;
}
