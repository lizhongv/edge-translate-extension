import { describe, it, expect } from "vitest";
import { computeCacheKey, getCachedTranslation, setCachedTranslation } from "../../src/background/cache";

describe("computeCacheKey", () => {
    it("same input produces same key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        expect(a).toBe(b);
    });
    it("different text produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("world", "中文", "gpt-4o-mini");
        expect(a).not.toBe(b);
    });
    it("different target produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "English", "gpt-4o-mini");
        expect(a).not.toBe(b);
    });
    it("different model produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "中文", "gpt-4o");
        expect(a).not.toBe(b);
    });
    it("returns hex string", async () => {
        const k = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        expect(k).toMatch(/^[0-9a-f]+$/);
    });
});

describe("get/set cached translation", () => {
    it("miss returns undefined", async () => {
        const r = await getCachedTranslation("hi", "中文", "m");
        expect(r).toBeUndefined();
    });
    it("set then get returns value", async () => {
        await setCachedTranslation("hi", "中文", "m", "你好");
        const r = await getCachedTranslation("hi", "中文", "m");
        expect(r).toBe("你好");
    });
});
