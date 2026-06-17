import { create } from "@bufbuild/protobuf";
import { useEffect, useRef, useState } from "react";
import { LocationSchema } from "@/types/proto/api/v1/memo_service_pb";
import { useReverseGeocoding } from "@/components/map/useReverseGeocoding";

const LOCATION_TIMEOUT_MS = 8000;

interface UseAutoLocationOptions {
  enabled: boolean;
  isCreating: boolean;
  isInitialized: boolean;
  onLocationChange: (loc: unknown) => void;
  appendContent: (text: string) => void;
}

export const useAutoLocation = ({ enabled, isCreating, isInitialized, onLocationChange, appendContent }: UseAutoLocationOptions) => {
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const triggeredRef = useRef(false);
  const appliedRef = useRef(false);

  // Step 1: get coordinates via geolocation API (only once per mount)
  useEffect(() => {
    if (!enabled || !isCreating || !isInitialized) return;
    if (triggeredRef.current) return;
    if (!navigator.geolocation) return;

    triggeredRef.current = true;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        // silent fail
      },
      { timeout: LOCATION_TIMEOUT_MS, enableHighAccuracy: false },
    );
  }, [enabled, isCreating, isInitialized]);

  // Step 2: reverse geocode when coordinates are available
  const { data: geoResult } = useReverseGeocoding(coords?.lat, coords?.lng);

  // Step 3: when geo result arrives, dispatch location + append tag
  useEffect(() => {
    if (!geoResult || !coords) return;
    if (appliedRef.current) return;
    appliedRef.current = true;

    onLocationChange(
      create(LocationSchema, {
        latitude: coords.lat,
        longitude: coords.lng,
        placeholder: geoResult.displayName,
      }),
    );

    if (geoResult.addressTag) {
      appendContent(`\n\n${geoResult.addressTag}`);
    }
  }, [geoResult, coords, onLocationChange, appendContent]);

  // Reset refs when creating a new memo (isCreating transitions false -> true)
  const prevIsCreatingRef = useRef(isCreating);
  useEffect(() => {
    if (isCreating && !prevIsCreatingRef.current) {
      triggeredRef.current = false;
      appliedRef.current = false;
      setCoords(null);
    }
    prevIsCreatingRef.current = isCreating;
  }, [isCreating]);
};
