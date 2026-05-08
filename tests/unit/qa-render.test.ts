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
    it("appends [复制答案] button and wires clipboard", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "answer");
        finalizeBubble(el, "answer");
        const btn = el.querySelector<HTMLButtonElement>(".copy")!;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toBe("复制答案");
        btn.click();
        expect(writeText).toHaveBeenCalledWith("answer");
    });

    it("renders [复制原文] when sourceText provided", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", { sourceText: "the source" });
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        const copySrc = Array.from(buttons).find(b => b.textContent === "复制原文");
        expect(copySrc).toBeTruthy();
        copySrc!.click();
        expect(writeText).toHaveBeenCalledWith("the source");
    });

    it("does NOT render [复制原文] when sourceText omitted", () => {
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans");
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        const copySrc = Array.from(buttons).find(b => b.textContent === "复制原文");
        expect(copySrc).toBeUndefined();
    });

    it("renders extraActions and triggers onClick", () => {
        const onSave = vi.fn();
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", {
            extraActions: [{ label: "保存到备忘录", onClick: onSave }],
        });
        const btns = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
        const saveBtn = btns.find(b => b.textContent === "保存到备忘录");
        expect(saveBtn).toBeTruthy();
        saveBtn!.click();
        expect(onSave).toHaveBeenCalledOnce();
    });

    it("idempotent: repeated finalizeBubble does not duplicate buttons", () => {
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", { sourceText: "src" });
        finalizeBubble(el, "ans", { sourceText: "src" });
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        // 复制答案 + 复制原文 = 2 buttons total
        expect(buttons.length).toBe(2);
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
