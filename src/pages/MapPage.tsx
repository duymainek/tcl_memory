import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  ARRIVED_THRESHOLD_METERS,
  DESTINATION,
  bearingDegrees,
  displayedDistance,
  haversineMeters,
  pollIntervalMsForPercent,
} from "@/lib/geo";
import { Compass, MapPin } from "lucide-react";

export function MapPage({ totalPercent, teamDeviceId }: { totalPercent: number; teamDeviceId: string }) {
  const [distance, setDistance] = useState<number | null>(null);
  const [bearing, setBearing] = useState<number | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const timerRef = useRef<number | null>(null);

  const interval = pollIntervalMsForPercent(totalPercent);

  useEffect(() => {
    if (!interval) return;

    const poll = () => {
      if (!navigator.geolocation) {
        setGeoError("Thiết bị không hỗ trợ định vị GPS.");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          const real = haversineMeters(here, DESTINATION);
          const shown = displayedDistance(real, totalPercent, teamDeviceId);
          setDistance(shown);
          setBearing(bearingDegrees(here, DESTINATION));
          setGeoError(null);
          if (real <= ARRIVED_THRESHOLD_METERS && totalPercent >= 100 && !arrived) {
            setArrived(true);
            confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
          }
        },
        () => setGeoError("Không lấy được vị trí — hãy cấp quyền định vị cho trình duyệt."),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 8000 }
      );
    };

    poll();
    timerRef.current = window.setInterval(poll, interval);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [interval, totalPercent, teamDeviceId, arrived]);

  useEffect(() => {
    if (totalPercent >= 100) {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.4 } });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!interval) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <MapPin className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          Bản đồ sẽ dần hé lộ khi đội đạt từ 40% ký ức trở lên. Hiện tại: {totalPercent}%.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-6 text-center">
      {arrived ? (
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2 className="font-story text-2xl font-semibold text-primary">Đã đến nơi rồi!</h2>
          <p className="mt-2 text-muted-foreground">Chuyến tàu ký ức đã về đến ga cuối. Hẹn gặp lại!</p>
        </motion.div>
      ) : (
        <>
          <motion.div
            animate={{ rotate: bearing ?? 0 }}
            transition={{ type: "spring", stiffness: 60, damping: 12 }}
            className="flex h-32 w-32 items-center justify-center rounded-full border-4 border-primary/40"
          >
            <Compass className="h-16 w-16 text-primary" />
          </motion.div>

          <div>
            <p className="font-story text-4xl font-semibold text-foreground">
              {distance !== null ? `${distance}m` : "..."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">khoảng cách ước lượng đến điểm hẹn</p>
          </div>

          {geoError && <p className="text-sm text-destructive">{geoError}</p>}
          {totalPercent < 100 && (
            <p className="text-xs text-muted-foreground">
              Vị trí sẽ ngày càng chính xác khi ký ức được khơi lại đầy đủ hơn.
            </p>
          )}
        </>
      )}
    </div>
  );
}
