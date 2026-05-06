import { FloatingCard } from "./floating-card";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings } from "../shared/storage";
import { msgTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
import type { LLMError, RuntimeMessage } from "../shared/types";

console.log("[翻译插件] content script 已加载:", location.href);

const card = new FloatingCard();
let currentPort: chrome.runtime.Port | null = null;
let lastText = "";
let partial = "";

function disconnect(): void {
    if (currentPort) {
        try { currentPort.disconnect(); } catch { /* ignore */ }
        currentPort = null;
    }
}

function startTranslation(text: string): void {
    partial = "";
    disconnect();
    const port = chrome.runtime.connect({ name: "translate" });
    currentPort = port;
    port.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            partial += msg.chunk;
            card.appendToken(msg.chunk);
        } else if (isDoneMsg(msg)) {
            card.setComplete(msg.full);
        } else if (isErrorMsg(msg)) {
            card.setError(msg.error as LLMError, partial);
        }
    });
    port.onDisconnect.addListener(() => {
        currentPort = null;
    });
    port.postMessage(msgTranslate(text));
}

async function handleTrigger(fallbackText?: string): Promise<void> {
    const live = getSelectionText();
    const text = live || fallbackText || "";
    console.log("[翻译插件] 触发翻译, DOM 选区:", live.slice(0, 30), "回退:", fallbackText?.slice(0, 30));
    if (!text) {
        console.warn("[翻译插件] 没有可翻译的文本（选区已丢失且菜单未带文本）");
        return;
    }
    const rect = getSelectionRect();
    lastText = text;
    const settings = await getPublicSettings();

    card.mount(rect, {
        onClose: () => {
            disconnect();
        },
        onRetry: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onOpenOptions: () => {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
        },
        onConfirmLong: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onCancelLong: () => {
            disconnect();
        },
    });

    if (text.length > settings.longTextThreshold) {
        card.requestLongConfirm(text.length);
    } else {
        startTranslation(text);
    }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage | { type: string }) => {
    if ((msg as { type: string }).type === "__ping__") return;
    const m = msg as RuntimeMessage;
    if (m.type === "showCard") {
        void handleTrigger(m.text);
    } else if (m.type === "requestTranslate") {
        void handleTrigger();
    }
});
