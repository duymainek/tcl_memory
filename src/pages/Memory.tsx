import { useState } from "react";
import { Chat } from "@/pages/Chat";
import { Redeem } from "@/pages/Redeem";
import type { TeamProgressState } from "@/lib/types";
import { MessageCircle, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";

type MemorySubTab = "chat" | "redeem";

export function Memory({ state }: { state: TeamProgressState }) {
  const [subTab, setSubTab] = useState<MemorySubTab>("chat");

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 border-b border-border">
        <SubTabButton
          icon={<MessageCircle className="h-4 w-4" />}
          label="Kể chuyện"
          active={subTab === "chat"}
          onClick={() => setSubTab("chat")}
        />
        <SubTabButton
          icon={<Ticket className="h-4 w-4" />}
          label="Đổi thẻ ký ức"
          active={subTab === "redeem"}
          onClick={() => setSubTab("redeem")}
        />
      </div>

      <div className="flex-1 overflow-hidden">
        {subTab === "chat" ? <Chat state={state} /> : <Redeem />}
      </div>
    </div>
  );
}

function SubTabButton({
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
        "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}
