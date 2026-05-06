import { describe, it, expect } from "vitest";
import { detectChineseRatio, isChineseDominant } from "../../src/shared/lang";

describe("detectChineseRatio", () => {
    it("returns 0 for empty string", () => {
        expect(detectChineseRatio("")).toBe(0);
    });
    it("returns 0 for pure English", () => {
        expect(detectChineseRatio("hello world")).toBe(0);
    });
    it("returns 1 for pure Chinese", () => {
        expect(detectChineseRatio("你好世界")).toBe(1);
    });
    it("returns ratio for mixed content", () => {
        const r = detectChineseRatio("hello你好");
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThan(1);
    });
    it("ignores ASCII punctuation and whitespace", () => {
        expect(detectChineseRatio("你好, world!")).toBeCloseTo(2 / (2 + 5), 2);
    });
    it("treats Japanese kana as CJK", () => {
        expect(detectChineseRatio("こんにちは")).toBe(1);
    });
});

describe("isChineseDominant", () => {
    it("true for >50% CJK", () => {
        expect(isChineseDominant("你好世界 hi")).toBe(true);
    });
    it("false for <50% CJK", () => {
        expect(isChineseDominant("hello world 你")).toBe(false);
    });
    it("false for empty", () => {
        expect(isChineseDominant("")).toBe(false);
    });
});
