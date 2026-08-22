import { create } from "zustand";
import {
  CAP_PER_STATION,
  COOLDOWN_MS,
  FRAGMENT_COUNT,
  FRAGMENT_PERCENT_PER_PIECE,
  FRAGMENT_STATION_ID,
  STATION_IDS,
  totalProgress,
  type ChatMessage,
  type StationId,
  type TeamProgressState,
} from "@/lib/types";
import { loadProgress, saveProgress, resetProgress as resetLocalStorage } from "@/lib/storage";
import codesData from "@/data/codes.json";
import { sha256Hex } from "@/lib/hash";

interface ScoringResponse {
  match_percent_new: number;
  matched_event_ids_new: string[];
  is_keyword_spam: boolean;
  ai_reply_text: string;
}

interface ProgressStore {
  state: TeamProgressState | null;
  loading: boolean;
  cooldownRemainingMs: number;
  init: () => Promise<void>;
  totalPercent: () => number;
  canSend: () => boolean;
  sendMissionMessage: (
    stationId: StationId,
    text: string
  ) => Promise<{ ok: boolean; error?: string; gainedPercent?: number; stationPercent?: number; overallPercent?: number }>;
  sendCompanionMessage: (text: string) => Promise<{ ok: boolean; error?: string }>;
  redeemCode: (
    code: string
  ) => Promise<{ ok: boolean; error?: string; addedPercent?: number; stationId?: StationId; stationPercent?: number }>;
  tickCooldown: () => void;
  resetAll: () => Promise<void>;
}

function pushMessage(state: TeamProgressState, msg: ChatMessage) {
  state.chatHistory = [...state.chatHistory, msg].slice(-200);
}

export const useProgressStore = create<ProgressStore>((set, get) => ({
  state: null,
  loading: true,
  cooldownRemainingMs: 0,

  init: async () => {
    const state = await loadProgress();
    set({ state, loading: false });
  },

  totalPercent: () => {
    const s = get().state;
    return s ? totalProgress(s) : 0;
  },

  canSend: () => {
    const s = get().state;
    if (!s) return false;
    return Date.now() - s.lastMessageAt >= COOLDOWN_MS;
  },

  tickCooldown: () => {
    const s = get().state;
    if (!s) return;
    const remaining = Math.max(0, COOLDOWN_MS - (Date.now() - s.lastMessageAt));
    set({ cooldownRemainingMs: remaining });
  },

  sendMissionMessage: async (stationId, text) => {
    const s = get().state;
    if (!s) return { ok: false, error: "not_ready" };
    if (!get().canSend()) return { ok: false, error: "cooldown" };
    if (!text.trim()) return { ok: false, error: "empty" };

    const nextState: TeamProgressState = structuredClone(s);
    nextState.lastMessageAt = Date.now();
    pushMessage(nextState, {
      id: crypto.randomUUID(),
      role: "user",
      mode: "mission",
      stationId,
      text,
      createdAt: Date.now(),
    });
    set({ state: nextState });
    await saveProgress(nextState);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "mission",
          stationId: String(stationId),
          message: text,
          alreadyMatchedEventIds: nextState.stations[stationId].matchedEventIds,
          teamDeviceId: nextState.teamDeviceId,
          clientTimestamp: Date.now(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[sendMissionMessage] /api/chat non-ok response:", res.status, err);
        return { ok: false, error: err.error ?? `http_${res.status}` };
      }
      const data: ScoringResponse = await res.json();

      const after: TeamProgressState = structuredClone(nextState);
      const station = after.stations[stationId];
      const cap = CAP_PER_STATION[stationId];
      const beforeStationPercent = station.totalPercent;
      const newIds = data.matched_event_ids_new.filter((id) => !station.matchedEventIds.includes(id));
      station.matchedEventIds = [...station.matchedEventIds, ...newIds];
      station.percentFromStory = Math.min(cap, station.percentFromStory + data.match_percent_new);
      station.totalPercent = Math.min(cap, station.percentFromStory + station.percentFromCard);
      const gainedPercent = station.totalPercent - beforeStationPercent;

      pushMessage(after, {
        id: crypto.randomUUID(),
        role: "tu",
        mode: "mission",
        stationId,
        text: data.ai_reply_text,
        createdAt: Date.now(),
      });

      if (totalProgress(after) >= 100 && !after.mapUnlockedAt) {
        after.mapUnlockedAt = Date.now();
      }

      set({ state: after });
      await saveProgress(after);
      return {
        ok: true,
        gainedPercent,
        stationPercent: station.totalPercent,
        overallPercent: totalProgress(after),
      };
    } catch (err) {
      console.error("[sendMissionMessage] network/unexpected error:", err);
      return { ok: false, error: "network" };
    }
  },

  sendCompanionMessage: async (text) => {
    const s = get().state;
    if (!s) return { ok: false, error: "not_ready" };
    if (!get().canSend()) return { ok: false, error: "cooldown" };
    if (!text.trim()) return { ok: false, error: "empty" };

    const nextState: TeamProgressState = structuredClone(s);
    nextState.lastMessageAt = Date.now();
    pushMessage(nextState, {
      id: crypto.randomUUID(),
      role: "user",
      mode: "companion",
      stationId: null,
      text,
      createdAt: Date.now(),
    });
    set({ state: nextState });
    await saveProgress(nextState);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "companion",
          stationId: null,
          message: text,
          alreadyMatchedEventIds: [],
          teamDeviceId: nextState.teamDeviceId,
          clientTimestamp: Date.now(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { ok: false, error: err.error ?? `http_${res.status}` };
      }
      const data = await res.json();
      const after: TeamProgressState = structuredClone(nextState);
      pushMessage(after, {
        id: crypto.randomUUID(),
        role: "tu",
        mode: "companion",
        stationId: null,
        text: data.ai_reply_text ?? "...",
        createdAt: Date.now(),
      });
      set({ state: after });
      await saveProgress(after);
      return { ok: true };
    } catch {
      return { ok: false, error: "network" };
    }
  },

  redeemCode: async (code) => {
    const s = get().state;
    if (!s) return { ok: false, error: "not_ready" };
    const hash = await sha256Hex(code.trim());
    const match = (codesData as { hash: string; stationId: StationId; percent: number }[]).find(
      (c) => c.hash === hash
    );
    if (!match) return { ok: false, error: "invalid_code" };
    if (s.redeemedCodeHashes.includes(hash)) return { ok: false, error: "already_used" };

    if (match.stationId === FRAGMENT_STATION_ID) {
      const redeemedFragments = Math.round(s.stations[FRAGMENT_STATION_ID].percentFromCard / FRAGMENT_PERCENT_PER_PIECE);
      if (redeemedFragments >= FRAGMENT_COUNT) return { ok: false, error: "fragments_full" };
    }

    const after: TeamProgressState = structuredClone(s);
    after.redeemedCodeHashes.push(hash);
    const station = after.stations[match.stationId];
    const cap = CAP_PER_STATION[match.stationId];
    const before = station.totalPercent;
    station.percentFromCard = Math.min(cap, station.percentFromCard + match.percent);
    station.totalPercent = Math.min(cap, station.percentFromStory + station.percentFromCard);
    const added = station.totalPercent - before;

    if (totalProgress(after) >= 100 && !after.mapUnlockedAt) {
      after.mapUnlockedAt = Date.now();
    }

    set({ state: after });
    await saveProgress(after);
    return { ok: true, addedPercent: added, stationId: match.stationId, stationPercent: station.totalPercent };
  },

  resetAll: async () => {
    resetLocalStorage();
    const fresh = await loadProgress();
    set({ state: fresh });
  },
}));

export { STATION_IDS };
