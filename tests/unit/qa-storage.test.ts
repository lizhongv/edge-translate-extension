import { describe, it, expect } from "vitest";
import {
    getQASessions, upsertQASession, deleteQASession, clearQASessions,
} from "../../src/shared/storage";
import type { QASession } from "../../src/shared/types";

const mkSession = (id: string, updatedAt: number, messages: { role: "user" | "assistant"; content: string }[] = []): QASession => ({
    id,
    sourceText: `src-${id}`,
    model: "deepseek-chat",
    createdAt: updatedAt,
    updatedAt,
    messages,
});

describe("getQASessions", () => {
    it("empty by default", async () => {
        const sessions = await getQASessions();
        expect(sessions).toEqual([]);
    });

    it("returns sessions sorted by updatedAt desc", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 300));
        await upsertQASession(mkSession("c", 200));
        const list = await getQASessions();
        expect(list.map(s => s.id)).toEqual(["b", "c", "a"]);
    });
});

describe("upsertQASession", () => {
    it("inserts a new session", async () => {
        await upsertQASession(mkSession("a", 100));
        const list = await getQASessions();
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe("a");
    });

    it("updates existing session by id", async () => {
        await upsertQASession(mkSession("a", 100, [{ role: "user", content: "Q1" }]));
        await upsertQASession(mkSession("a", 200, [
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
        ]));
        const list = await getQASessions();
        expect(list).toHaveLength(1);
        expect(list[0].messages).toHaveLength(2);
        expect(list[0].updatedAt).toBe(200);
    });

    it("respects historyLimit when inserting", async () => {
        const { setSettings } = await import("../../src/shared/storage");
        await setSettings({ historyLimit: 2 });
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await upsertQASession(mkSession("c", 300));
        const list = await getQASessions();
        expect(list).toHaveLength(2);
        expect(list.map(s => s.id)).toEqual(["c", "b"]);
    });
});

describe("deleteQASession", () => {
    it("removes the session by id", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await deleteQASession("a");
        const list = await getQASessions();
        expect(list.map(s => s.id)).toEqual(["b"]);
    });
});

describe("clearQASessions", () => {
    it("empties the store", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await clearQASessions();
        const list = await getQASessions();
        expect(list).toEqual([]);
    });
});
