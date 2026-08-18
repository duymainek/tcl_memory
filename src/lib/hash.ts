// Salt cố định để hash mã thẻ — phải khớp với salt dùng khi BTC sinh cards.json.
const CARD_SALT = "chuyen-tau-ky-uc-2026-card-salt-v1";

export async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const data = enc.encode(input.toUpperCase().trim() + CARD_SALT);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
