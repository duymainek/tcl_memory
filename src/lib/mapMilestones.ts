export interface MapMilestone {
  threshold: number;
  imageUrl: string;
}

export const MAP_MILESTONES: MapMilestone[] = [
  { threshold: 50, imageUrl: "https://i.postimg.cc/kXkss5rV/50.jpg" },
  { threshold: 60, imageUrl: "https://i.postimg.cc/SNwddK0C/60.jpg" },
  { threshold: 70, imageUrl: "https://i.postimg.cc/sDtmm2FS/70.jpg" },
  { threshold: 80, imageUrl: "https://i.postimg.cc/bNKggvX1/80.jpg" },
  { threshold: 90, imageUrl: "https://i.postimg.cc/sDtmm2FY/90.jpg" },
  { threshold: 100, imageUrl: "https://i.postimg.cc/X7TLLvMk/100.jpg" },
];

export const MAP_FIRST_MILESTONE = MAP_MILESTONES[0].threshold;

export function mapImageForPercent(percent: number): string | null {
  let current: string | null = null;
  for (const milestone of MAP_MILESTONES) {
    if (percent >= milestone.threshold) {
      current = milestone.imageUrl;
    }
  }
  return current;
}
