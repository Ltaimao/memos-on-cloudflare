import { useMemoFilterContext } from "@/contexts/MemoFilterContext";

export type TimeTravelMode = "sameDayAcrossYears" | "sameDayEachMonth" | "sameWeekdayInMonth";

const MODES: { value: TimeTravelMode; label: string; desc: string }[] = [
  { value: "sameDayAcrossYears", label: "当年今日", desc: "往年今日的记录" },
  { value: "sameDayEachMonth", label: "每月今日", desc: "每月这一天的记录" },
  { value: "sameWeekdayInMonth", label: "每周同期", desc: "当月每周几的记录" },
];

const TimeTravelToggle = () => {
  const { filters, addFilter, removeFiltersByFactor } = useMemoFilterContext();

  const activeMode = filters.find((f) => f.factor === "timeTravel")?.value as TimeTravelMode | undefined;

  const handleToggle = (mode: TimeTravelMode) => {
    if (activeMode === mode) {
      // Toggle off
      removeFiltersByFactor("timeTravel");
    } else {
      // Toggle on (removes any previous timeTravel filter first, then adds new)
      removeFiltersByFactor("timeTravel");
      addFilter({ factor: "timeTravel", value: mode });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-3">
      <div className="flex gap-1.5">
        {MODES.map((mode) => {
          const isActive = activeMode === mode.value;
          return (
            <button
              key={mode.value}
              onClick={() => handleToggle(mode.value)}
              title={mode.desc}
              className={`px-3 py-1.5 text-sm rounded-full border transition-all duration-200 ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm font-medium"
                  : "bg-muted/30 text-muted-foreground border-border/50 hover:bg-accent hover:text-foreground hover:border-border"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TimeTravelToggle;
