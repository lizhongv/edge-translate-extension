import { describe, it, expect } from "vitest";
import {
    msgTranslate, msgToken, msgDone, msgError,
    isTranslateMsg, isTokenMsg, isDoneMsg, isErrorMsg,
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenOptions,
} from "../../src/shared/messages";

describe("port message constructors", () => {
    it("msgTranslate", () => {
        expect(msgTranslate("hi")).toEqual({ type: "translate", text: "hi" });
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
    it("isTranslateMsg", () => {
        expect(isTranslateMsg({ type: "translate", text: "x" })).toBe(true);
        expect(isTranslateMsg({ type: "token", chunk: "x" })).toBe(false);
        expect(isTranslateMsg(null)).toBe(false);
        expect(isTranslateMsg({})).toBe(false);
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
        expect(rtRequestTranslate()).toEqual({ type: "requestTranslate" });
        expect(rtHistoryUpdated()).toEqual({ type: "historyUpdated" });
        expect(rtOpenOptions()).toEqual({ type: "openOptions" });
    });
});
