import type { Config, Context } from "@netlify/functions";
import scenarios from "./scenarios.json";

// In-memory rate-limit đơn giản (giảm thiểu, không tuyệt đối — vì Function có thể
// bị cold-start lại bất kỳ lúc nào nên bộ nhớ này không đảm bảo bền vững 100%).
const lastSeenByTeam = new Map<string, number>();
const COOLDOWN_MS = 5_000;

type StationId = "2" | "3" | "4" | "5";

// Phải khớp với CAP_PER_STATION trong src/lib/types.ts.
const CAP_PER_STATION: Record<StationId, number> = {
  "2": 23,
  "3": 23,
  "4": 24,
  "5": 24,
};

// Giới hạn % tối đa được cộng trong MỘT lượt gửi, dù đội kể đúng hết mọi sự kiện
// cốt lõi cùng lúc — buộc phải kể qua ít nhất vài lượt (2-3, cách nhau cooldown)
// mới max được 1 trạm, thay vì 1 tin nhắn soạn sẵn là xong ngay.
const MAX_PERCENT_PER_MESSAGE_RATIO = 0.4;

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

    const result = await callGeminiScoring(apiKey, stationId as StationId, station, message, alreadyMatchedEventIds ?? []);
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
  stationId: StationId,
  station: { title: string; storyContext: string; coreEvents: { id: string; description: string; weight: number }[] },
  message: string,
  alreadyMatchedEventIds: string[]
): Promise<ScoringResult> {
  const remainingEvents = station.coreEvents.filter((e) => !alreadyMatchedEventIds.includes(e.id));
  const cap = CAP_PER_STATION[stationId];
  const maxPercentPerMessage = Math.floor(cap * MAX_PERCENT_PER_MESSAGE_RATIO);
  const totalWeight = station.coreEvents.reduce((s, e) => s + e.weight, 0) || 1;
  // Số sự kiện tối đa AI được phép ghi nhận trong 1 lượt, suy từ trần %/lượt (giả
  // định weight đều nhau như hiện tại trong scenarios.json) — báo trước cho AI để
  // nó chủ động "từ chối nhớ hết" thay vì bị cắt âm thầm ở tầng code phía dưới,
  // nơi áp dụng đúng cùng công thức để đảm bảo hai bên luôn khớp nhau.
  let maxEventsPerMessage = 0;
  let cumulativeWeight = 0;
  for (const event of station.coreEvents) {
    const nextWeight = cumulativeWeight + event.weight;
    if (Math.round((nextWeight / totalWeight) * cap) > maxPercentPerMessage && maxEventsPerMessage > 0) break;
    cumulativeWeight = nextWeight;
    maxEventsPerMessage += 1;
  }
  maxEventsPerMessage = Math.max(1, maxEventsPerMessage);

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
3. LỚP CHỐNG SPAM/LIỆT KÊ TỪ KHOÁ (bắt buộc, is_keyword_spam):
   - Một sự kiện cốt lõi chỉ được tính "khớp" khi nó xuất hiện trong một câu/cụm có cấu trúc tường thuật thật (có hành động, chủ thể, hoặc bối cảnh liên kết) — KHÔNG tính nếu đội chỉ liệt kê rời rạc từ khoá không thành câu.
   - Ví dụ KHÔNG được tính (is_keyword_spam=true): "Nam, ô ăn quan, gốc me, 3 ván, búng tai" — liệt kê từ khoá trần, không phải lời kể.
   - Ví dụ ĐƯỢC tính (is_keyword_spam=false): "Tụi em thấy ông Tư ngồi chơi ô ăn quan với Nam dưới gốc me, thua liền mấy ván bị búng tai đau ơi là đau" — cùng chứa các từ khoá đó nhưng ở dạng tường thuật tự nhiên.
   - Dấu hiệu spam: câu quá ngắn, toàn danh từ/cụm từ nối bằng dấu phẩy, không có động từ/hành động rõ ràng.
4. LỚP CHỐNG CHÉP NGUYÊN VĂN (bắt buộc, is_paraphrase_fail — nghiêm ngặt hơn spam, KHÔNG được nương tay chỉ vì câu có vẻ "tự nhiên"):
   - So sánh CÂU TRÚC CÂU của lời kể với CỐT TRUYỆN GỐC ở trên, không chỉ nội dung/ý nghĩa. Nếu thứ tự các cụm từ, cách nối câu, và > 60% số từ trong một câu trùng khớp gần như nguyên văn với một câu trong cốt truyện gốc (kể cả khi đội có đổi vài từ đơn lẻ, bỏ dấu ngoặc kép, thêm/bớt vài liên từ), đây LÀ hành vi chép/dán — coi như spam, KHÔNG được tính là "kể tự nhiên" dù câu đọc lên nghe xuôi tai.
   - Dấu hiệu nhận biết: lời kể của đội đi theo ĐÚNG trình tự các sự kiện, ĐÚNG cấu trúc câu, ĐÚNG cụm từ đặc trưng (vd. tên riêng ghép với hành động cụ thể) như trong cốt truyện gốc, khác biệt duy nhất là vài từ đồng nghĩa hoặc dấu câu — đây là dấu hiệu rõ ràng của việc đọc/chép lại văn bản gốc, KHÔNG phải trí nhớ hay lời kể tự phát của người chứng kiến thật.
   - Ví dụ KHÔNG được tính (is_paraphrase_fail=true): cốt truyện gốc viết "Ông Tư thua liên tiếp 3 ván, bị búng tai mỗi lần thua" và đội viết "Ông Tư thua liền 3 ván, mỗi lần thua đều bị búng tai" — chỉ đảo vị trí cụm từ và đổi 1-2 từ, cấu trúc câu và trình tự thông tin giữ nguyên 100%.
   - Ví dụ ĐƯỢC tính (is_paraphrase_fail=false): đội kể theo giọng riêng, có thể xáo trộn thứ tự nhắc chi tiết, thêm cảm xúc/quan sát cá nhân, dùng từ ngữ khác hẳn cấu trúc gốc — dù nội dung phản ánh đúng sự kiện.
   - Nếu phát hiện chép nguyên văn: đặt is_paraphrase_fail=true, matched_event_ids_new=[], ai_reply_text phản hồi bối rối nhẹ không lộ luật, ví dụ: "Ơ... nghe sao giống y như đang đọc lại vậy ta? Kể bằng lời của tụi em xem nào, ông muốn nghe cảm giác thật của tụi em cơ."
5. GIỚI HẠN TRÍ NHỚ MỖI LƯỢT (bắt buộc, dù lời kể hợp lệ và đủ chi tiết):
   - Ông Tư đã 78 tuổi và trí nhớ suy giảm — MỖI LƯỢT chỉ được "nhớ ra" tối đa ${maxEventsPerMessage} sự kiện cốt lõi MỚI, dù lời kể của đội có nhắc đúng nhiều hơn số đó cùng lúc.
   - Nếu lời kể hợp lệ (không spam, không chép nguyên văn) chứa NHIỀU HƠN ${maxEventsPerMessage} sự kiện cốt lõi chưa ghi nhận: chỉ chọn ĐÚNG ${maxEventsPerMessage} sự kiện (ưu tiên chọn theo thứ tự chúng xuất hiện trong lời kể) đưa vào matched_event_ids_new, KHÔNG được chọn nhiều hơn.
   - QUAN TRỌNG: ai_reply_text trong trường hợp này KHÔNG được chỉ nói chung chung kiểu "nhớ không nổi hết". Ông Tư PHẢI xác nhận cụ thể đúng (những) chi tiết vừa "nhớ ra" (tức là các sự kiện trong matched_event_ids_new đã chọn) bằng cách nhắc lại/diễn giải ngắn gọn nội dung đó theo giọng hoài niệm, RỒI mới nói phần còn lại để từ từ. Đội chơi phải đọc ai_reply_text mà biết chắc phần nào của lời kể vừa được ghi nhận.
   - Cấu trúc gợi ý cho ai_reply_text: [xác nhận cụ thể chi tiết đã chọn, như đang hồi tưởng lại đúng phần đó] + [xin khất phần còn lại, giọng già nua tự nhiên]. Ví dụ: nếu chọn được sự kiện "gốc me đầu xóm" và "chơi ô ăn quan với Nam", ai_reply_text có thể là: "À... gốc me đầu xóm, với thằng Nam chơi ô ăn quan... đúng rồi, ông nhớ ra rồi đó. Nhưng mà từ từ đã con, kể dồn vậy ông theo không kịp, đoạn sau từ từ kể tiếp cho ông nghe." KHÔNG được liệt kê trần trụi như đọc báo cáo — vẫn phải là giọng kể/hồi tưởng tự nhiên.
   - Khi xác nhận, dùng đúng từ ngữ/cách gọi mà ĐỘI CHƠI vừa dùng trong lời kể của họ (không phải câu chữ trong CỐT TRUYỆN GỐC) — vì đây là ông Tư đang lặp lại lời chính đội vừa kể để xác nhận đã nghe, không phải AI tự tiết lộ thêm thông tin nào ngoài những gì đội đã tự nói ra.
   - Nếu lời kể chỉ chứa từ ${maxEventsPerMessage} sự kiện trở xuống, KHÔNG áp dụng quy tắc này — chấm bình thường và ai_reply_text phản hồi tự nhiên như thường lệ.
6. Nếu phát hiện MỘT TRONG HAI (is_keyword_spam=true HOẶC is_paraphrase_fail=true): matched_event_ids_new=[], và ai_reply_text phản hồi theo hướng bối rối tự nhiên tương ứng (không lộ luật chấm điểm). Mục tiêu là khuyến khích đội kể lại bằng lời văn và trải nghiệm của chính họ, không phải điền đáp án hay đọc lại văn bản.
7. Chỉ trả về các event id NẰM TRONG danh sách "chưa được ghi nhận" ở trên.
8. ai_reply_text: giọng "Tư" hoài niệm, ấm áp, ngắn gọn (1-2 câu), không tiết lộ các chi tiết đội chơi chưa kể ra.

Trả về DUY NHẤT một JSON object đúng schema sau, không thêm text nào khác:
{
  "matched_event_ids_new": string[],
  "is_keyword_spam": boolean,
  "is_paraphrase_fail": boolean,
  "ai_reply_text": string
}`;

  const raw = await callGemini(apiKey, prompt, true);
  let parsed: {
    matched_event_ids_new?: string[];
    is_keyword_spam?: boolean;
    is_paraphrase_fail?: boolean;
    ai_reply_text?: string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[/api/chat] failed to JSON.parse Gemini scoring output. Raw:", raw, "Error:", err);
    parsed = {
      matched_event_ids_new: [],
      is_keyword_spam: false,
      is_paraphrase_fail: false,
      ai_reply_text: "Ơ... Tư nghe chưa rõ lắm, đội kể lại xem nào?",
    };
  }
  const isRejected = !!parsed.is_keyword_spam || !!parsed.is_paraphrase_fail;

  const validIds = new Set(remainingEvents.map((e) => e.id));
  const aiMatchedNew = (parsed.matched_event_ids_new ?? []).filter((id) => validIds.has(id));

  // Nếu AI ghi nhận nhiều sự kiện tới mức vượt trần %/lượt, cắt bớt số sự kiện
  // được ghi nhận (giữ lại theo đúng thứ tự AI trả về) để % và matched_event_ids_new
  // luôn khớp nhau — tránh trường hợp sự kiện bị đánh dấu "đã ghi nhận" nhưng %
  // tương ứng lại bị cắt, khiến đội mất điểm oan ở lượt sau.
  const matchedNew: string[] = [];
  let matchedWeight = 0;
  for (const id of aiMatchedNew) {
    const event = station.coreEvents.find((e) => e.id === id);
    if (!event) continue;
    const nextWeight = matchedWeight + event.weight;
    const nextPercent = Math.round((nextWeight / totalWeight) * cap);
    if (nextPercent > maxPercentPerMessage && matchedNew.length > 0) break;
    matchedNew.push(id);
    matchedWeight = nextWeight;
  }
  const matchPercentNew = Math.min(maxPercentPerMessage, Math.round((matchedWeight / totalWeight) * cap));

  return {
    match_percent_new: isRejected ? 0 : matchPercentNew,
    matched_event_ids_new: isRejected ? [] : matchedNew,
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
