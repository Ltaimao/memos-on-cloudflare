import type { TimeTravelMode } from "@/components/TimeTravelToggle";
import { useMemoFilterContext } from "@/contexts/MemoFilterContext";
import { useRef } from "react";

/**
 * Computes the extra query param string for time travel filters.
 * Returns undefined when no time travel filter is active.
 */
export function useTimeTravelParam(): Record<string, string> | undefined {
  const { filters } = useMemoFilterContext();
  const recallCounter = useRef(0);
  const prevActive = useRef(false);

  const timeTravelFilter = filters.find((f) => f.factor === "timeTravel");
  if (!timeTravelFilter) return undefined;

  const mode = timeTravelFilter.value as TimeTravelMode;
  const now = new Date();
  const year = now.getFullYear();
  const tzOffset = String(-now.getTimezoneOffset()); // 分钟数，UTC+8 → 480

  // 随机回忆：用计数器确保每次激活时值不同，但在同一激活周期内保持稳定
  if (mode === "randomRecall") {
    if (!prevActive.current) {
      recallCounter.current++;
      prevActive.current = true;
    }
  } else {
    prevActive.current = false;
  }

  switch (mode) {
    case "sameDayAcrossYears": {
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      return { sameDayAcrossYears: `${mm}-${dd}`, tzOffset };
    }
    case "sameDayEachMonth": {
      const dd = String(now.getDate()).padStart(2, "0");
      return { sameDayEachMonth: `${year}-${dd}`, tzOffset };
    }
    case "sameWeekdayInMonth": {
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const w = now.getDay();
      return { sameWeekdayInMonth: `${year}-${mm}-${w}`, tzOffset };
    }
    case "randomRecall": {
      return { randomRecall: String(recallCounter.current) };
    }
    default:
      return undefined;
  }
}
