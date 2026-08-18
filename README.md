# Chuyến Tàu Ký Ức — Player Web App

Web app mobile-first cho đội chơi kể chuyện với AI "Tư", tích luỹ % ký ức theo 4 trạm, đổi thẻ ký ức, và mở khoá bản đồ khi đạt 100%.

Xem chi tiết thiết kế kỹ thuật đầy đủ trong `technical-design-v2.md` (gửi kèm cùng project).

## Kiến trúc tóm tắt

- **Không backend/DB, không login.** Toàn bộ progress lưu ở `localStorage` (mã hoá AES-GCM), 1 thiết bị = 1 đội.
- **Chỉ 1 điểm gọi ra ngoài:** 1 Netlify Function (`netlify/functions/chat.ts`) proxy gọi Gemini Flash để chấm điểm kể chuyện (Mission mode) và trò chuyện (Companion mode) — giữ API key bí mật.
- Kịch bản gốc + sự kiện cốt lõi từng trạm: `netlify/functions/scenarios.json` (chỉ Function đọc, **không** bundle ra client để tránh lộ đáp án).
- Mã thẻ ký ức: chỉ lưu **hash** SHA-256 trong `src/data/cards.json` (an toàn để bundle client).

## Chạy local

```bash
npm install
cp .env.example .env   # điền GEMINI_API_KEY thật
npx netlify dev        # chạy cả Vite dev server + Netlify Function tại /api/chat
```

Nếu chỉ muốn chạy UI (không có chat thật): `npm run dev` — chat sẽ báo lỗi mạng vì thiếu Function, nhưng toàn bộ luồng progress/thẻ/bản đồ vẫn xem được.

## Build

```bash
npm run build
```

## Cấu hình dữ liệu trước sự kiện (BTC)

1. **Kịch bản từng trạm:** sửa `netlify/functions/scenarios.json` — điền `storyContext` và danh sách `coreEvents` (id, mô tả, weight) cho trạm 2, 3, 4 theo đúng kịch bản thật.
2. **Toạ độ đích:** sửa `DESTINATION` trong `src/lib/geo.ts`.
3. **Thẻ ký ức:** dùng `node scripts/generate-card-hash.mjs MA_THE_CUA_BAN` để sinh hash, thêm vào `src/data/cards.json` với đúng `stationId` và `percent`.
4. **Ngưỡng cap mỗi trạm:** mặc định 25%/trạm (`CAP_PER_STATION` trong `src/lib/types.ts`), tổng 4 trạm = 100%, không overprovision — theo đúng quyết định đã chốt.

## Deploy lên Netlify qua GitHub

1. Push code lên 1 GitHub repo.
2. Trên Netlify: **Add new site → Import an existing project → GitHub** → chọn repo.
3. Build command: `npm run build`, Publish directory: `dist` (đã cấu hình sẵn trong `netlify.toml`, Netlify sẽ tự nhận).
4. Vào **Site settings → Environment variables**, thêm `GEMINI_API_KEY` = key thật (không commit vào repo).
5. Deploy — mỗi lần push vào nhánh `main` sẽ tự động build & deploy lại.

## Bảo mật (đọc kỹ trước khi vận hành thật)

Đây là hệ thống **không backend xác thực**, nên không thể chống 100% người dùng có kỹ thuật can thiệp localStorage. Các lớp phòng thủ đã áp dụng (chi tiết ở mục 4 của `technical-design-v2.md`):

- localStorage được mã hoá AES-GCM (không lưu plaintext).
- Mã thẻ ký ức chỉ lưu hash, không lưu mã gốc.
- Kịch bản/đáp án các trạm không bundle ra client, chỉ tồn tại phía server (Netlify Function).
- Cooldown 15s giữa các tin nhắn được check cả ở client lẫn server.

Mục tiêu là "đủ khó để người chơi thông thường không tiện gian lận", không phải chống hacker chuyên nghiệp — phù hợp với tính chất 1 sự kiện giải trí offline ngắn hạn.
