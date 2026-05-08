import { describe, it, expect } from "vitest";
import {
    getMemos, addMemo, updateMemo, deleteMemo, clearMemos, setSettings,
} from "../../src/shared/storage";
import type { Memo } from "../../src/shared/types";

const baseInput = (overrides: Partial<Omit<Memo, "id" | "createdAt" | "updatedAt">> = {}) => ({
    title: "",
    content: "hello world",
    source: "selection" as const,
    ...overrides,
});

describe("getMemos", () => {
    it("empty by default", async () => {
        const memos = await getMemos();
        expect(memos).toEqual([]);
    });
});

describe("addMemo", () => {
    it("auto-generates id and timestamps", async () => {
        const m = await addMemo(baseInput());
        expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(m.createdAt).toBeGreaterThan(0);
        expect(m.updatedAt).toBe(m.createdAt);
    });

    it("auto-fills title from first 30 chars when title is empty", async () => {
        const m = await addMemo(baseInput({ content: "abcdefghij".repeat(5) }));
        expect(m.title).toBe("abcdefghij".repeat(3));
        expect(m.title.length).toBe(30);
    });

    it("replaces newlines with spaces in auto title", async () => {
        const m = await addMemo(baseInput({ content: "line1\nline2\nline3" }));
        expect(m.title).toBe("line1 line2 line3");
    });

    it("preserves explicit title", async () => {
        const m = await addMemo(baseInput({ title: "Custom", content: "long body" }));
        expect(m.title).toBe("Custom");
    });

    it("respects historyLimit", async () => {
        await setSettings({ historyLimit: 2 });
        await addMemo(baseInput({ content: "a" }));
        await new Promise(r => setTimeout(r, 2));
        await addMemo(baseInput({ content: "b" }));
        await new Promise(r => setTimeout(r, 2));
        await addMemo(baseInput({ content: "c" }));
        const list = await getMemos();
        expect(list).toHaveLength(2);
        expect(list[0].content).toBe("c");
        expect(list[1].content).toBe("b");
    });
});

describe("getMemos sort", () => {
    it("returns memos sorted by updatedAt desc", async () => {
        const a = await addMemo(baseInput({ content: "a" }));
        await new Promise(r => setTimeout(r, 5));
        const b = await addMemo(baseInput({ content: "b" }));
        await new Promise(r => setTimeout(r, 5));
        await updateMemo(a.id, { content: "a-updated" });
        const list = await getMemos();
        expect(list[0].id).toBe(a.id);
        expect(list[1].id).toBe(b.id);
    });
});

describe("updateMemo", () => {
    it("updates title and content + bumps updatedAt", async () => {
        const m = await addMemo(baseInput());
        const oldUpdated = m.updatedAt;
        await new Promise(r => setTimeout(r, 5));
        await updateMemo(m.id, { title: "new", content: "new body" });
        const list = await getMemos();
        const updated = list.find(x => x.id === m.id)!;
        expect(updated.title).toBe("new");
        expect(updated.content).toBe("new body");
        expect(updated.updatedAt).toBeGreaterThan(oldUpdated);
    });

    it("falls back to first 30 chars when title is cleared", async () => {
        const m = await addMemo(baseInput({ title: "T", content: "body abc 12345 67890" }));
        await updateMemo(m.id, { title: "", content: "new body abc 12345" });
        const list = await getMemos();
        expect(list[0].title).toBe("new body abc 12345");
    });

    it("ignores unknown ids silently", async () => {
        await expect(updateMemo("nonexistent", { title: "x" })).resolves.not.toThrow();
    });
});

describe("deleteMemo / clearMemos", () => {
    it("deleteMemo removes by id", async () => {
        const a = await addMemo(baseInput({ content: "a" }));
        await addMemo(baseInput({ content: "b" }));
        await deleteMemo(a.id);
        const list = await getMemos();
        expect(list.map(m => m.content)).toEqual(["b"]);
    });

    it("clearMemos empties store", async () => {
        await addMemo(baseInput({ content: "a" }));
        await addMemo(baseInput({ content: "b" }));
        await clearMemos();
        const list = await getMemos();
        expect(list).toEqual([]);
    });
});
