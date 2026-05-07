import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble,
    setBubbleError,
} from "../../src/shared/qa-render";

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("createMessageBubble", () => {
    it("creates a user bubble with role+content", () => {
        const el = createMessageBubble("user", "hello");
        expect(el.classList.contains("msg")).toBe(true);
        expect(el.classList.contains("user")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toBe("hello");
    });

    it("creates an assistant bubble with empty content", () => {
        const el = createMessageBubble("assistant", "");
        expect(el.classList.contains("assistant")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toBe("");
    });
});

describe("appendTokenToBubble", () => {
    it("appends to .content text", () => {
        const el = createMessageBubble("assistant", "");
        appendTokenToBubble(el, "Hello ");
        appendTokenToBubble(el, "world");
        expect(el.querySelector(".content")?.textContent).toBe("Hello world");
    });
});

describe("finalizeBubble", () => {
    it("appends [复制] button and wires clipboard", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "answer");
        finalizeBubble(el, "answer");
        const btn = el.querySelector<HTMLButtonElement>(".copy")!;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toBe("复制");
        btn.click();
        expect(writeText).toHaveBeenCalledWith("answer");
    });
});

describe("setBubbleError", () => {
    it("marks bubble as error and shows message", () => {
        const el = createMessageBubble("assistant", "");
        setBubbleError(el, "API Key 无效");
        expect(el.classList.contains("error")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toContain("API Key 无效");
    });
});
