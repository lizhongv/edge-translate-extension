import { FloatingCard } from "./floating-card";
import { Toolbar } from "./toolbar";
import { isInEditable } from "./dom-utils";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings } from "../shared/storage";
import { msgTaskTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
import type { LLMError, RuntimeMessage } from "../shared/types";

console.log("[翻译插件] content script 已加载:", location.href);

const card = new FloatingCard();
const toolbar = new Toolbar();

const TOOLBAR_ACTIONS = [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];
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
    toolbar.hide();
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

async function maybeShowToolbar(): Promise<void> {
    const text = getSelectionText();
    if (!text || text.length < 2) {
        toolbar.hide();
        return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        toolbar.hide();
        return;
    }
    if (isInEditable(sel.anchorNode)) {
        toolbar.hide();
        return;
    }
    const settings = await getPublicSettings();
    if (settings.enableHoverButton === false) {
        toolbar.hide();
        return;
    }
    const rect = getSelectionRect();
    if (!rect) {
        toolbar.hide();
        return;
    }
    const actions = TOOLBAR_ACTIONS.filter(a => a.id !== "qa" || settings.enableQA);
    toolbar.show(rect, actions, (id) => {
        if (id === "translate") {
            void handleTrigger(text);
        } else if (id === "qa") {
            // wired in Task 18
            console.log("[翻译插件] QA 入口（暂未实现）", text);
        }
    });
}

document.addEventListener("mouseup", () => {
    setTimeout(() => { void maybeShowToolbar(); }, 0);
});

document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
        toolbar.hide();
    }
});

document.addEventListener("mousedown", (e) => {
    if (!toolbar.isShown()) return;
    if (toolbar.contains(e.target)) return;
    toolbar.hide();
}, true);

window.addEventListener("scroll", () => {
    toolbar.hide();
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
