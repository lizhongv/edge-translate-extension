import { describe, it, expect, beforeEach, vi } from "vitest";
import { HoverButton, isInEditable } from "../../src/content/hover-button";

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

describe("HoverButton.show / hide", () => {
    it("starts not shown", () => {
        const btn = new HoverButton();
        expect(btn.isShown()).toBe(false);
    });

    it("show appends a host to document.body", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        expect(document.body.children.length).toBe(1);
        expect(btn.isShown()).toBe(true);
    });

    it("hide removes the host", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        btn.hide();
        expect(document.body.children.length).toBe(0);
        expect(btn.isShown()).toBe(false);
    });

    it("repeated show does not stack hosts", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        btn.show(mkRect(20, 20, 200, 40), () => {});
        expect(document.body.children.length).toBe(1);
    });

    it("hide when not shown is a no-op", () => {
        const btn = new HoverButton();
        expect(() => btn.hide()).not.toThrow();
    });
});

describe("HoverButton click", () => {
    // closed Shadow DOM: tests access the inner button via the private `button`
    // field with `(btn as any).button` cast (escape hatch, tests only).
    it("clicking the button invokes onClick callback", () => {
        const btn = new HoverButton();
        const cb = vi.fn();
        btn.show(mkRect(10, 10, 100, 30), cb);
        const innerBtn = (btn as any).button as HTMLButtonElement;
        expect(innerBtn).toBeTruthy();
        innerBtn.click();
        expect(cb).toHaveBeenCalledOnce();
    });

    it("clicking the button hides it", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        innerBtn.click();
        expect(btn.isShown()).toBe(false);
    });
});

describe("HoverButton position", () => {
    const winW = 1000;
    const winH = 800;
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: winW, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: winH, configurable: true });
    });

    it("default places at bottom-right of selection rect", () => {
        const btn = new HoverButton();
        btn.show(mkRect(100, 100, 200, 130), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        expect(innerBtn.style.left).toBe(`${200 - 28}px`);
        expect(innerBtn.style.top).toBe(`${130 + 4}px`);
    });

    it("right-edge overflow → pull back inside viewport", () => {
        const btn = new HoverButton();
        btn.show(mkRect(900, 100, winW + 50, 130), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        expect(parseInt(innerBtn.style.left, 10)).toBeLessThanOrEqual(winW - 28 - 4);
    });

    it("bottom-edge overflow → place above selection", () => {
        const btn = new HoverButton();
        btn.show(mkRect(100, winH - 10, 200, winH + 20), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        expect(parseInt(innerBtn.style.top, 10)).toBeLessThan(winH - 10);
    });
});

describe("isInEditable", () => {
    it("null node → false", () => {
        expect(isInEditable(null)).toBe(false);
    });

    it("input element → true", () => {
        const i = document.createElement("input");
        document.body.appendChild(i);
        expect(isInEditable(i)).toBe(true);
    });

    it("textarea element → true", () => {
        const t = document.createElement("textarea");
        document.body.appendChild(t);
        expect(isInEditable(t)).toBe(true);
    });

    it("contenteditable=true → true", () => {
        const d = document.createElement("div");
        d.setAttribute("contenteditable", "true");
        document.body.appendChild(d);
        expect(isInEditable(d)).toBe(true);
    });

    it("nested inside contenteditable → true", () => {
        const outer = document.createElement("div");
        outer.setAttribute("contenteditable", "true");
        const inner = document.createElement("span");
        outer.appendChild(inner);
        document.body.appendChild(outer);
        expect(isInEditable(inner)).toBe(true);
    });

    it("plain div → false", () => {
        const d = document.createElement("div");
        d.textContent = "hello";
        document.body.appendChild(d);
        expect(isInEditable(d)).toBe(false);
    });

    it("text node inside plain element → false", () => {
        const p = document.createElement("p");
        p.textContent = "hi";
        document.body.appendChild(p);
        expect(isInEditable(p.firstChild)).toBe(false);
    });
});
