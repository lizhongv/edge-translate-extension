import type { LLMError } from "../shared/types";

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
