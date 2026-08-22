import { createEmptyState, type TeamProgressState } from "./types";

/**
 * State lưu từ bản trước khi có trạm mảnh ghép (trạm 1 mới) không thể vá được:
 * trạm 1 cũ trỏ tới nội dung "Gốc me đầu xóm" (chat AI, cap 25) trong khi trạm 1
 * mới là mảnh ghép (nhập mã, cap 6) — cùng vị trí nhưng khác hẳn ý nghĩa, ghép
 * lại sẽ hiển thị % sai và lẫn matchedEventIds của câu chuyện cũ vào đúng chỗ.
 * Trạm 5 chỉ tồn tại từ bản 5-trạm trở đi nên thiếu nó là dấu hiệu chắc chắn
 * đây là state đời cũ -> reset sạch thay vì cố migrate lai ghép sai lệch.
 */
function isLegacyState(state: TeamProgressState): boolean {
  return !state.stations?.[5];
}

/**
 * Lưu progress ở localStorage dưới dạng mã hoá AES-GCM.
 *
 * Đây KHÔNG phải giải pháp bảo mật tuyệt đối (không có backend xác thực nên
 * người dùng có kỹ thuật vẫn có thể can thiệp) — mục tiêu là nâng rào cản đủ
 * cao để người chơi thông thường không tiện/không nghĩ tới việc sửa localStorage
 * bằng tay để gian lận % ký ức. GCM tự có auth tag nên nếu dữ liệu bị sửa thô bạo
 * (không qua đúng key/app) thì decrypt sẽ báo lỗi và app sẽ coi là hỏng, reset an toàn.
 */

const STORAGE_KEY = "ttkuc_progress_v1"; // "chuyến tàu ký ức" progress
const DEVICE_ID_KEY = "ttkuc_device_id";
// Salt cố định đóng gói trong bundle — chỉ nhằm làm khó việc sửa tay bằng DevTools,
// không phải bí mật tuyệt đối (bundle client luôn đọc được bởi người đủ kỹ thuật).
const APP_SALT = "chuyen-tau-ky-uc-2026-salt-v1";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function deriveKey(deviceId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(deviceId + APP_SALT),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode(APP_SALT),
      iterations: 100_000,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function saveProgress(state: TeamProgressState): Promise<void> {
  const key = await deriveKey(state.teamDeviceId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(state));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const payload = {
    iv: toBase64(iv.buffer),
    data: toBase64(ciphertext),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export async function loadProgress(): Promise<TeamProgressState> {
  const deviceId = getOrCreateDeviceId();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const fresh = createEmptyState(deviceId);
    await saveProgress(fresh);
    return fresh;
  }
  try {
    const payload = JSON.parse(raw) as { iv: string; data: string };
    const key = await deriveKey(deviceId);
    const iv = fromBase64(payload.iv);
    const ciphertext = fromBase64(payload.data);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource
    );
    const state = JSON.parse(new TextDecoder().decode(plaintext)) as TeamProgressState;
    if (state.teamDeviceId !== deviceId) throw new Error("device id mismatch");
    if (isLegacyState(state)) {
      const fresh = createEmptyState(deviceId);
      await saveProgress(fresh);
      return fresh;
    }
    return state;
  } catch {
    // Dữ liệu bị hỏng hoặc bị can thiệp thô bạo -> reset an toàn thay vì crash app.
    const fresh = createEmptyState(deviceId);
    await saveProgress(fresh);
    return fresh;
  }
}

export function resetProgress(): void {
  localStorage.removeItem(STORAGE_KEY);
}
