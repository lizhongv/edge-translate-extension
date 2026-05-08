import type { ChatMessage, LLMError, QASession, Settings } from "../shared/types";
import { msgDone, msgError, msgToken } from "../shared/messages";
import { getSettings, getQASessions, upsertQASession } from "../shared/storage";
import { stream as defaultStream, type StreamInput } from "./llm-client";

type Port = { postMessage(msg: unknown): void };
type StreamFn = (input: StreamInput, settings: Settings, signal: AbortSignal) => AsyncGenerator<string>;

function buildSystem(qaSystemPrompt: string, sourceText: string): string {
    return `${qaSystemPrompt}\n\n---\nSelected text:\n${sourceText}`;
}

function truncateMessages(messages: ChatMessage[], maxTurns: number): ChatMessage[] {
    const cap = maxTurns * 2;
    return messages.length <= cap ? messages : messages.slice(-cap);
}

export async function answerQA(
    sessionId: string,
    sourceText: string,
    messages: ChatMessage[],
    port: Port,
    signal: AbortSignal,
    pageOrigin?: string,
    streamFn: StreamFn = defaultStream as StreamFn
): Promise<void> {
    const settings = await getSettings();
    const truncated = truncateMessages(messages, settings.qaMaxTurns);
    const system = buildSystem(settings.qaSystemPrompt, sourceText);

    let full = "";
    try {
        for await (const chunk of streamFn(
            { kind: "chat", system, messages: truncated },
            settings,
            signal
        )) {
            full += chunk;
            port.postMessage(msgToken(chunk));
        }
    } catch (e) {
        const err = e as LLMError;
        if (err.code !== "aborted") {
            port.postMessage(msgError(err));
        }
        return;
    }

    port.postMessage(msgDone(full));

    const now = Date.now();
    const newMessages: ChatMessage[] = [...messages, { role: "assistant", content: full }];
    const session: QASession = {
        id: sessionId,
        sourceText,
        pageOrigin,
        model: settings.model,
        createdAt: now,
        updatedAt: now,
        messages: newMessages,
    };
    // Preserve original createdAt if the session already exists
    const all = await getQASessions();
    const existing = all.find(s => s.id === sessionId);
    if (existing) session.createdAt = existing.createdAt;

    await upsertQASession(session);
}
