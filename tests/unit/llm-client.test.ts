import { describe, it, expect, vi } from "vitest";
import { normalizeError } from "../../src/background/llm-client";
import { parseSSEChunks, streamFromResponse, stream } from "../../src/background/llm-client";
import { DEFAULT_SETTINGS } from "../../src/shared/types";

describe("normalizeError", () => {
    it("401 → auth", () => {
        const e = normalizeError(new Response("", { status: 401 }), null);
        expect(e.code).toBe("auth");
        expect(e.retryable).toBe(false);
        expect(e.httpStatus).toBe(401);
    });

    it("403 → auth", () => {
        const e = normalizeError(new Response("", { status: 403 }), null);
        expect(e.code).toBe("auth");
    });

    it("429 → rate_limit retryable", () => {
        const e = normalizeError(new Response("", { status: 429 }), null);
        expect(e.code).toBe("rate_limit");
        expect(e.retryable).toBe(true);
    });

    it("400 with token/context body → context_too_long", () => {
        const e = normalizeError(
            new Response("", { status: 400 }),
            "This model's maximum context length is 8192 tokens"
        );
        expect(e.code).toBe("context_too_long");
        expect(e.retryable).toBe(false);
    });

    it("400 without token clue → unknown", () => {
        const e = normalizeError(new Response("", { status: 400 }), "bad request");
        expect(e.code).toBe("unknown");
    });

    it("500 → unknown retryable", () => {
        const e = normalizeError(new Response("", { status: 500 }), null);
        expect(e.code).toBe("unknown");
        expect(e.retryable).toBe(true);
    });

    it("AbortError → aborted", () => {
        const err = new DOMException("aborted", "AbortError");
        const e = normalizeError(null, null, err);
        expect(e.code).toBe("aborted");
        expect(e.retryable).toBe(false);
    });

    it("TypeError → network retryable", () => {
        const err = new TypeError("fetch failed");
        const e = normalizeError(null, null, err);
        expect(e.code).toBe("network");
        expect(e.retryable).toBe(true);
    });
});

describe("parseSSEChunks", () => {
    it("extracts content from delta", () => {
        const lines = [
            'data: {"choices":[{"delta":{"content":"你"}}]}',
            'data: {"choices":[{"delta":{"content":"好"}}]}',
        ].join("\n\n") + "\n\n";
        expect([...parseSSEChunks(lines)]).toEqual(["你", "好"]);
    });

    it("ignores [DONE]", () => {
        const lines = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["hi"]);
    });

    it("ignores lines without data:", () => {
        const lines = ': comment\n\nevent: ping\n\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["x"]);
    });

    it("yields empty content as empty string (skipped)", () => {
        const lines = 'data: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[{"delta":{"content":"a"}}]}\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["a"]);
    });

    it("throws on malformed JSON", () => {
        const lines = "data: {oops\n\n";
        expect(() => [...parseSSEChunks(lines)]).toThrow();
    });
});

describe("streamFromResponse", () => {
    const mkResponse = (text: string) => {
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(enc.encode(text));
                c.close();
            },
        });
        return new Response(stream);
    };

    it("yields content tokens in order", async () => {
        const r = mkResponse(
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
            'data: [DONE]\n\n'
        );
        const out: string[] = [];
        for await (const t of streamFromResponse(r)) out.push(t);
        expect(out).toEqual(["hello", " world"]);
    });

    it("handles split chunks across reads", async () => {
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hel'));
                c.enqueue(enc.encode('lo"}}]}\n\n'));
                c.enqueue(enc.encode('data: [DONE]\n\n'));
                c.close();
            },
        });
        const r = new Response(stream);
        const out: string[] = [];
        for await (const t of streamFromResponse(r)) out.push(t);
        expect(out).toEqual(["hello"]);
    });
});

describe("stream", () => {
    const mkSseResponse = (status: number, sse: string) => {
        if (status !== 200) return new Response("err", { status });
        const enc = new TextEncoder();
        const s = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(enc.encode(sse)); c.close(); },
        });
        return new Response(s, { status });
    };

    const happy = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n';

    it("yields tokens on 200 SSE", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn().mockResolvedValue(mkSseResponse(200, happy));
        const out: string[] = [];
        for await (const t of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
            out.push(t);
        }
        expect(out).toEqual(["你好"]);
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.model).toBe("m");
        expect(body.stream).toBe(true);
        expect(body.messages[0].content).toContain("中文");
        expect(body.messages[1].content).toBe("hi");
    });

    it("retries on 429 with backoff (max 2 retries)", { timeout: 10000 }, async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn()
            .mockResolvedValueOnce(mkSseResponse(429, ""))
            .mockResolvedValueOnce(mkSseResponse(429, ""))
            .mockResolvedValueOnce(mkSseResponse(200, happy));
        const out: string[] = [];
        for await (const t of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
            out.push(t);
        }
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(out).toEqual(["你好"]);
    });

    it("throws auth on 401 without retry", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn().mockResolvedValue(mkSseResponse(401, ""));
        await expect(async () => {
            for await (const _ of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
                /* noop */
            }
        }).rejects.toMatchObject({ code: "auth" });
        expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("throws auth when apiKey is empty without calling fetch", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "", model: "m" };
        const fetchSpy = vi.fn();
        await expect(async () => {
            for await (const _ of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
                /* noop */
            }
        }).rejects.toMatchObject({ code: "auth" });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("aborts mid-stream", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const ctrl = new AbortController();
        const fetchSpy = vi.fn().mockImplementation(() => {
            return new Promise((_, rej) => {
                ctrl.signal.addEventListener("abort", () =>
                    rej(new DOMException("aborted", "AbortError"))
                );
            });
        });
        const promise = (async () => {
            const out: string[] = [];
            for await (const t of stream("hi", "中文", settings, ctrl.signal, fetchSpy)) {
                out.push(t);
            }
            return out;
        })();
        ctrl.abort();
        await expect(promise).rejects.toMatchObject({ code: "aborted" });
    });
});
