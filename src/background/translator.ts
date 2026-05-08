import type { LLMError, Settings } from "../shared/types";
import { msgDone, msgError, msgToken } from "../shared/messages";
import { appendHistory, getSettings } from "../shared/storage";
import { getCachedTranslation, setCachedTranslation } from "./cache";
import { stream as defaultStream, type StreamInput } from "./llm-client";

type Port = { postMessage(msg: unknown): void };
type StreamFn = (
    input: StreamInput,
    settings: Settings,
    signal: AbortSignal
) => AsyncGenerator<string>;

const uuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

export async function translate(
    text: string,
    port: Port,
    signal: AbortSignal,
    streamFn: StreamFn = defaultStream as StreamFn,
    pageOrigin?: string
): Promise<void> {
    const settings = await getSettings();
    const target = settings.primaryTarget;

    const cached = await getCachedTranslation(text, target, settings.model);
    if (cached !== undefined) {
        port.postMessage(msgDone(cached));
        await appendHistory({
            id: uuid(),
            sourceText: text,
            translatedText: cached,
            targetLang: target,
            model: settings.model,
            timestamp: Date.now(),
            pageOrigin,
        });
        return;
    }

    let full = "";
    try {
        for await (const chunk of streamFn({ kind: "translate", text, target }, settings, signal)) {
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
    await setCachedTranslation(text, target, settings.model, full);
    await appendHistory({
        id: uuid(),
        sourceText: text,
        translatedText: full,
        targetLang: target,
        model: settings.model,
        timestamp: Date.now(),
        pageOrigin,
    });
}
