import { Chat } from "@/pages/Chat";
import type { TeamProgressState } from "@/lib/types";

export function Memory({ state }: { state: TeamProgressState }) {
  return <Chat state={state} />;
}
