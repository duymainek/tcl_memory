const INTRO_SEEN_KEY = "ttkuc_intro_seen_v1";

export function hasSeenIntro(): boolean {
  return localStorage.getItem(INTRO_SEEN_KEY) === "1";
}

export function markIntroSeen(): void {
  localStorage.setItem(INTRO_SEEN_KEY, "1");
}
