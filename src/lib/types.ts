export type StationId = 1 | 2 | 3 | 4 | 5;

export interface StationProgress {
  matchedEventIds: string[];
  percentFromStory: number;
  percentFromCard: number;
  totalPercent: number;
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
  redeemedCodeHashes: string[];
  chatHistory: ChatMessage[];
  lastMessageAt: number;
  mapUnlockedAt: number | null;
  createdAt: number;
}

export const STATION_IDS: StationId[] = [1, 2, 3, 4, 5];
export const STATION_LABELS: Record<StationId, string> = {
  1: "Trạm 1",
  2: "Trạm 2",
  3: "Trạm 3",
  4: "Trạm 4",
  5: "Trạm 5",
};

// Trạm 1 = trạm mảnh ghép ký ức (không chat AI), các trạm còn lại chấm qua AI.
export const FRAGMENT_STATION_ID: StationId = 1;
export const FRAGMENT_COUNT = 3;
export const FRAGMENT_PERCENT_PER_PIECE = 2;

export const CAP_PER_STATION: Record<StationId, number> = {
  1: 6,
  2: 23,
  3: 23,
  4: 24,
  5: 24,
};

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
      5: emptyStationProgress(),
    },
    redeemedCodeHashes: [],
    chatHistory: [],
    lastMessageAt: 0,
    mapUnlockedAt: null,
    createdAt: Date.now(),
  };
}

export function totalProgress(state: TeamProgressState): number {
  return STATION_IDS.reduce((sum, id) => sum + state.stations[id].totalPercent, 0);
}
