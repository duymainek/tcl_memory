import { useEffect, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/ProgressBar";
import { useProgressStore } from "@/store/useProgressStore";
import type { StationId, TeamProgressState } from "@/lib/types";
import { CAP_PER_STATION, STATION_IDS } from "@/lib/types";
import { ArrowLeft, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const STATION_LABELS: Record<StationId, string> = {
  1: "Trạm 1",
  2: "Trạm 2",
  3: "Trạm 3",
  4: "Trạm 4",
};

export function Chat({ state }: { state: TeamProgressState }) {
  const { sendMissionMessage, canSend, tickCooldown, cooldownRemainingMs } = useProgressStore();
  const [thread, setThread] = useState<StationId | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ gained: number; stationPercent: number } | null>(null);

  useEffect(() => {
    const interval = setInterval(tickCooldown, 500);
    return () => clearInterval(interval);
  }, [tickCooldown]);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), 5000);
    return () => clearTimeout(t);
  }, [reveal]);

  const messages = thread ? state.chatHistory.filter((m) => m.mode === "mission" && m.stationId === thread) : [];

  const handleSend = async () => {
    if (!thread || !text.trim() || sending) return;
    setSending(true);
    setErrorMsg(null);
    const sentText = text;
    setText("");
    const result = await sendMissionMessage(thread, sentText);
    setSending(false);
    if (result.ok) {
      if (result.gainedPercent && result.gainedPercent > 0) {
        setReveal({ gained: result.gainedPercent, stationPercent: result.stationPercent ?? 0 });
      }
    } else {
      setText(sentText);
      if (result.error === "cooldown") {
        setErrorMsg("Chờ chút để Tư kịp ghi nhớ đã nhé...");
      } else {
        setErrorMsg("Tư đang lag, đội thử gửi lại sau nha.");
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const cooldownSec = Math.ceil(cooldownRemainingMs / 1000);

  if (!thread) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-border p-4">
          <ProgressBar state={state} />
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <p className="mb-3 text-center text-sm text-muted-foreground">
            Chọn một trạm để kể lại cho Tư nghe những gì đội vừa trải qua.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {STATION_IDS.map((id) => (
              <StationCard
                key={id}
                id={id}
                percent={state.stations[id].totalPercent}
                onClick={() => setThread(id)}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
        <button
          onClick={() => setThread(null)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
          aria-label="Quay lại danh sách trạm"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="font-story text-sm font-medium text-foreground">{STATION_LABELS[thread]}</span>
            <span className="text-sm text-muted-foreground">
              {state.stations[thread].totalPercent}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.min(100, (state.stations[thread].totalPercent / CAP_PER_STATION) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="pt-6 text-center text-sm text-muted-foreground">
            {`Kể lại cho Tư nghe những gì đội vừa trải qua ở ${STATION_LABELS[thread]}...`}
          </p>
        )}
        <AnimatePresence initial={false}>
          {messages.map((m) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "font-story bg-secondary text-secondary-foreground"
                )}
              >
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {sending && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm bg-secondary px-4 py-3">
              <ThinkingDot delay={0} />
              <ThinkingDot delay={0.15} />
              <ThinkingDot delay={0.3} />
            </div>
          </motion.div>
        )}
      </div>

      <div className="border-t border-border p-4">
        {errorMsg && <p className="mb-2 text-sm text-destructive">{errorMsg}</p>}
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Kể lại những gì tụi em vừa trải qua..."
          className="mb-2"
          rows={3}
        />
        <Button onClick={handleSend} disabled={!text.trim() || sending || !canSend()} className="w-full gap-2">
          <Send className="h-4 w-4" />
          {canSend() ? "Gửi" : `Chờ ${cooldownSec}s...`}
        </Button>
      </div>

      <AnimatePresence>
        {reveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-2 bg-background/85 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.7, opacity: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 14 }}
              className="font-story text-6xl font-bold text-primary"
            >
              +{reveal.gained}%
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="text-sm text-muted-foreground"
            >
              Ký ức được khớp — trạm này đạt {reveal.stationPercent}%
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThinkingDot({ delay }: { delay: number }) {
  return (
    <motion.span
      className="h-1.5 w-1.5 rounded-full bg-muted-foreground"
      animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.1, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

function StationCard({
  id,
  percent,
  onClick,
}: {
  id: StationId;
  percent: number;
  onClick: () => void;
}) {
  const full = percent >= CAP_PER_STATION;
  const fillRatio = Math.min(1, percent / CAP_PER_STATION);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors",
        full ? "border-primary bg-primary/10" : "border-border bg-secondary/40 hover:bg-secondary/70"
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-story text-base font-semibold text-foreground">{STATION_LABELS[id]}</span>
        {full && <Sparkles className="h-4 w-4 text-primary" />}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", full ? "bg-primary" : "bg-foreground/40")}
          style={{ width: `${fillRatio * 100}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{percent}%</span>
    </button>
  );
}
