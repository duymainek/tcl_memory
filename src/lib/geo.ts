// Toạ độ đích cố định — BTC set hardcode tại đây trước sự kiện.
export const DESTINATION = {
  lat: 10.762622,
  lng: 106.660172,
};

export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Cấu hình interval polling GPS + mức nhiễu hiển thị theo % ký ức tổng.
 * Nhiễu hội tụ dần về 0 khi % tiến gần 100, seed theo teamDeviceId để ổn định
 * (không nhảy loạn giữa các lần đọc của cùng 1 đội).
 */
export function pollIntervalMsForPercent(percent: number): number | null {
  if (percent < 40) return null; // map chưa mở
  if (percent < 70) return 12_000;
  if (percent < 95) return 5_000;
  if (percent < 100) return 2_500;
  return 1_500;
}

export function noiseFactorForPercent(percent: number): number {
  if (percent >= 100) return 0;
  if (percent < 40) return 1; // không dùng vì map chưa mở, nhưng để an toàn
  // giảm tuyến tính từ 0.8 (ở 40%) về 0 (ở 100%)
  const t = (percent - 40) / (100 - 40);
  return Math.max(0, 0.8 * (1 - t));
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return ((h % 1000) + 1000) % 1000 / 1000; // 0..1
}

export function displayedDistance(realMeters: number, percent: number, seed: string): number {
  const noise = noiseFactorForPercent(percent);
  const wobble = 0.5 + seededRandom(seed) * 0.5; // 0.5..1
  return Math.round(realMeters * (1 + noise * wobble));
}

export const ARRIVED_THRESHOLD_METERS = 15;
