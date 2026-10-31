/**
 * 模型列表：调用 OpenAI 兼容的 GET {baseUrl}/models 获取可用模型，并按名称筛出文本对话模型。
 *
 * 列表接口只返回模型名、不标明类型，且各家会混入向量、语音、图像等模型
 * （实测通义千问兼容模式返回 184 个，其中含 tts / asr / image / embedding 等），
 * 因此只能按名称关键字排除；筛不干净的由「显示全部」与手动输入兜底。
 */

type FetchFn = typeof fetch;

export type ModelListResult = {
    /** 去重、排序后的全部模型名 */
    all: string[];
    /** 按名称判定为文本对话模型的子集 */
    text: string[];
};

/**
 * 非文本对话模型的名称特征。按词边界匹配（前后为 - _ . / : 或首尾），
 * 避免 "plus" 里的 "us"、"flash" 里的 "as" 之类误伤。
 */
const NON_TEXT_TOKENS = [
    "embedding", "embed", "rerank", "moderation",
    "tts", "asr", "whisper", "audio", "speech", "s2s", "realtime", "livetranslate", "transcribe",
    "image", "dall", "wan2", "wanx", "cogview", "cogvideo", "video", "sora", "flux", "z-image",
    "vl", "ocr", "omni", "vision", "gui",
];

const TOKEN_RE = new RegExp(`(^|[-_./:])(${NON_TEXT_TOKENS.map(t => t.replace(/[-]/g, "\\-")).join("|")})(\\d|[-_./:]|$)`, "i");

export function isTextModel(id: string): boolean {
    return !TOKEN_RE.test(id);
}

const MAX_PAGES = 10;

/**
 * 拉取模型列表。接口若返回 has_more（分页），按 after=last_id 继续翻页，最多 MAX_PAGES 页。
 * 失败时抛出带中文说明的 Error，由调用方展示并回退到推荐模型。
 */
export async function fetchModels(
    baseUrl: string,
    apiKey: string,
    customHeaders: Record<string, string> = {},
    signal?: AbortSignal,
    fetchFn: FetchFn = fetch
): Promise<ModelListResult> {
    if (!baseUrl.trim()) throw new Error("请先填写接口地址");
    if (!apiKey.trim()) throw new Error("请先填写 API Key");
    const root = baseUrl.trim().replace(/\/+$/, "") + "/models";
    const headers = { Authorization: `Bearer ${apiKey.trim()}`, ...customHeaders };

    const ids = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
        const url = after ? `${root}?after=${encodeURIComponent(after)}` : root;
        let res: Response;
        try {
            res = await fetchFn(url, { headers, signal });
        } catch (e) {
            if ((e as Error).name === "AbortError") throw e;
            throw new Error("网络错误，无法连接到接口地址", { cause: e });
        }
        if (!res.ok) {
            if (res.status === 401 || res.status === 403) throw new Error("API Key 无效或无权限");
            if (res.status === 404) throw new Error("该服务不支持获取模型列表");
            throw new Error(`获取模型列表失败（HTTP ${res.status}）`);
        }
        let body: { data?: Array<{ id?: unknown }>; has_more?: boolean; last_id?: string };
        try {
            body = await res.json();
        } catch (e) {
            throw new Error("模型列表格式无法识别", { cause: e });
        }
        if (!Array.isArray(body.data)) throw new Error("模型列表格式无法识别");
        for (const m of body.data) {
            if (typeof m.id === "string" && m.id) ids.add(m.id);
        }
        if (!body.has_more || !body.last_id || body.last_id === after) break;
        after = body.last_id;
    }

    const all = [...ids].sort((a, b) => a.localeCompare(b));
    return { all, text: all.filter(isTextModel) };
}
