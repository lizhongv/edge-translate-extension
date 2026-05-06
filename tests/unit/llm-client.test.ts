import { describe, it, expect } from "vitest";
import { normalizeError } from "../../src/background/llm-client";

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
