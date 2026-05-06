import { describe, it, expect } from "vitest";
import { normalizeError } from "../../src/background/llm-client";
import { parseSSEChunks, streamFromResponse } from "../../src/background/llm-client";

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
