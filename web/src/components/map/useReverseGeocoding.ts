import { useQuery } from "@tanstack/react-query";

const GEOCODING = {
  endpoint: "/api/osm/reverse",
  format: "jsonv2",
} as const;

/** Address hierarchy keys in priority order per level: 省/市/区/街道/地点 */
const ADDRESS_KEYS: string[][] = [
  ["state"],
  ["city", "county", "town", "village", "municipality"],
  ["district", "city_district"],
  ["suburb", "neighbourhood"],
  ["residential", "hamlet", "quarter"],
];

export interface ReverseGeoResult {
  displayName: string;
  addressTag: string;
}

export function buildAddressTag(address: Record<string, string>): string {
  const parts: string[] = [];
  for (const keys of ADDRESS_KEYS) {
    const value = keys.reduce((acc, k) => acc || address[k] || "", "");
    if (value) parts.push(value);
  }
  return parts.length > 0 ? `#${parts.join("/")}` : "";
}

export const useReverseGeocoding = (lat: number | undefined, lng: number | undefined) => {
  return useQuery({
    queryKey: ["geocoding", lat, lng],
    queryFn: async (): Promise<ReverseGeoResult | null> => {
      if (lat === undefined || lng === undefined) return null;

      const coordString = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

      try {
        const url = `${GEOCODING.endpoint}?lat=${lat}&lon=${lng}&format=${GEOCODING.format}&addressdetails=1`;
        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const displayName: string = data?.display_name || coordString;
        const address: Record<string, string> = data?.address || {};

        return {
          displayName,
          addressTag: buildAddressTag(address),
        };
      } catch (error) {
        console.error("Failed to fetch reverse geocoding data:", error);
        return { displayName: coordString, addressTag: "" };
      }
    },
    enabled: lat !== undefined && lng !== undefined,
    staleTime: Infinity,
  });
};
