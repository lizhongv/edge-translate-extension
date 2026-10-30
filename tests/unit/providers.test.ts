import { describe, expect, it } from "vitest";
import { CUSTOM_PROVIDER_ID, PROVIDERS, detectProvider, getProvider } from "../../src/shared/providers";
import { DEFAULT_SETTINGS } from "../../src/shared/types";

describe("providers", () => {
    it("每个预设字段完整且 id 唯一", () => {
        const ids = new Set<string>();
        for (const p of PROVIDERS) {
            expect(p.baseUrl).toMatch(/^https?:\/\//);
            expect(p.model.length).toBeGreaterThan(0);
            expect(ids.has(p.id)).toBe(false);
            ids.add(p.id);
        }
        expect(ids.has(CUSTOM_PROVIDER_ID)).toBe(false);
    });

    it("默认设置对应 DeepSeek 预设", () => {
        expect(detectProvider(DEFAULT_SETTINGS.baseUrl)).toBe("deepseek");
    });

    it("反查时忽略大小写、首尾空格与末尾斜杠", () => {
        expect(detectProvider("  HTTPS://api.openai.com/v1/ ")).toBe("openai");
    });

    it("未知地址归为自定义", () => {
        expect(detectProvider("https://example.com/v1")).toBe(CUSTOM_PROVIDER_ID);
        expect(getProvider(CUSTOM_PROVIDER_ID)).toBeUndefined();
    });
});
