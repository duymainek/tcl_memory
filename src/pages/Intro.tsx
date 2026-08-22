import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TrainFront, Puzzle, MessageCircle, KeyRound, MapPinned } from "lucide-react";
import { cn } from "@/lib/utils";

interface Slide {
  icon: React.ReactNode;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: <TrainFront className="h-12 w-12 text-primary" />,
    title: "Chuyến Tàu Ký Ức",
    body: "Ông Tư, 78 tuổi, đang dần quên đi những ký ức tuổi thơ quý giá. Lam — cháu nội ông — đã xây dựng AI \"Tư\" từ những đoạn ghi âm ông kể, nhưng dữ liệu bị rời rạc, thiếu sót. Đội chơi sẽ giúp Lam khơi lại trọn vẹn ký ức của ông, từng mảnh một.",
  },
  {
    icon: <Puzzle className="h-12 w-12 text-primary" />,
    title: "Trạm 1 — Mảnh ghép ký ức",
    body: "Trước khi lên tàu, đội hãy đi khắp khu vực sự kiện để tìm 3 mảnh ghép ký ức thất lạc. Mỗi mảnh đi kèm một mã — nhập đúng mã để ghép mảnh vào bức tranh và mở khoá % đầu tiên.",
  },
  {
    icon: <MessageCircle className="h-12 w-12 text-primary" />,
    title: "Trạm 2 đến 5 — Kể chuyện cho Tư nghe",
    body: "Ở mỗi trạm, đội sẽ trải qua một thử thách hoặc quan sát một khung cảnh gắn với ký ức của ông Tư. Sau đó, hãy kể lại cho AI \"Tư\" nghe bằng lời văn tự nhiên — kể càng đúng, càng chi tiết, % ký ức của trạm đó càng được khơi lại nhiều.",
  },
  {
    icon: <KeyRound className="h-12 w-12 text-primary" />,
    title: "Mã ký ức",
    body: "Ngoài việc kể chuyện, một số trạm còn phát mã ký ức cho đội hoàn thành thử thách. Vào màn kể chuyện của trạm, bấm \"Nhập mã\" để cộng thêm % — hệ thống sẽ tự nhận diện mã thuộc trạm nào.",
  },
  {
    icon: <MapPinned className="h-12 w-12 text-primary" />,
    title: "Bản đồ ký ức",
    body: "Khi đội thu thập đủ % ký ức, những mảnh bản đồ dẫn đường sẽ dần hiện ra ở tab Bản đồ. Gom đủ 100% ký ức toàn đội — chuyến tàu ký ức của ông Tư sẽ sẵn sàng khởi hành!",
  },
];

export function Intro({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  return (
    <div className="mx-auto flex h-svh max-w-md flex-col bg-background p-6">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center gap-4"
          >
            {slide.icon}
            <h1 className="font-story text-2xl font-semibold text-foreground">{slide.title}</h1>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{slide.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex flex-col items-center gap-4 pb-2">
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              aria-label={`Xem bước ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
              )}
            />
          ))}
        </div>

        <div className="flex w-full gap-3">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep((s) => s - 1)}>
              Quay lại
            </Button>
          )}
          <Button
            className="flex-1"
            onClick={() => (isLast ? onDone() : setStep((s) => s + 1))}
          >
            {isLast ? "Bắt đầu hành trình" : "Tiếp theo"}
          </Button>
        </div>

        {!isLast && (
          <button onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground">
            Bỏ qua
          </button>
        )}
      </div>
    </div>
  );
}
