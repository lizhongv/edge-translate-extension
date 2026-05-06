import { describe, it, expect, beforeEach } from "vitest";
import { getSelectionText, getSelectionRect } from "../../src/content/selection";

beforeEach(() => {
    document.body.innerHTML = "";
    window.getSelection()?.removeAllRanges();
});

describe("getSelectionText", () => {
    it("returns empty string when nothing selected", () => {
        expect(getSelectionText()).toBe("");
    });

    it("returns selected text", () => {
        const p = document.createElement("p");
        p.textContent = "hello world";
        document.body.appendChild(p);
        const range = document.createRange();
        range.selectNodeContents(p);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        expect(getSelectionText()).toBe("hello world");
    });
});

describe("getSelectionRect", () => {
    it("returns null when no selection", () => {
        expect(getSelectionRect()).toBeNull();
    });
});
