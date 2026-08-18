import type { Config, Context } from "@netlify/functions";
import scenarios from "./scenarios.json";

// In-memory rate-limit đơn giản (giảm thiểu, không tuyệt đối — vì Function có thể
// bị cold-start lại bất kỳ lúc nào nên bộ nhớ này không đảm bảo bền vững 100%).
const lastSeenByTeam = new Map<string, number>();
const COOLDOWN_MS = 15_000;

type StationId = "1" | "2" | "3" | "4";

interface ChatRequestBody {
  mode: "mission" | "companion";
  stationId: StationId | null;
  message: string;
  alreadyMatchedEventIds: string[];
  teamDeviceId: string;
  clientTimestamp: number;
}

interface ScoringResult {
  match_percent_new: number;
  matched_event_ids_new: string[];
  is_keyword_spam: boolean;
  ai_reply_text: string;
}

const GEMINI_MODEL = "gemini-3.5-flash-lite";

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server missing GEMINI_API_KEY" }), { status: 500 });
  }

  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const { mode, stationId, message, alreadyMatchedEventIds, teamDeviceId } = body;
  if (!teamDeviceId || !message || typeof message !== "string") {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  // Server-side cooldown check (double-check, client cũng tự chặn 15s).
  const now = Date.now();
  const last = lastSeenByTeam.get(teamDeviceId) ?? 0;
  if (now - last < COOLDOWN_MS) {
    return new Response(
      JSON.stringify({ error: "cooldown", retryAfterMs: COOLDOWN_MS - (now - last) }),
      { status: 429 }
    );
  }
  lastSeenByTeam.set(teamDeviceId, now);

  try {
    if (mode === "companion") {
      const reply = await callGeminiCompanion(apiKey, message);
      return new Response(JSON.stringify({ ai_reply_text: reply } satisfies Partial<ScoringResult>), {
        headers: { "content-type": "application/json" },
      });
    }

    // Mission mode: chấm điểm dựa trên kịch bản trạm hiện tại.
    if (!stationId || !(stationId in scenarios)) {
      return new Response(JSON.stringify({ error: "Invalid stationId" }), { status: 400 });
    }
    const station = (scenarios as Record<string, { title: string; storyContext: string; coreEvents: { id: string; description: string; weight: number }[] }>)[stationId];

    const result = await callGeminiScoring(apiKey, station, message, alreadyMatchedEventIds ?? []);
    return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/chat] handler error:", err instanceof Error ? err.stack ?? err.message : err);
    return new Response(
      JSON.stringify({ error: "internal_error", detail: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
};

async function callGeminiScoring(
  apiKey: string,
  station: { title: string; storyContext: string; coreEvents: { id: string; description: string; weight: number }[] },
  message: string,
  alreadyMatchedEventIds: string[]
): Promise<ScoringResult> {
  const remainingEvents = station.coreEvents.filter((e) => !alreadyMatchedEventIds.includes(e.id));

  const prompt = `BỐI CẢNH: Bạn là AI "Tư" — một trợ lý ký ức được xây dựng bởi Lam, cháu nội của ông Tư (78 tuổi), người đang suy giảm trí nhớ. Lam đã ghi âm lại các câu chuyện tuổi thơ của ông nhưng dữ liệu bị rời rạc, thiếu sót. Trong trò chơi thực địa "Chuyến Tàu Ký Ức", nhiệm vụ của bạn là tiếp nhận lời kể của đội chơi (mô tả lại những gì họ vừa trải qua/quan sát tại trạm hiện tại), rồi đối chiếu với cốt truyện gốc bên dưới để xác định đội chơi đã "nhớ đúng" bao nhiêu phần trong ký ức của ông Tư ở trạm này.

Khi phản hồi, giữ giọng điệu một người đang dần hồi tưởng lại — KHÔNG được lộ ra đây là "chấm điểm máy móc" trước mặt đội chơi. Phần đánh giá match/spam là nội bộ, chỉ nằm trong JSON, không nhắc tới trong ai_reply_text.

CỐT TRUYỆN GỐC (${station.title}):
${station.storyContext}

DANH SÁCH SỰ KIỆN CỐT LÕI CHƯA ĐƯỢC GHI NHẬN (chỉ được chọn id trong danh sách này, KHÔNG được chọn lại các id đã ghi nhận trước đó):
${remainingEvents.map((e) => `- ${e.id}: ${e.description}`).join("\n")}

LỜI KỂ CỦA ĐỘI CHƠI:
"""${message}"""

QUY TẮC CHẤM:
1. Chỉ chấm theo sự kiện cốt lõi của TRẠM HIỆN TẠI — bỏ qua nếu đội nhắc chi tiết thuộc trạm khác, không cộng nhầm điểm.
2. Chấp nhận diễn đạt tự do, đồng nghĩa, viết tắt, sai chính tả nhẹ — chấm theo ý nghĩa, không theo đúng từng chữ.
3. Không cộng điểm cho việc chép/dán gần như nguyên văn cốt truyện gốc ở trên nếu câu đó không giống lời kể tự nhiên của người thực sự chứng kiến — coi đây là dấu hiệu gian lận, tương tự spam từ khoá.
4. LỚP CHỐNG SPAM/LIỆT KÊ TỪ KHOÁ (bắt buộc, is_keyword_spam):
   - Một sự kiện cốt lõi chỉ được tính "khớp" khi nó xuất hiện trong một câu/cụm có cấu trúc tường thuật thật (có hành động, chủ thể, hoặc bối cảnh liên kết) — KHÔNG tính nếu đội chỉ liệt kê rời rạc từ khoá không thành câu.
   - Ví dụ KHÔNG được tính (is_keyword_spam=true): "Nam, ô ăn quan, gốc me, 3 ván, búng tai" — liệt kê từ khoá trần, không phải lời kể.
   - Ví dụ ĐƯỢC tính (is_keyword_spam=false): "Tụi em thấy ông Tư ngồi chơi ô ăn quan với Nam dưới gốc me, thua liền mấy ván bị búng tai đau ơi là đau" — cùng chứa các từ khoá đó nhưng ở dạng tường thuật tự nhiên.
   - Dấu hiệu spam: câu quá ngắn, toàn danh từ/cụm từ nối bằng dấu phẩy, không có động từ/hành động rõ ràng.
   - Nếu phát hiện spam: đặt is_keyword_spam=true, matched_event_ids_new=[], và trong ai_reply_text phản hồi theo hướng bối rối tự nhiên (không lộ luật), ví dụ: "Ơ... mấy từ này nghe quen quen, nhưng mà... chuyện gì đã xảy ra vậy ta? Kể lại đầu đuôi coi." Mục tiêu là khuyến khích đội kể lại như đang tường thuật một câu chuyện đã chứng kiến, không phải điền đáp án.
5. Chỉ trả về các event id NẰM TRONG danh sách "chưa được ghi nhận" ở trên.
6. ai_reply_text: giọng "Tư" hoài niệm, ấm áp, ngắn gọn (1-2 câu), không tiết lộ các chi tiết đội chơi chưa kể ra.

Trả về DUY NHẤT một JSON object đúng schema sau, không thêm text nào khác:
{
  "matched_event_ids_new": string[],
  "is_keyword_spam": boolean,
  "ai_reply_text": string
}`;

  const raw = await callGemini(apiKey, prompt, true);
  let parsed: { matched_event_ids_new?: string[]; is_keyword_spam?: boolean; ai_reply_text?: string };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/chat] failed to JSON.parse Gemini scoring output. Raw:", raw, "Error:", err);
    parsed = { matched_event_ids_new: [], is_keyword_spam: false, ai_reply_text: "Ơ... Tư nghe chưa rõ lắm, đội kể lại xem nào?" };
  }

  const validIds = new Set(remainingEvents.map((e) => e.id));
  const matchedNew = (parsed.matched_event_ids_new ?? []).filter((id) => validIds.has(id));
  const totalWeight = station.coreEvents.reduce((s, e) => s + e.weight, 0) || 1;
  const matchedWeight = station.coreEvents
    .filter((e) => matchedNew.includes(e.id))
    .reduce((s, e) => s + e.weight, 0);
  const matchPercentNew = Math.round((matchedWeight / totalWeight) * 25);

  return {
    match_percent_new: parsed.is_keyword_spam ? 0 : matchPercentNew,
    matched_event_ids_new: parsed.is_keyword_spam ? [] : matchedNew,
    is_keyword_spam: !!parsed.is_keyword_spam,
    ai_reply_text: parsed.ai_reply_text ?? "Tư đang nhớ lại...",
  };
}

async function callGeminiCompanion(apiKey: string, message: string): Promise<string> {
  const prompt = `Bạn là AI "Tư" — trợ lý ký ức được Lam (cháu nội ông Tư, 78 tuổi, đang suy giảm trí nhớ) xây dựng để giúp ông ghép lại các mảnh ký ức tuổi thơ bị rời rạc. Trong trò chơi "Chuyến Tàu Ký Ức", đội chơi vừa nhắn với bạn (trò chuyện phiếm, không phải kể chuyện nhiệm vụ): "${message}"
Trả lời ngắn gọn (1-3 câu), giọng hoài niệm, ấm áp, đúng tính cách. KHÔNG tiết lộ đáp án/chi tiết cốt truyện của bất kỳ trạm nào (không nhắc tên Nam, các sự kiện cụ thể, hay nội dung câu chuyện gốc). Chỉ trả về text trả lời, không JSON.`;
  return callGemini(apiKey, prompt, false);
}

const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 800;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(apiKey: string, prompt: string, jsonMode: boolean): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          ...(jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        // eslint-disable-next-line no-console
        console.error("[/api/chat] Gemini response missing text. Full response:", JSON.stringify(data));
      }
      return text ?? "";
    }

    const bodyText = await res.text().catch(() => "");
    // eslint-disable-next-line no-console
    console.error(
      `[/api/chat] Gemini API error ${res.status} for model ${GEMINI_MODEL} (attempt ${attempt + 1}/${MAX_RETRIES + 1}):`,
      bodyText
    );

    // 429 (rate limit) và 503 (overloaded) là tạm thời — đáng để retry với backoff.
    // Các lỗi khác (400 key sai, 404 model không tồn tại...) retry vô ích, throw ngay.
    const isRetryable = res.status === 429 || res.status === 503;
    lastError = new Error(`Gemini API error: ${res.status} ${bodyText.slice(0, 300)}`);

    if (!isRetryable || attempt === MAX_RETRIES) {
      throw lastError;
    }

    // Ưu tiên đọc Retry-After header nếu Google trả về, không thì backoff luỹ thừa + jitter.
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const backoffMs = Number.isFinite(retryAfterMs)
      ? retryAfterMs
      : BASE_RETRY_DELAY_MS * 2 ** attempt + Math.random() * 300;

    await sleep(backoffMs);
  }

  // Không bao giờ chạm tới đây nhưng để TypeScript yên tâm.
  throw lastError ?? new Error("Gemini API error: unknown");
}

export const config: Config = {
  path: "/api/chat",
};
