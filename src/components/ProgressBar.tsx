import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { CAP_PER_STATION, STATION_IDS, type TeamProgressState } from "@/lib/types";
import { totalProgress } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATION_COLORS: Record<number, string> = {
  1: "var(--station-1)",
  2: "var(--station-2)",
  3: "var(--station-3)",
  4: "var(--station-4)",
};

function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    let raf: number;
    const start = performance.now();
    const from = value;
    const tick = (t: number) => {
      const progress = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return value;
}

export function ProgressBar({ state, compact }: { state: TeamProgressState; compact?: boolean }) {
  const total = totalProgress(state);
  const displayed = useCountUp(total);
  const isFull = total >= 100;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-story text-sm text-muted-foreground">Ký ức đã khơi lại</span>
        <motion.span
          key={displayed}
          initial={{ scale: 1.3, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "font-story text-2xl font-semibold",
            isFull ? "text-primary" : "text-foreground"
          )}
        >
          {displayed}%
        </motion.span>
      </div>

      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full bg-muted p-0.5">
        {STATION_IDS.map((id) => {
          const pct = state.stations[id].totalPercent;
          const fillRatio = Math.min(1, pct / CAP_PER_STATION);
          const isFullSegment = pct >= CAP_PER_STATION;
          return (
            <div key={id} className="relative h-full flex-1 overflow-hidden rounded-full bg-secondary/60">
              <motion.div
                className="h-full rounded-full"
                style={{ background: STATION_COLORS[id] }}
                initial={{ width: 0 }}
                animate={{
                  width: `${fillRatio * 100}%`,
                  boxShadow: isFullSegment
                    ? "0 0 12px 2px var(--accent)"
                    : "0 0 0px 0px transparent",
                }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          );
        })}
      </div>

      {!compact && (
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          {STATION_IDS.map((id) => (
            <span key={id}>Trạm {id}: {state.stations[id].totalPercent}%</span>
          ))}
        </div>
      )}
    </div>
  );
}
