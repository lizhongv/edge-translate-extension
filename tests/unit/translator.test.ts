import { describe, it, expect, vi } from "vitest";
import { translate } from "../../src/background/translator";
import { setSettings, getHistory } from "../../src/shared/storage";
import { setCachedTranslation } from "../../src/background/cache";

const mkPort = () => {
    const messages: any[] = [];
    return {
        port: { postMessage: vi.fn((m: any) => { messages.push(m); }) },
        messages,
    };
};

describe("translate orchestration", () => {
    it("cache hit → skip stream, emit done, write history", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        await setCachedTranslation("hello", "中文", "m", "你好");
        const { port, messages } = mkPort();
        const fakeStream = vi.fn();
        await translate("hello", port as any, new AbortController().signal, fakeStream);
        expect(fakeStream).not.toHaveBeenCalled();
        expect(messages).toEqual([{ type: "done", full: "你好" }]);
        const history = await getHistory();
        expect(history[0].sourceText).toBe("hello");
        expect(history[0].translatedText).toBe("你好");
    });

    it("cache miss → calls stream, pushes tokens, then done, writes cache+history", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* fakeStream() {
            yield "你";
            yield "好";
        }
        const streamFn = vi.fn(() => fakeStream());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages).toEqual([
            { type: "token", chunk: "你" },
            { type: "token", chunk: "好" },
            { type: "done", full: "你好" },
        ]);
        const h = await getHistory();
        expect(h[0].translatedText).toBe("你好");
    });

    it("stream throws LLMError → emits error, no history/cache write", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* failing() {
            yield "你";
            throw { code: "bad_response", message: "broken", retryable: false };
        }
        const streamFn = vi.fn(() => failing());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages[0]).toEqual({ type: "token", chunk: "你" });
        expect(messages[1]).toEqual({ type: "error", error: { code: "bad_response", message: "broken", retryable: false } });
        const h = await getHistory();
        expect(h.length).toBe(0);
    });

    it("aborted error → no history, no error post (silent cancel)", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* aborted() {
            throw { code: "aborted", message: "x", retryable: false };
        }
        const streamFn = vi.fn(() => aborted());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages).toEqual([]);
        expect((await getHistory()).length).toBe(0);
    });
});
