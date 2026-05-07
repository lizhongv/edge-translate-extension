import { describe, it, expect, beforeEach, vi } from "vitest";
import { answerQA } from "../../src/background/qa";
import { setSettings, getQASessions, upsertQASession } from "../../src/shared/storage";
import type { ChatMessage } from "../../src/shared/types";

const makePort = () => ({
    posted: [] as unknown[],
    postMessage(msg: unknown) { this.posted.push(msg); },
});

const mkStreamFn = (chunks: string[]) =>
    vi.fn(async function* () {
        for (const c of chunks) yield c;
    });

beforeEach(async () => {
    await setSettings({
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "k",
        model: "deepseek-chat",
        qaSystemPrompt: "PROMPT",
        qaMaxTurns: 6,
    });
});

describe("answerQA basic flow", () => {
    it("posts tokens then done", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A", "B", "C"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid", "src", msgs, port, ctrl.signal, undefined, streamFn);

        expect(port.posted).toEqual([
            { type: "token", chunk: "A" },
            { type: "token", chunk: "B" },
            { type: "token", chunk: "C" },
            { type: "done", full: "ABC" },
        ]);
    });

    it("calls streamFn with chat input containing system + sourceText + messages", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q1" }];
        await answerQA("sid", "the-source", msgs, port, ctrl.signal, undefined, streamFn);

        const callArg = (streamFn.mock.calls[0] as any)[0];
        expect(callArg.kind).toBe("chat");
        expect(callArg.system).toContain("PROMPT");
        expect(callArg.system).toContain("the-source");
        expect(callArg.messages).toEqual([{ role: "user", content: "Q1" }]);
    });
});

describe("answerQA truncation", () => {
    it("truncates messages array to qaMaxTurns*2", async () => {
        await setSettings({ qaMaxTurns: 2 });
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();

        const msgs: ChatMessage[] = [];
        for (let i = 0; i < 5; i++) {
            msgs.push({ role: "user", content: `Q${i}` });
            msgs.push({ role: "assistant", content: `A${i}` });
        }
        msgs.push({ role: "user", content: "QNew" });

        await answerQA("sid", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const callArg = (streamFn.mock.calls[0] as any)[0];
        expect(callArg.messages.length).toBe(2 * 2); // last 4 items
    });
});

describe("answerQA persistence", () => {
    it("upserts session on done", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-1", "src", msgs, port, ctrl.signal, "https://x.example", streamFn);
        const sessions = await getQASessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].id).toBe("sid-1");
        expect(sessions[0].sourceText).toBe("src");
        expect(sessions[0].pageOrigin).toBe("https://x.example");
        expect(sessions[0].messages).toEqual([
            { role: "user", content: "Q" },
            { role: "assistant", content: "A" },
        ]);
    });

    it("preserves prior messages when追问", async () => {
        await upsertQASession({
            id: "sid-2", sourceText: "src",
            model: "deepseek-chat",
            createdAt: 100, updatedAt: 100,
            messages: [
                { role: "user", content: "Q1" },
                { role: "assistant", content: "A1" },
            ],
        });
        const port = makePort();
        const streamFn = mkStreamFn(["A2"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
        ];
        await answerQA("sid-2", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const sessions = await getQASessions();
        expect(sessions[0].messages).toEqual([
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
            { role: "assistant", content: "A2" },
        ]);
    });
});

describe("answerQA error handling", () => {
    it("posts error msg and does NOT upsert on failure", async () => {
        const port = makePort();
        const streamFn = vi.fn(async function* () {
            throw { code: "auth", message: "bad", retryable: false };
            // eslint-disable-next-line no-unreachable
            yield "x";
        });
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-3", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const errMsg = port.posted.find((m: any) => m.type === "error");
        expect(errMsg).toBeTruthy();
        const sessions = await getQASessions();
        expect(sessions.find(s => s.id === "sid-3")).toBeUndefined();
    });

    it("does NOT post error when aborted", async () => {
        const port = makePort();
        const streamFn = vi.fn(async function* () {
            throw { code: "aborted", message: "已取消", retryable: false };
            // eslint-disable-next-line no-unreachable
            yield "x";
        });
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-4", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const errMsg = port.posted.find((m: any) => m.type === "error");
        expect(errMsg).toBeUndefined();
    });
});
