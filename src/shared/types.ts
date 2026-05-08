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
    enableHoverButton: boolean;
    enableQA: boolean;
    qaSystemPrompt: string;
    qaMaxTurns: number;
    enableMemo: boolean;
    enableSettingsButton: boolean;
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

export type TaskRequest =
    | { task: "translate"; text: string }
    | { task: "qa"; sessionId: string; sourceText: string; messages: ChatMessage[] };

export type PortMessage =
    | { type: "task"; payload: TaskRequest }
    | { type: "token"; chunk: string }
    | { type: "done"; full: string }
    | { type: "error"; error: LLMError };

export type RuntimeMessage =
    | { type: "showCard"; text?: string }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "qaSessionUpdated"; sessionId: string }
    | { type: "openQA"; text?: string }
    | { type: "openOptions" }
    | { type: "saveMemo"; text: string; pageUrl?: string; pageTitle?: string }
    | { type: "memoUpdated" }
    | { type: "openSidepanel"; tab?: "translate" | "qa" | "memo" };

export type CacheEntry = {
    key: string;
    value: string;
    timestamp: number;
};

export type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

export type QASession = {
    id: string;
    sourceText: string;
    pageOrigin?: string;
    model: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
};

export type MemoSource = "selection" | "qa";

export type Memo = {
    id: string;
    title: string;
    content: string;
    source: MemoSource;
    sourceContext?: string;
    pageUrl?: string;
    pageTitle?: string;
    createdAt: number;
    updatedAt: number;
};

export const DEFAULT_SYSTEM_PROMPT =
    "You are a professional translator. Translate the user's input into {{TARGET_LANG}}.\n" +
    "Output only the translation itself: no explanations, no quotes, no markdown.\n" +
    "Preserve original formatting (line breaks, lists).\n" +
    "If the input is already in {{TARGET_LANG}}, translate it into {{SECONDARY_LANG}} instead.";

export const DEFAULT_QA_SYSTEM_PROMPT =
    "You are a helpful assistant. The user has selected a passage of text from a webpage and will ask questions about it.\n" +
    "The selected text is provided as context. Answer the user's questions concisely and accurately, in the same language the user uses.\n" +
    "If the user's question is unrelated to the text, still try to be helpful.\n" +
    "Output plain text. Do not use markdown unless asked.";

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
    enableHoverButton: true,
    enableQA: true,
    qaSystemPrompt: DEFAULT_QA_SYSTEM_PROMPT,
    qaMaxTurns: 6,
    enableMemo: true,
    enableSettingsButton: true,
};
