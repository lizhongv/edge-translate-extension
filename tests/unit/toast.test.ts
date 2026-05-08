import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { showToast, _hideToastForTest } from "../../src/shared/toast";

beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    _hideToastForTest();
});

describe("showToast", () => {
    it("creates a host element", () => {
        showToast("hello");
        expect(document.body.children.length).toBe(1);
    });

    it("auto-hides after default 2000ms", () => {
        showToast("hi");
        expect(document.body.children.length).toBe(1);
        vi.advanceTimersByTime(2100);
        expect(document.body.children.length).toBe(0);
    });

    it("custom durationMs", () => {
        showToast("hi", { durationMs: 500 });
        vi.advanceTimersByTime(600);
        expect(document.body.children.length).toBe(0);
    });

    it("subsequent call replaces previous toast", () => {
        showToast("first");
        showToast("second");
        expect(document.body.children.length).toBe(1);
    });

    it("actionLabel click invokes onAction and closes immediately", () => {
        const onAction = vi.fn();
        showToast("saved", { actionLabel: "open", onAction });
        const root = (window as any).__lastToastRoot as ShadowRoot | undefined;
        expect(root).toBeTruthy();
        const btn = root!.querySelector<HTMLButtonElement>(".action")!;
        btn.click();
        expect(onAction).toHaveBeenCalledOnce();
        expect(document.body.children.length).toBe(0);
    });

    it("no action button when actionLabel omitted", () => {
        showToast("plain");
        const root = (window as any).__lastToastRoot as ShadowRoot | undefined;
        expect(root).toBeTruthy();
        expect(root!.querySelector(".action")).toBeNull();
    });
});
