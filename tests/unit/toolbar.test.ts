import { describe, it, expect, beforeEach, vi } from "vitest";
import { Toolbar } from "../../src/content/toolbar";

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

const mkActions = () => [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];

describe("Toolbar.show / hide", () => {
    it("starts not shown", () => {
        const t = new Toolbar();
        expect(t.isShown()).toBe(false);
    });

    it("show appends a host with N buttons", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        expect(root.querySelectorAll(".btn").length).toBe(2);
        expect(t.isShown()).toBe(true);
    });

    it("hide removes the host", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        t.hide();
        expect(document.body.children.length).toBe(0);
        expect(t.isShown()).toBe(false);
    });

    it("repeated show does not stack hosts", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        t.show(mkRect(20, 20, 200, 40), mkActions(), () => {});
        expect(document.body.children.length).toBe(1);
    });

    it("hide when not shown is a no-op", () => {
        const t = new Toolbar();
        expect(() => t.hide()).not.toThrow();
    });
});

describe("Toolbar click", () => {
    it("clicking a button invokes onPick with id", () => {
        const t = new Toolbar();
        const cb = vi.fn();
        t.show(mkRect(10, 10, 100, 30), mkActions(), cb);
        const root = (t as any).root as ShadowRoot;
        const btns = root.querySelectorAll<HTMLButtonElement>(".btn");
        btns[1].click();
        expect(cb).toHaveBeenCalledWith("qa");
    });

    it("clicking a button hides the toolbar", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const btn = root.querySelector<HTMLButtonElement>(".btn")!;
        btn.click();
        expect(t.isShown()).toBe(false);
    });
});

describe("Toolbar position", () => {
    const winW = 1000;
    const winH = 800;
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: winW, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: winH, configurable: true });
    });

    it("default places at bottom-right edge of selection rect", () => {
        const t = new Toolbar();
        t.show(mkRect(100, 100, 200, 130), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        const expectedWidth = 28 * 2;
        expect(bar.style.left).toBe(`${200 - expectedWidth}px`);
        expect(bar.style.top).toBe(`${130 + 4}px`);
    });

    it("right-edge overflow → pull back inside viewport", () => {
        const t = new Toolbar();
        t.show(mkRect(900, 100, winW + 50, 130), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        const left = parseInt(bar.style.left, 10);
        expect(left + 28 * 2).toBeLessThanOrEqual(winW - 4);
    });

    it("bottom-edge overflow → place above selection", () => {
        const t = new Toolbar();
        t.show(mkRect(100, winH - 10, 200, winH + 20), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        expect(parseInt(bar.style.top, 10)).toBeLessThan(winH - 10);
    });
});

describe("Toolbar.contains", () => {
    it("returns false when not shown", () => {
        const t = new Toolbar();
        expect(t.contains(document.body)).toBe(false);
    });

    it("returns true for host", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const host = document.body.firstElementChild;
        expect(t.contains(host)).toBe(true);
    });

    it("returns false for foreign nodes", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const other = document.createElement("div");
        document.body.appendChild(other);
        expect(t.contains(other)).toBe(false);
    });
});
