import { describe, expect, it, vi } from "vitest";
import { fetchModels, isTextModel } from "../../src/shared/model-list";

const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("isTextModel", () => {
    it("保留常见文本对话模型", () => {
        for (const id of [
            "deepseek-chat", "deepseek-reasoner", "gpt-4o-mini", "gpt-4.1", "qwen-plus", "qwen-flash",
            "qwen3.7-max", "qwen-mt-plus", "qwen3-coder-flash", "glm-4-flash", "moonshot-v1-8k",
            "kimi/kimi-k3", "MiniMax/MiniMax-M3", "qwen2.5:7b",
        ]) {
            expect(isTextModel(id), id).toBe(true);
        }
    });

    // 以下名称取自通义千问兼容模式 /models 的实际返回
    it("排除向量、语音、图像、视觉与实时模型", () => {
        for (const id of [
            "qwen3.7-text-embedding", "qwen3.7-text-rerank", "text-embedding-3-small",
            "qwen3-tts-flash", "fun-asr-flash-2026-06-15", "qwen-audio-3.0-asr-flash", "whisper-1",
            "MiniMax/speech-02-hd", "qwen3-s2s-flash-realtime-2025-09-22", "qwen3-livetranslate-flash",
            "qwen-image-2.0", "wan2.7-image", "z-image-turbo", "dall-e-3", "cogview-4",
            "qwen3-vl-plus", "qwen-vl-ocr", "qwen3.5-omni-plus", "gui-plus",
        ]) {
            expect(isTextModel(id), id).toBe(false);
        }
    });
});

describe("fetchModels", () => {
    it("请求 {baseUrl}/models，去重排序并区分文本模型", async () => {
        const fetchFn = vi.fn(async () => json({
            data: [{ id: "qwen-plus" }, { id: "qwen-image-2.0" }, { id: "qwen-flash" }, { id: "qwen-plus" }],
        }));
        const r = await fetchModels("https://x.com/v1/", " sk-1 ", { "X-A": "1" }, undefined, fetchFn as unknown as typeof fetch);
        const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe("https://x.com/v1/models");
        expect(init.headers).toEqual({ Authorization: "Bearer sk-1", "X-A": "1" });
        expect(r.all).toEqual(["qwen-flash", "qwen-image-2.0", "qwen-plus"]);
        expect(r.text).toEqual(["qwen-flash", "qwen-plus"]);
    });

    it("has_more 时按 after=last_id 翻页", async () => {
        const fetchFn = vi.fn()
            .mockResolvedValueOnce(json({ data: [{ id: "a" }], has_more: true, last_id: "a" }))
            .mockResolvedValueOnce(json({ data: [{ id: "b" }], has_more: false, last_id: "b" }));
        const r = await fetchModels("https://x.com/v1", "k", {}, undefined, fetchFn);
        expect(fetchFn.mock.calls[1][0]).toBe("https://x.com/v1/models?after=a");
        expect(r.all).toEqual(["a", "b"]);
    });

    it("缺少地址或 Key 时直接报错，不发请求", async () => {
        const fetchFn = vi.fn();
        await expect(fetchModels("", "k", {}, undefined, fetchFn)).rejects.toThrow("接口地址");
        await expect(fetchModels("https://x.com/v1", " ", {}, undefined, fetchFn)).rejects.toThrow("API Key");
        expect(fetchFn).not.toHaveBeenCalled();
    });

    it.each([
        [401, "API Key 无效"],
        [404, "不支持获取模型列表"],
        [500, "HTTP 500"],
    ])("HTTP %i 给出对应提示", async (status, msg) => {
        const fetchFn = vi.fn(async () => json({ error: "x" }, status));
        await expect(fetchModels("https://x.com/v1", "k", {}, undefined, fetchFn as unknown as typeof fetch)).rejects.toThrow(msg);
    });

    it("网络错误与格式错误", async () => {
        const netErr = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        await expect(fetchModels("https://x.com/v1", "k", {}, undefined, netErr as unknown as typeof fetch)).rejects.toThrow("网络错误");
        const bad = vi.fn(async () => json({ models: [] }));
        await expect(fetchModels("https://x.com/v1", "k", {}, undefined, bad as unknown as typeof fetch)).rejects.toThrow("格式无法识别");
    });
});
