export type StationId = 1 | 2 | 3 | 4;

export interface StationProgress {
  matchedEventIds: string[];
  percentFromStory: number; // 0-25
  percentFromCard: number; // 0-25
  totalPercent: number; // min(25, story+card)
}

export interface ChatMessage {
  id: string;
  role: "user" | "tu";
  mode: "mission" | "companion";
  stationId: StationId | null;
  text: string;
  createdAt: number;
}

export interface TeamProgressState {
  teamDeviceId: string;
  stations: Record<StationId, StationProgress>;
  redeemedCardHashes: string[];
  chatHistory: ChatMessage[];
  lastMessageAt: number;
  mapUnlockedAt: number | null;
  createdAt: number;
}

export const STATION_IDS: StationId[] = [1, 2, 3, 4];
export const CAP_PER_STATION = 25;
export const COOLDOWN_MS = 15_000;

export function emptyStationProgress(): StationProgress {
  return { matchedEventIds: [], percentFromStory: 0, percentFromCard: 0, totalPercent: 0 };
}

export function createEmptyState(teamDeviceId: string): TeamProgressState {
  return {
    teamDeviceId,
    stations: {
      1: emptyStationProgress(),
      2: emptyStationProgress(),
      3: emptyStationProgress(),
      4: emptyStationProgress(),
    },
    redeemedCardHashes: [],
    chatHistory: [],
    lastMessageAt: 0,
    mapUnlockedAt: null,
    createdAt: Date.now(),
  };
}

export function totalProgress(state: TeamProgressState): number {
  return STATION_IDS.reduce((sum, id) => sum + state.stations[id].totalPercent, 0);
}
