import { describe, it, expect, beforeEach } from "vitest";
import { FloatingCard } from "../../src/content/floating-card";

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

const bodyOf = (c: FloatingCard): HTMLElement =>
    ((c as any).root as ShadowRoot).querySelector(".body") as HTMLElement;

describe("FloatingCard thinking indicator", () => {
    it("setThinking replaces the loading label with 思考中…", () => {
        const c = new FloatingCard();
        c.mount(mkRect(0, 0, 10, 10));
        expect(bodyOf(c).textContent).toContain("翻译中");
        c.setThinking();
        expect(bodyOf(c).textContent).toContain("思考中");
        expect(bodyOf(c).textContent).not.toContain("翻译中");
        expect(bodyOf(c).querySelector(".spinner")).not.toBeNull();
    });

    it("the first content token clears the 思考中… placeholder", () => {
        const c = new FloatingCard();
        c.mount(mkRect(0, 0, 10, 10));
        c.setThinking();
        c.appendToken("你好");
        expect(bodyOf(c).textContent).toBe("你好");
    });

    it("setThinking is idempotent and does not stack placeholders", () => {
        const c = new FloatingCard();
        c.mount(mkRect(0, 0, 10, 10));
        c.setThinking();
        c.setThinking();
        c.setThinking();
        expect(bodyOf(c).querySelectorAll(".spinner").length).toBe(1);
        expect(bodyOf(c).textContent).toBe("思考中…");
    });
});
