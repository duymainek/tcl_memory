import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgressStore } from "@/store/useProgressStore";
import { STATION_LABELS } from "@/lib/types";
import { Ticket, CheckCircle2, XCircle } from "lucide-react";

export function Redeem() {
  const { redeemCard } = useProgressStore();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ gained: number; stationLabel: string } | null>(null);

  useEffect(() => {
    if (!reveal) return;
    const t = setTimeout(() => setReveal(null), 5000);
    return () => clearTimeout(t);
  }, [reveal]);

  const handleRedeem = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    const res = await redeemCard(code);
    setBusy(false);
    if (res.ok) {
      const stationLabel = res.stationId ? STATION_LABELS[res.stationId] : "";
      setResult({ ok: true, message: `Cộng +${res.addedPercent}% ký ức vào ${stationLabel}!` });
      if (res.addedPercent && res.addedPercent > 0) {
        setReveal({ gained: res.addedPercent, stationLabel });
      }
      setCode("");
    } else {
      const messages: Record<string, string> = {
        invalid_code: "Mã thẻ không hợp lệ.",
        already_used: "Thẻ này đã được dùng rồi.",
        not_ready: "Đang tải dữ liệu, thử lại sau giây lát.",
      };
      setResult({ ok: false, message: messages[res.error ?? ""] ?? "Có lỗi xảy ra." });
    }
  };

  return (
    <div className="relative flex h-full flex-col items-center gap-6 p-6 pt-16">
      <Ticket className="h-10 w-10 text-primary" />
      <div className="text-center">
        <h2 className="font-story text-xl font-semibold">Đổi thẻ ký ức</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhập mã trên thẻ để cộng thêm % ký ức cho đúng trạm tương ứng.
        </p>
      </div>

      <div className="w-full max-w-sm space-y-3">
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="Nhập mã thẻ..."
          className="text-center text-lg tracking-widest"
        />
        <Button onClick={handleRedeem} disabled={!code.trim() || busy} className="w-full">
          {busy ? "Đang kiểm tra..." : "Đổi thẻ"}
        </Button>
      </div>

      {result && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
            result.ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
          }`}
        >
          {result.ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
          {result.message}
        </motion.div>
      )}

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
              Ký ức được khớp — {reveal.stationLabel}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
