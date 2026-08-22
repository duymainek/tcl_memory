import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProgressStore } from "@/store/useProgressStore";
import { FRAGMENT_COUNT, FRAGMENT_PERCENT_PER_PIECE } from "@/lib/types";
import { Puzzle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function FragmentQuest({ unlockedFragments }: { unlockedFragments: number }) {
  const { redeemCode } = useProgressStore();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState<number | null>(null);

  useEffect(() => {
    if (justUnlocked === null) return;
    const t = setTimeout(() => setJustUnlocked(null), 1200);
    return () => clearTimeout(t);
  }, [justUnlocked]);

  const complete = unlockedFragments >= FRAGMENT_COUNT;

  const handleRedeem = async () => {
    if (!code.trim() || busy || complete) return;
    setBusy(true);
    const res = await redeemCode(code);
    setBusy(false);
    if (res.ok) {
      setResult({ ok: true, message: `Mảnh ghép ký ức sáng lên! +${res.addedPercent}%` });
      setJustUnlocked(unlockedFragments + 1);
      setCode("");
    } else {
      const messages: Record<string, string> = {
        invalid_code: "Mã không hợp lệ.",
        already_used: "Mã này đã được dùng rồi.",
        fragments_full: "Đội đã tìm đủ 3 mảnh ghép rồi!",
        not_ready: "Đang tải dữ liệu, thử lại sau giây lát.",
      };
      setResult({ ok: false, message: messages[res.error ?? ""] ?? "Có lỗi xảy ra." });
    }
  };

  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto p-6 pt-10 text-center">
      <div>
        <h2 className="font-story text-xl font-semibold text-foreground">Mảnh ghép ký ức đầu tiên</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Trước khi lên tàu, đội hãy tìm khắp khu vực sự kiện để nhặt lại 3 mảnh ghép ký ức thất lạc của ông
          Tư. Mỗi mảnh đi kèm một mã — nhập đúng mã để ghép mảnh đó vào bức tranh, mở khoá {FRAGMENT_PERCENT_PER_PIECE}%
          ký ức mỗi lần.
        </p>
      </div>

      <div className="flex items-center justify-center gap-4">
        {Array.from({ length: FRAGMENT_COUNT }).map((_, i) => {
          const index = i + 1;
          const filled = index <= unlockedFragments;
          const isNew = justUnlocked === index;
          return (
            <motion.div
              key={index}
              animate={isNew ? { scale: [1, 1.35, 1] } : { scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl border-2 transition-colors",
                filled
                  ? "border-primary bg-primary/15 text-primary shadow-[0_0_16px_2px_var(--accent)]"
                  : "border-dashed border-border bg-muted text-muted-foreground/50"
              )}
            >
              <Puzzle className={cn("h-7 w-7", filled && "fill-primary/20")} />
            </motion.div>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground">
        Đã ghép {unlockedFragments}/{FRAGMENT_COUNT} mảnh — {unlockedFragments * FRAGMENT_PERCENT_PER_PIECE}%
      </p>

      {complete ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 rounded-lg bg-primary/15 px-4 py-3 text-sm text-primary"
        >
          <CheckCircle2 className="h-5 w-5" />
          Đã ghép đủ 3 mảnh — bức tranh ký ức đầu tiên hoàn chỉnh!
        </motion.div>
      ) : (
        <div className="w-full max-w-sm space-y-3">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Nhập mã mảnh ghép..."
            className="text-center text-lg tracking-widest"
          />
          <Button onClick={handleRedeem} disabled={!code.trim() || busy} className="w-full">
            {busy ? "Đang kiểm tra..." : "Ghép mảnh"}
          </Button>
        </div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            key={result.message}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-3 text-sm",
              result.ok ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
            )}
          >
            {result.ok ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
            {result.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
