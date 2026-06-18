import type { Location } from "@/types/proto/api/v1/memo_service_pb";

export const getLocationDisplayText = (location: Location): string => {
  if (location.placeholder) return location.placeholder;
  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
  }
  return "";
};

export const getLocationCoordinatesText = (location: Location, digits = 4): string => {
  if (typeof location.latitude === "number" && typeof location.longitude === "number") {
    return `${location.latitude.toFixed(digits)}°, ${location.longitude.toFixed(digits)}°`;
  }
  return "";
};
