import type { ChatMessage, LLMError, PortMessage, RuntimeMessage } from "./types";

export const msgTaskTranslate = (text: string): PortMessage => ({
    type: "task",
    payload: { task: "translate", text },
});

export const msgTaskQA = (
    sessionId: string,
    sourceText: string,
    messages: ChatMessage[]
): PortMessage => ({
    type: "task",
    payload: { task: "qa", sessionId, sourceText, messages },
});

export const msgToken = (chunk: string): PortMessage => ({ type: "token", chunk });
export const msgDone = (full: string): PortMessage => ({ type: "done", full });
export const msgError = (error: LLMError): PortMessage => ({ type: "error", error });

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

export const isTaskMsg = (
    v: unknown
): v is { type: "task"; payload: { task: "translate"; text: string } |
                                  { task: "qa"; sessionId: string; sourceText: string; messages: ChatMessage[] } } => {
    if (!isObj(v) || v.type !== "task" || !isObj(v.payload)) return false;
    const p = v.payload;
    if (p.task === "translate") return typeof p.text === "string";
    if (p.task === "qa") {
        return typeof p.sessionId === "string"
            && typeof p.sourceText === "string"
            && Array.isArray(p.messages);
    }
    return false;
};

export const isTokenMsg = (v: unknown): v is { type: "token"; chunk: string } =>
    isObj(v) && v.type === "token" && typeof v.chunk === "string";

export const isDoneMsg = (v: unknown): v is { type: "done"; full: string } =>
    isObj(v) && v.type === "done" && typeof v.full === "string";

export const isErrorMsg = (v: unknown): v is { type: "error"; error: LLMError } =>
    isObj(v) && v.type === "error" && isObj(v.error);

export const rtShowCard = (text?: string): RuntimeMessage =>
    text !== undefined ? { type: "showCard", text } : { type: "showCard" };
export const rtRequestTranslate = (): RuntimeMessage => ({ type: "requestTranslate" });
export const rtHistoryUpdated = (): RuntimeMessage => ({ type: "historyUpdated" });
export const rtOpenOptions = (): RuntimeMessage => ({ type: "openOptions" });
export const rtQASessionUpdated = (sessionId: string): RuntimeMessage => ({
    type: "qaSessionUpdated",
    sessionId,
});
export const rtOpenQA = (text?: string): RuntimeMessage =>
    text !== undefined ? { type: "openQA", text } : { type: "openQA" };

const KNOWN_RT_TYPES = [
    "showCard", "requestTranslate", "historyUpdated",
    "qaSessionUpdated", "openQA", "openOptions",
] as const;

export const isRuntimeMessage = (v: unknown): v is RuntimeMessage =>
    isObj(v)
    && typeof v.type === "string"
    && (KNOWN_RT_TYPES as readonly string[]).includes(v.type);
