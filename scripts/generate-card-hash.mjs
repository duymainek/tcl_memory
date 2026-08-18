// Công cụ cho BTC: sinh hash cho 1 mã thẻ để điền vào src/data/cards.json
// Chạy: node scripts/generate-card-hash.mjs MA_THE_001
import { webcrypto } from "node:crypto";

const CARD_SALT = "chuyen-tau-ky-uc-2026-card-salt-v1"; // phải khớp với src/lib/hash.ts

async function sha256Hex(input) {
  const enc = new TextEncoder();
  const data = enc.encode(input.toUpperCase().trim() + CARD_SALT);
  const digest = await webcrypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const code = process.argv[2];
if (!code) {
  console.error("Dùng: node scripts/generate-card-hash.mjs MA_THE_001");
  process.exit(1);
}

const hash = await sha256Hex(code);
console.log(JSON.stringify({ code, hash }, null, 2));
