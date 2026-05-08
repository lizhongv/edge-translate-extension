import { describe, it, expect, beforeEach, vi } from "vitest";
import { QACard } from "../../src/content/qa-card";

beforeEach(() => {
    document.body.innerHTML = "";
});

const mkRect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left, top, right, bottom,
    x: left, y: top,
    width: right - left,
    height: bottom - top,
    toJSON() { return this; },
} as DOMRect);

const makeCb = () => ({
    onSend: vi.fn(),
    onClose: vi.fn(),
    onOpenOptions: vi.fn(),
    onRetry: vi.fn(),
});

const innerRoot = (c: QACard): ShadowRoot => (c as any).root as ShadowRoot;

describe("QACard mount/unmount", () => {
    it("mount appends host", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "source", makeCb());
        expect(document.body.children.length).toBe(1);
    });

    it("unmount removes host", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "source", makeCb());
        c.unmount();
        expect(document.body.children.length).toBe(0);
    });

    it("renders source text in collapsed source row", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "the source", makeCb());
        const root = innerRoot(c);
        expect(root.querySelector(".source-text")?.textContent).toBe("the source");
    });

    it("textarea is initially focused and enabled", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "src", makeCb());
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        expect(ta.disabled).toBe(false);
    });
});

describe("QACard input → onSend", () => {
    it("Enter triggers onSend with messages array containing user msg", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "请解释";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(cb.onSend).toHaveBeenCalledOnce();
        const msgs = cb.onSend.mock.calls[0][0];
        expect(msgs).toEqual([{ role: "user", content: "请解释" }]);
    });

    it("Shift+Enter does NOT trigger onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "请解释";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
        expect(cb.onSend).not.toHaveBeenCalled();
    });

    it("send button click triggers onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q?";
        const send = root.querySelector<HTMLButtonElement>(".send")!;
        send.click();
        expect(cb.onSend).toHaveBeenCalledOnce();
    });

    it("empty input does not call onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "   ";
        const send = root.querySelector<HTMLButtonElement>(".send")!;
        send.click();
        expect(cb.onSend).not.toHaveBeenCalled();
    });

    it("subsequent send accumulates history", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;

        // 第一轮
        ta.value = "Q1";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.endAssistant("A1");

        // 第二轮
        ta.value = "Q2";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        const lastCall = cb.onSend.mock.calls[1][0];
        expect(lastCall).toEqual([
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
        ]);
    });
});

describe("QACard streaming lifecycle", () => {
    it("beginAssistant disables textarea + adds empty assistant bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        expect(ta.disabled).toBe(true);
        const bubbles = root.querySelectorAll(".msg");
        expect(bubbles.length).toBe(2); // user + assistant
        expect(bubbles[1].classList.contains("assistant")).toBe(true);
    });

    it("appendToken writes into the last assistant bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.appendToken("Hel");
        c.appendToken("lo");
        const last = root.querySelectorAll(".msg.assistant .content");
        expect(last[last.length - 1].textContent).toBe("Hello");
    });

    it("endAssistant re-enables textarea and adds copy button", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.appendToken("Answer");
        c.endAssistant("Answer");
        expect(ta.disabled).toBe(false);
        expect(ta.value).toBe("");
        const lastBubble = root.querySelectorAll(".msg.assistant");
        expect(lastBubble[lastBubble.length - 1].querySelector(".copy")).toBeTruthy();
    });

    it("endAssistant renders 复制原文 + 复制答案 + 保存到备忘录", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "the-source", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.endAssistant("Answer");
        const lastBubble = Array.from(root.querySelectorAll(".msg.assistant")).pop()!;
        const btns = Array.from(lastBubble.querySelectorAll<HTMLButtonElement>("button"));
        const labels = btns.map(b => b.textContent);
        expect(labels).toContain("复制答案");
        expect(labels).toContain("复制原文");
        expect(labels).toContain("保存到备忘录");
    });

    it("failAssistant marks bubble error and re-enables textarea", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "auth", message: "bad key", retryable: false });
        expect(ta.disabled).toBe(false);
        const last = root.querySelectorAll(".msg.assistant");
        expect(last[last.length - 1].classList.contains("error")).toBe(true);
    });
});

describe("QACard close", () => {
    it("close button calls onClose and unmounts", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const close = root.querySelector<HTMLButtonElement>(".close")!;
        close.click();
        expect(cb.onClose).toHaveBeenCalledOnce();
        expect(document.body.children.length).toBe(0);
    });

    it("Escape key calls onClose", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(cb.onClose).toHaveBeenCalledOnce();
    });
});

describe("QACard turn cap notice", () => {
    it("shows notice when message count >= maxTurns*2", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        // 模拟已经积累 6 轮（12 条）
        for (let i = 0; i < 6; i++) {
            c.setMessages([
                ...c.getMessages(),
                { role: "user", content: `Q${i}` },
                { role: "assistant", content: `A${i}` },
            ]);
        }
        c.showTurnCapNotice(6);
        const root = innerRoot(c);
        const notice = root.querySelector(".notice");
        expect(notice?.textContent).toContain("6");
    });
});

describe("QACard abort rollback", () => {
    it("rollbackUserTurn removes last user msg from messages and bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();

        c.rollbackUserTurn();
        expect(c.getMessages()).toEqual([]);
        const userBubbles = root.querySelectorAll(".msg.user");
        expect(userBubbles.length).toBe(0);
        expect(ta.disabled).toBe(false);
    });
});

describe("QACard error actions", () => {
    it("auth error shows '打开设置' button → onOpenOptions", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "auth", message: "API Key 无效", retryable: false });
        const openBtn = root.querySelector<HTMLButtonElement>(".action-options");
        expect(openBtn).toBeTruthy();
        openBtn!.click();
        expect(cb.onOpenOptions).toHaveBeenCalledOnce();
    });

    it("retryable error shows '重试' button → onRetry", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "network", message: "网络异常", retryable: true });
        const retryBtn = root.querySelector<HTMLButtonElement>(".action-retry");
        expect(retryBtn).toBeTruthy();
        retryBtn!.click();
        expect(cb.onRetry).toHaveBeenCalledOnce();
    });
});
