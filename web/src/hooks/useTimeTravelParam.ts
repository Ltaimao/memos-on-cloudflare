import type { TimeTravelMode } from "@/components/TimeTravelToggle";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";

/**
 * Computes the extra query param string for time travel filters.
 * Returns undefined when no time travel filter is active.
 */
export function useTimeTravelParam(): Record<string, string> | undefined {
  const { filters } = useMemoFilterContext();
  const timeTravelFilter = filters.find((f) => f.factor === "timeTravel");
  if (!timeTravelFilter) return undefined;

  const mode = timeTravelFilter.value as TimeTravelMode;
  const now = new Date();
  const year = now.getFullYear();
  const tzOffset = String(-now.getTimezoneOffset()); // 分钟数，UTC+8 → 480

  switch (mode) {
    case "sameDayAcrossYears": {
      // MM-DD format, e.g. "06-17"
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      return { sameDayAcrossYears: `${mm}-${dd}`, tzOffset };
    }
    case "sameDayEachMonth": {
      // YYYY-DD format, e.g. "2026-17" — strftime('%Y-%d') matches across months
      const dd = String(now.getDate()).padStart(2, "0");
      return { sameDayEachMonth: `${year}-${dd}`, tzOffset };
    }
    case "sameWeekdayInMonth": {
      // YYYY-MM-W format, e.g. "2026-06-3" — 0=Sun, 6=Sat
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const w = now.getDay(); // 0-6
      return { sameWeekdayInMonth: `${year}-${mm}-${w}`, tzOffset };
    }
    default:
      return undefined;
  }
}
