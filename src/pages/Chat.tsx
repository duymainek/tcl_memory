import { useEffect, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/ProgressBar";
import { FragmentQuest } from "@/pages/FragmentQuest";
import { useProgressStore } from "@/store/useProgressStore";
import type { StationId, TeamProgressState } from "@/lib/types";
import { CAP_PER_STATION, FRAGMENT_PERCENT_PER_PIECE, FRAGMENT_STATION_ID, STATION_IDS, STATION_LABELS } from "@/lib/types";
import { ArrowLeft, KeyRound, Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function Chat({ state }: { state: TeamProgressState }) {
  const { sendMissionMessage, redeemCode, canSend, tickCooldown, cooldownRemainingMs } = useProgressStore();
  const [thread, setThread] = useState<StationId | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ gained: number; stationPercent: number } | null>(null);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [redeemCodeInput, setRedeemCodeInput] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const interval = setInterval(tickCooldown, 500);
    return () => clearInterval(interval);
  }, [tickCooldown]);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), 5000);
    return () => clearTimeout(t);
  }, [reveal]);

  const goBack = () => {
    setThread(null);
    setErrorMsg(null);
    setRedeemOpen(false);
    setRedeemCodeInput("");
    setRedeemMsg(null);
  };

  const messages = thread ? state.chatHistory.filter((m) => m.mode === "mission" && m.stationId === thread) : [];

  const handleRedeem = async () => {
    if (!redeemCodeInput.trim() || redeemBusy) return;
    setRedeemBusy(true);
    const res = await redeemCode(redeemCodeInput);
    setRedeemBusy(false);
    if (res.ok) {
      const stationLabel = res.stationId ? STATION_LABELS[res.stationId] : "";
      setRedeemMsg({ ok: true, text: `Cộng +${res.addedPercent}% ký ức vào ${stationLabel}!` });
      setRedeemCodeInput("");
      if (res.addedPercent && res.addedPercent > 0) {
        setReveal({ gained: res.addedPercent, stationPercent: res.stationPercent ?? 0 });
      }
    } else {
      const messages: Record<string, string> = {
        invalid_code: "Mã không hợp lệ.",
        already_used: "Mã này đã được dùng rồi.",
        fragments_full: "Trạm này đã nhận đủ mã rồi.",
        not_ready: "Đang tải dữ liệu, thử lại sau giây lát.",
      };
      setRedeemMsg({ ok: false, text: messages[res.error ?? ""] ?? "Có lỗi xảy ra." });
    }
  };

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
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Chọn một trạm để kể lại cho Tư nghe những gì đội vừa trải qua.
          </p>
          <JourneyTimeline state={state} onSelect={setThread} />
        </div>
      </div>
    );
  }

  if (thread === FRAGMENT_STATION_ID) {
    return (
      <div className="relative flex h-full flex-col">
        <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
          <button
            onClick={goBack}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary"
            aria-label="Quay lại danh sách trạm"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="font-story text-sm font-medium text-foreground">{STATION_LABELS[thread]}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <FragmentQuest
            unlockedFragments={Math.round(state.stations[thread].percentFromCard / FRAGMENT_PERCENT_PER_PIECE)}
          />
        </div>
      </div>
    );
  }

  const cap = CAP_PER_STATION[thread];

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-4 pb-3">
        <button
          onClick={goBack}
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
              style={{ width: `${Math.min(100, (state.stations[thread].totalPercent / cap) * 100)}%` }}
            />
          </div>
        </div>
        <button
          onClick={() => {
            setRedeemOpen((v) => !v);
            setRedeemMsg(null);
          }}
          className={cn(
            "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
            redeemOpen ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
          )}
        >
          <KeyRound className="h-3.5 w-3.5" />
          Nhập mã
        </button>
      </div>

      <AnimatePresence initial={false}>
        {redeemOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-border bg-secondary/30"
          >
            <div className="flex flex-col gap-2 p-3">
              <div className="flex gap-2">
                <Input
                  value={redeemCodeInput}
                  onChange={(e) => setRedeemCodeInput(e.target.value.toUpperCase())}
                  placeholder="Nhập mã ký ức đội nhận được ở trạm..."
                  className="h-10 flex-1 text-sm tracking-widest"
                />
                <Button
                  onClick={handleRedeem}
                  disabled={!redeemCodeInput.trim() || redeemBusy}
                  size="sm"
                  className="h-10 shrink-0"
                >
                  {redeemBusy ? "..." : "Đổi mã"}
                </Button>
              </div>
              {redeemMsg && (
                <p className={cn("text-xs", redeemMsg.ok ? "text-primary" : "text-destructive")}>
                  {redeemMsg.text}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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

const STATION_SUBTITLES: Record<StationId, string> = {
  1: "Mảnh ghép ký ức",
  2: "Gốc me đầu xóm",
  3: "Oẳn tù xì mùa hè",
  4: "Hội chơi liên hoàn",
  5: "Phiên chợ Tết",
};

function JourneyTimeline({
  state,
  onSelect,
}: {
  state: TeamProgressState;
  onSelect: (id: StationId) => void;
}) {
  return (
    <div className="relative mx-auto max-w-sm pb-2">
      {STATION_IDS.map((id, i) => {
        const percent = state.stations[id].totalPercent;
        const cap = CAP_PER_STATION[id];
        const full = percent >= cap;
        const started = percent > 0;
        const isLast = i === STATION_IDS.length - 1;
        const nextFull = !isLast && state.stations[STATION_IDS[i + 1]].totalPercent > 0;

        return (
          <div key={id} className="relative flex gap-4">
            <div className="relative flex shrink-0 flex-col items-center">
              <StationNode percent={percent} cap={cap} full={full} started={started} />
              {!isLast && (
                <div className="relative w-0.5 flex-1 py-1">
                  <div className="absolute inset-0 rounded-full bg-border" />
                  <motion.div
                    className="absolute inset-x-0 top-0 rounded-full bg-primary"
                    initial={{ height: 0 }}
                    animate={{ height: full || nextFull ? "100%" : "0%" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>

            <button
              onClick={() => onSelect(id)}
              className={cn(
                "mb-4 flex flex-1 flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-colors",
                full
                  ? "border-primary bg-primary/10"
                  : started
                    ? "border-border bg-secondary/50 hover:bg-secondary/80"
                    : "border-border/60 bg-secondary/20 hover:bg-secondary/50"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-story text-base font-semibold text-foreground">{STATION_LABELS[id]}</span>
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  {full && <Sparkles className="h-3.5 w-3.5 text-primary" />}
                  {percent}%
                </span>
              </div>
              <span className="text-xs text-muted-foreground">{STATION_SUBTITLES[id]}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StationNode({
  percent,
  cap,
  full,
  started,
}: {
  percent: number;
  cap: number;
  full: boolean;
  started: boolean;
}) {
  const size = 40;
  const stroke = 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, percent / cap);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - ratio) }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </svg>
      <div
        className={cn(
          "absolute inset-0 flex items-center justify-center rounded-full",
          full ? "text-primary" : started ? "text-foreground" : "text-muted-foreground/50"
        )}
      >
        {full ? <Sparkles className="h-4 w-4" /> : <div className="h-1.5 w-1.5 rounded-full bg-current" />}
      </div>
    </div>
  );
}
