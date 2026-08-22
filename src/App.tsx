import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useProgressStore } from "@/store/useProgressStore";
import { totalProgress } from "@/lib/types";
import { Memory } from "@/pages/Memory";
import { MapPage } from "@/pages/MapPage";
import { Intro } from "@/pages/Intro";
import { hasSeenIntro, markIntroSeen } from "@/lib/introSeen";
import { Button } from "@/components/ui/button";
import { BookOpen, Info, Map as MapIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "memory" | "map";

function App() {
  const { state, init, loading } = useProgressStore();
  const [tab, setTab] = useState<Tab>("memory");
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrated, setCelebrated] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !hasSeenIntro());

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (!state) return;
    const total = totalProgress(state);
    if (total >= 100 && !celebrated) {
      setShowCelebration(true);
      setCelebrated(true);
    }
  }, [state, celebrated]);

  if (loading || !state) {
    return (
      <div className="flex h-svh items-center justify-center text-muted-foreground">
        Đang khơi lại ký ức...
      </div>
    );
  }

  if (showIntro) {
    return (
      <Intro
        onDone={() => {
          markIntroSeen();
          setShowIntro(false);
        }}
      />
    );
  }

  const total = totalProgress(state);

  return (
    <div className="mx-auto flex h-svh max-w-md flex-col bg-background">
      <div className="flex-1 overflow-hidden">
        {tab === "memory" && <Memory state={state} />}
        {tab === "map" && <MapPage totalPercent={total} />}
      </div>

      <nav className="flex items-center justify-around border-t border-border bg-card py-2">
        <NavButton icon={<BookOpen className="h-5 w-5" />} label="Ký ức" active={tab === "memory"} onClick={() => setTab("memory")} />
        <NavButton icon={<MapIcon className="h-5 w-5" />} label="Bản đồ" active={tab === "map"} onClick={() => setTab("map")} />
        <NavButton icon={<Info className="h-5 w-5" />} label="Giới thiệu" active={false} onClick={() => setShowIntro(true)} />
      </nav>

      <AnimatePresence>
        {showCelebration && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background/95 p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 10 }}
            >
              <h1 className="font-story text-3xl font-semibold text-primary">100% Ký Ức!</h1>
              <p className="mt-2 text-muted-foreground">
                Chuyến tàu ký ức đã sẵn sàng khởi hành. Bản đồ dẫn đường vừa được mở khoá.
              </p>
            </motion.div>
            <Button
              size="lg"
              onClick={() => {
                setShowCelebration(false);
                setTab("map");
              }}
            >
              Mở Bản Đồ
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-xs",
        active ? "text-primary" : "text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default App;
