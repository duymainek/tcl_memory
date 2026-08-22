import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import confetti from "canvas-confetti";
import { MAP_FIRST_MILESTONE, mapImageForPercent } from "@/lib/mapMilestones";
import { Map as MapIcon, X, ZoomIn } from "lucide-react";

export function MapPage({ totalPercent }: { totalPercent: number }) {
  const imageUrl = mapImageForPercent(totalPercent);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (totalPercent >= 100) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.4 } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!imageUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <MapIcon className="h-10 w-10 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="font-story text-lg font-semibold text-foreground">
            Bản đồ đang được niêm phong
          </p>
          <p className="text-sm text-muted-foreground">
            Thu thập đủ <span className="font-semibold text-foreground">{MAP_FIRST_MILESTONE}%</span> ký ức từ các trạm
            để mở mảnh bản đồ đầu tiên.
          </p>
          <p className="text-xs text-muted-foreground">
            Hiện tại đội bạn đã thu thập được {totalPercent}%.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <AnimatePresence mode="wait">
        <motion.button
          key={imageUrl}
          type="button"
          onClick={() => setZoomed(true)}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="group relative max-h-[70vh] w-full max-w-md cursor-zoom-in"
        >
          <img
            src={imageUrl}
            alt={`Bản đồ ở mốc ${totalPercent}%`}
            className="max-h-[70vh] w-full rounded-lg object-contain shadow-lg"
          />
          <span className="absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-80 transition-opacity group-hover:opacity-100">
            <ZoomIn className="h-4 w-4" />
          </span>
        </motion.button>
      </AnimatePresence>
      <p className="text-sm text-muted-foreground">
        {totalPercent >= 100
          ? "Bản đồ đã hoàn chỉnh — chuyến tàu ký ức sẵn sàng khởi hành!"
          : `Đội bạn đã thu thập được ${totalPercent}% ký ức.`}
      </p>

      <AnimatePresence>
        {zoomed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setZoomed(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          >
            <button
              type="button"
              onClick={() => setZoomed(false)}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.img
              src={imageUrl}
              alt={`Bản đồ ở mốc ${totalPercent}% (phóng to)`}
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
