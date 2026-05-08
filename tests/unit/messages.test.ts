import { describe, it, expect } from "vitest";
import {
    msgTaskTranslate, msgTaskQA, msgToken, msgDone, msgError,
    isTaskMsg, isTokenMsg, isDoneMsg, isErrorMsg,
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenOptions,
    rtQASessionUpdated, rtOpenQA,
    rtSaveMemo, rtMemoUpdated, rtOpenSidepanel,
    isRuntimeMessage,
} from "../../src/shared/messages";

describe("port message constructors", () => {
    it("msgTaskTranslate", () => {
        expect(msgTaskTranslate("hi")).toEqual({
            type: "task",
            payload: { task: "translate", text: "hi" },
        });
    });
    it("msgTaskQA", () => {
        const msgs = [{ role: "user" as const, content: "Q" }];
        expect(msgTaskQA("sid", "src", msgs)).toEqual({
            type: "task",
            payload: { task: "qa", sessionId: "sid", sourceText: "src", messages: msgs },
        });
    });
    it("msgToken", () => {
        expect(msgToken("a")).toEqual({ type: "token", chunk: "a" });
    });
    it("msgDone", () => {
        expect(msgDone("full text")).toEqual({ type: "done", full: "full text" });
    });
    it("msgError", () => {
        const err = { code: "auth" as const, message: "bad", retryable: false };
        expect(msgError(err)).toEqual({ type: "error", error: err });
    });
});

describe("type guards", () => {
    it("isTaskMsg accepts translate", () => {
        expect(isTaskMsg({ type: "task", payload: { task: "translate", text: "x" } })).toBe(true);
    });
    it("isTaskMsg accepts qa", () => {
        expect(isTaskMsg({
            type: "task",
            payload: { task: "qa", sessionId: "s", sourceText: "x", messages: [] },
        })).toBe(true);
    });
    it("isTaskMsg rejects malformed", () => {
        expect(isTaskMsg({ type: "task" })).toBe(false);
        expect(isTaskMsg({ type: "task", payload: { task: "other" } })).toBe(false);
        expect(isTaskMsg(null)).toBe(false);
    });
    it("isTokenMsg", () => {
        expect(isTokenMsg({ type: "token", chunk: "x" })).toBe(true);
        expect(isTokenMsg({ type: "done", full: "x" })).toBe(false);
    });
    it("isDoneMsg", () => {
        expect(isDoneMsg({ type: "done", full: "x" })).toBe(true);
    });
    it("isErrorMsg", () => {
        expect(isErrorMsg({ type: "error", error: { code: "auth", message: "", retryable: false } })).toBe(true);
    });
});

describe("runtime message constructors", () => {
    it("constants", () => {
        expect(rtShowCard()).toEqual({ type: "showCard" });
        expect(rtShowCard("hi")).toEqual({ type: "showCard", text: "hi" });
        expect(rtRequestTranslate()).toEqual({ type: "requestTranslate" });
        expect(rtHistoryUpdated()).toEqual({ type: "historyUpdated" });
        expect(rtOpenOptions()).toEqual({ type: "openOptions" });
        expect(rtQASessionUpdated("sid-1")).toEqual({ type: "qaSessionUpdated", sessionId: "sid-1" });
        expect(rtOpenQA()).toEqual({ type: "openQA" });
        expect(rtOpenQA("text")).toEqual({ type: "openQA", text: "text" });
        expect(rtSaveMemo("hi")).toEqual({ type: "saveMemo", text: "hi" });
        expect(rtSaveMemo("hi", "https://x", "Title")).toEqual({
            type: "saveMemo", text: "hi", pageUrl: "https://x", pageTitle: "Title",
        });
        expect(rtMemoUpdated()).toEqual({ type: "memoUpdated" });
        expect(rtOpenSidepanel()).toEqual({ type: "openSidepanel" });
        expect(rtOpenSidepanel("memo")).toEqual({ type: "openSidepanel", tab: "memo" });
    });
    it("isRuntimeMessage accepts all known types", () => {
        expect(isRuntimeMessage({ type: "showCard" })).toBe(true);
        expect(isRuntimeMessage({ type: "qaSessionUpdated", sessionId: "x" })).toBe(true);
        expect(isRuntimeMessage({ type: "openQA" })).toBe(true);
        expect(isRuntimeMessage({ type: "unknown" })).toBe(false);
        expect(isRuntimeMessage(null)).toBe(false);
        expect(isRuntimeMessage({ type: "saveMemo", text: "x" })).toBe(true);
        expect(isRuntimeMessage({ type: "memoUpdated" })).toBe(true);
        expect(isRuntimeMessage({ type: "openSidepanel" })).toBe(true);
    });
});
