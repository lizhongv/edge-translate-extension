import type { LLMError, Settings } from "../shared/types";

const TOKEN_HINT = /token|context length|maximum length|too long/i;

export function normalizeError(
    response: Response | null,
    body: string | null,
    err?: unknown
): LLMError {
    if (err instanceof DOMException && err.name === "AbortError") {
        return { code: "aborted", message: "已取消", retryable: false };
    }
    if (err instanceof TypeError) {
        return { code: "network", message: "网络异常", retryable: true };
    }
    if (response) {
        const status = response.status;
        if (status === 401 || status === 403) {
            return {
                code: "auth",
                message: "API Key 无效或权限不足，请检查设置",
                retryable: false,
                httpStatus: status,
            };
        }
        if (status === 429) {
            return {
                code: "rate_limit",
                message: "请求过于频繁，请稍后再试",
                retryable: true,
                httpStatus: 429,
            };
        }
        if (status === 400 && body && TOKEN_HINT.test(body)) {
            return {
                code: "context_too_long",
                message: "选中内容过长，超出模型上下文。请缩短选择或更换大上下文模型",
                retryable: false,
                httpStatus: 400,
            };
        }
        if (status >= 500 || status === 400) {
            return {
                code: "unknown",
                message: `服务器错误（${status}），请稍后重试`,
                retryable: status >= 500,
                httpStatus: status,
            };
        }
    }
    if (err instanceof Error) {
        return { code: "unknown", message: err.message, retryable: false };
    }
    return { code: "unknown", message: "未知错误", retryable: false };
}

export function* parseSSEChunks(buffer: string): Generator<string> {
    const events = buffer.split(/\n\n/);
    for (const ev of events) {
        if (!ev.trim()) continue;
        for (const line of ev.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            const parsed = JSON.parse(payload);
            const content = parsed?.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content.length > 0) {
                yield content;
            }
        }
    }
}

export async function* streamFromResponse(response: Response): AsyncGenerator<string> {
    if (!response.body) throw new Error("response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lastBoundary = buffer.lastIndexOf("\n\n");
            if (lastBoundary === -1) continue;
            const ready = buffer.slice(0, lastBoundary + 2);
            buffer = buffer.slice(lastBoundary + 2);
            for (const t of parseSSEChunks(ready)) yield t;
        }
        if (buffer.trim()) {
            for (const t of parseSSEChunks(buffer)) yield t;
        }
    } finally {
        reader.releaseLock();
    }
}

type FetchFn = typeof fetch;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
});

const buildBody = (text: string, target: string, secondary: string, settings: Settings) => {
    const system = settings.systemPrompt
        .replaceAll("{{TARGET_LANG}}", target)
        .replaceAll("{{SECONDARY_LANG}}", secondary);
    return JSON.stringify({
        model: settings.model,
        stream: true,
        temperature: settings.temperature,
        messages: [
            { role: "system", content: system },
            { role: "user", content: text },
        ],
    });
};

const buildHeaders = (settings: Settings): HeadersInit => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${settings.apiKey}`,
    ...settings.customHeaders,
});

const RETRY_DELAYS_RATE_LIMIT = [1000, 3000];
const RETRY_DELAYS_NETWORK = [500, 2000];
const RETRY_DELAYS_5XX = [1000];

const pickDelays = (err: LLMError): number[] => {
    if (err.code === "rate_limit") return RETRY_DELAYS_RATE_LIMIT;
    if (err.code === "network") return RETRY_DELAYS_NETWORK;
    if (err.code === "unknown" && err.httpStatus && err.httpStatus >= 500) return RETRY_DELAYS_5XX;
    return [];
};

async function attempt(
    text: string,
    target: string,
    secondary: string,
    settings: Settings,
    signal: AbortSignal,
    fetchFn: FetchFn
): Promise<Response> {
    const url = settings.baseUrl.replace(/\/$/, "") + "/chat/completions";
    let response: Response;
    try {
        response = await fetchFn(url, {
            method: "POST",
            headers: buildHeaders(settings),
            body: buildBody(text, target, secondary, settings),
            signal,
        });
    } catch (err) {
        throw normalizeError(null, null, err);
    }
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw normalizeError(response, body);
    }
    return response;
}

export async function* stream(
    text: string,
    target: string,
    settings: Settings,
    signal: AbortSignal,
    fetchFn: FetchFn = fetch
): AsyncGenerator<string> {
    if (!settings.apiKey) {
        throw {
            code: "auth",
            message: "请先在扩展设置中填入 API Key",
            retryable: false,
        } satisfies LLMError;
    }
    if (!settings.baseUrl) {
        throw {
            code: "auth",
            message: "请先在扩展设置中填入 Base URL",
            retryable: false,
        } satisfies LLMError;
    }

    let response: Response | null = null;
    let lastErr: LLMError | null = null;
    const allDelays = [0, ...RETRY_DELAYS_RATE_LIMIT, ...RETRY_DELAYS_NETWORK, ...RETRY_DELAYS_5XX];
    let attempts = 0;
    while (attempts < allDelays.length + 1) {
        try {
            response = await attempt(text, target, settings.secondaryTarget, settings, signal, fetchFn);
            break;
        } catch (e) {
            const err = e as LLMError;
            lastErr = err;
            if (!err.retryable) throw err;
            const delays = pickDelays(err);
            if (attempts >= delays.length) throw err;
            await sleep(delays[attempts], signal);
            attempts++;
        }
    }
    if (!response) throw lastErr ?? { code: "unknown", message: "无响应", retryable: false } as LLMError;

    try {
        for await (const chunk of streamFromResponse(response)) {
            yield chunk;
        }
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            throw normalizeError(null, null, e);
        }
        throw {
            code: "bad_response",
            message: "翻译过程中断，请重试",
            retryable: false,
        } satisfies LLMError;
    }
}
