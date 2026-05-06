export type Settings = {
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    customHeaders: Record<string, string>;
    primaryTarget: string;
    secondaryTarget: string;
    longTextThreshold: number;
    historyLimit: number;
    shortcut: string;
};

export type HistoryItem = {
    id: string;
    sourceText: string;
    translatedText: string;
    targetLang: string;
    model: string;
    timestamp: number;
    pageOrigin?: string;
};

export type LLMErrorCode =
    | "auth"
    | "rate_limit"
    | "context_too_long"
    | "network"
    | "bad_response"
    | "aborted"
    | "unknown";

export type LLMError = {
    code: LLMErrorCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
};

export type PortMessage =
    | { type: "translate"; text: string }
    | { type: "token"; chunk: string }
    | { type: "done"; full: string }
    | { type: "error"; error: LLMError };

export type RuntimeMessage =
    | { type: "showCard" }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "openOptions" };

export type CacheEntry = {
    key: string;
    value: string;
    timestamp: number;
};

export const DEFAULT_SYSTEM_PROMPT =
    "You are a professional translator. Translate the user's input into {{TARGET_LANG}}.\n" +
    "Output only the translation itself: no explanations, no quotes, no markdown.\n" +
    "Preserve original formatting (line breaks, lists).\n" +
    "If the input is already in {{TARGET_LANG}}, translate it into {{SECONDARY_LANG}} instead.";

export const DEFAULT_SETTINGS: Settings = {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.2,
    customHeaders: {},
    primaryTarget: "中文",
    secondaryTarget: "English",
    longTextThreshold: 5000,
    historyLimit: 200,
    shortcut: "Alt+T",
};
