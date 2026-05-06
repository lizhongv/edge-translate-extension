import type { LLMError, PortMessage, RuntimeMessage } from "./types";

export const msgTranslate = (text: string): PortMessage => ({ type: "translate", text });
export const msgToken = (chunk: string): PortMessage => ({ type: "token", chunk });
export const msgDone = (full: string): PortMessage => ({ type: "done", full });
export const msgError = (error: LLMError): PortMessage => ({ type: "error", error });

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

export const isTranslateMsg = (v: unknown): v is { type: "translate"; text: string } =>
    isObj(v) && v.type === "translate" && typeof v.text === "string";

export const isTokenMsg = (v: unknown): v is { type: "token"; chunk: string } =>
    isObj(v) && v.type === "token" && typeof v.chunk === "string";

export const isDoneMsg = (v: unknown): v is { type: "done"; full: string } =>
    isObj(v) && v.type === "done" && typeof v.full === "string";

export const isErrorMsg = (v: unknown): v is { type: "error"; error: LLMError } =>
    isObj(v) && v.type === "error" && isObj(v.error);

export const rtShowCard = (): RuntimeMessage => ({ type: "showCard" });
export const rtRequestTranslate = (): RuntimeMessage => ({ type: "requestTranslate" });
export const rtHistoryUpdated = (): RuntimeMessage => ({ type: "historyUpdated" });
export const rtOpenOptions = (): RuntimeMessage => ({ type: "openOptions" });

export const isRuntimeMessage = (v: unknown): v is RuntimeMessage =>
    isObj(v)
    && typeof v.type === "string"
    && ["showCard", "requestTranslate", "historyUpdated", "openOptions"].includes(v.type);
