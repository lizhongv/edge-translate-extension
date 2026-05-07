import { FloatingCard } from "./floating-card";
import { HoverButton, isInEditable } from "./hover-button";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings } from "../shared/storage";
import { msgTaskTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
import type { LLMError, RuntimeMessage } from "../shared/types";

console.log("[翻译插件] content script 已加载:", location.href);

const card = new FloatingCard();
const hoverButton = new HoverButton();
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
    const port = chrome.runtime.connect({ name: "task" });
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
    port.postMessage(msgTaskTranslate(text));
}

async function handleTrigger(fallbackText?: string): Promise<void> {
    const live = getSelectionText();
    const text = live || fallbackText || "";
    console.log("[翻译插件] 触发翻译, DOM 选区:", live.slice(0, 30), "回退:", fallbackText?.slice(0, 30));
    if (!text) {
        console.warn("[翻译插件] 没有可翻译的文本（选区已丢失且菜单未带文本）");
        return;
    }
    hoverButton.hide();
    const rect = getSelectionRect();
    lastText = text;
    const settings = await getPublicSettings();

    card.mount(rect, {
        onClose: () => { disconnect(); },
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
        onCancelLong: () => { disconnect(); },
    }, text);

    if (text.length > settings.longTextThreshold) {
        card.requestLongConfirm(text.length);
    } else {
        startTranslation(text);
    }
}

// ===== 划词浮标编排 =====

async function maybeShowHoverButton(): Promise<void> {
    const text = getSelectionText();
    if (!text || text.length < 2) {
        hoverButton.hide();
        return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        hoverButton.hide();
        return;
    }
    if (isInEditable(sel.anchorNode)) {
        hoverButton.hide();
        return;
    }
    const settings = await getPublicSettings();
    if (settings.enableHoverButton === false) {
        hoverButton.hide();
        return;
    }
    const rect = getSelectionRect();
    if (!rect) {
        hoverButton.hide();
        return;
    }
    hoverButton.show(rect, () => {
        void handleTrigger(text);
    });
}

document.addEventListener("mouseup", () => {
    setTimeout(() => { void maybeShowHoverButton(); }, 0);
});

document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
        hoverButton.hide();
    }
});

document.addEventListener("mousedown", (e) => {
    if (!hoverButton.isShown()) return;
    if (hoverButton.contains(e.target)) return;
    hoverButton.hide();
}, true);

window.addEventListener("scroll", () => {
    hoverButton.hide();
}, true);

// ===== 现有 chrome.runtime 消息入口 =====

chrome.runtime.onMessage.addListener((msg: RuntimeMessage | { type: string }) => {
    if ((msg as { type: string }).type === "__ping__") return;
    const m = msg as RuntimeMessage;
    if (m.type === "showCard") {
        void handleTrigger(m.text);
    } else if (m.type === "requestTranslate") {
        void handleTrigger();
    }
});
