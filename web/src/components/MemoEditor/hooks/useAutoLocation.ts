import { create } from "@bufbuild/protobuf";
import { useEffect, useRef } from "react";
import { LocationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { useReverseGeocoding } from "@/components/map/useReverseGeocoding";

const LOCATION_TIMEOUT_MS = 8000;

interface UseAutoLocationOptions {
  enabled: boolean;
  isCreating: boolean;
  isInitialized: boolean;
  lat?: number;
  lng?: number;
  onLocationChange: (loc: unknown) => void;
  appendContent: (text: string) => void;
}

export const useAutoLocation = ({
  enabled,
  isCreating,
  isInitialized,
  lat,
  lng,
  onLocationChange,
  appendContent,
}: UseAutoLocationOptions) => {
  const triggeredRef = useRef(false);

  // Step 1: get coordinates via geolocation api (only if no lat/lng provided yet)
  const coords = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!enabled || !isCreating || !isInitialized) return;
    if (triggeredRef.current) return;
    if (lat !== undefined && lng !== undefined) {
      // coordinates already known (e.g., passed from parent)
      coords.current = { lat, lng };
      triggeredRef.current = true;
      return;
    }

    if (!navigator.geolocation) return;

    triggeredRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        coords.current = { lat: position.coords.latitude, lng: position.coords.longitude };
      },
      () => {
        // silent fail
      },
      { timeout: LOCATION_TIMEOUT_MS, enableHighAccuracy: false },
    );
  }, [enabled, isCreating, isInitialized, lat, lng]);

  // Step 2: reverse geocode when coordinates are available
  const { data: geoResult } = useReverseGeocoding(coords.current?.lat, coords.current?.lng);

  // Step 3: when geo result arrives, dispatch location + append tag
  const appliedRef = useRef(false);
  useEffect(() => {
    if (!geoResult) return;
    if (appliedRef.current) return;
    if (!coords.current) return;
    appliedRef.current = true;

    const { lat: latitude, lng: longitude } = coords.current;

    // Set location field
    onLocationChange(
      create(LocationSchema, {
        latitude,
        longitude,
        placeholder: geoResult.displayName,
      }),
    );

    // Append address tag to content
    if (geoResult.addressTag) {
      appendContent(`\n\n${geoResult.addressTag}`);
    }
  }, [geoResult, onLocationChange, appendContent]);
};
