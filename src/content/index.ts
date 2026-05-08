import { FloatingCard } from "./floating-card";
import { Toolbar } from "./toolbar";
import { QACard } from "./qa-card";
import { isInEditable } from "./dom-utils";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings, addMemo } from "../shared/storage";
import { msgTaskTranslate, msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions, rtMemoUpdated, rtOpenSidepanel } from "../shared/messages";
import { showToast } from "../shared/toast";
import type { ChatMessage, LLMError, QASession, RuntimeMessage } from "../shared/types";

const card = new FloatingCard();
const toolbar = new Toolbar();
const qaCard = new QACard();
let qaSession: QASession | null = null;
let qaPort: chrome.runtime.Port | null = null;
let qaPartial = "";

const uuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

function disconnectQA(): void {
    if (qaPort) {
        try { qaPort.disconnect(); } catch {/* ignore */}
        qaPort = null;
    }
}

function sendQAMessages(messages: ChatMessage[]): void {
    if (!qaSession) return;
    void getPublicSettings().then((s) => {
        if (messages.length >= s.qaMaxTurns * 2) {
            qaCard.showTurnCapNotice(s.qaMaxTurns);
        }
    });
    qaPartial = "";
    disconnectQA();
    qaCard.beginAssistant();
    const port = chrome.runtime.connect({ name: "task" });
    qaPort = port;
    port.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            qaPartial += msg.chunk;
            qaCard.appendToken(msg.chunk);
        } else if (isDoneMsg(msg)) {
            qaCard.endAssistant(msg.full);
        } else if (isErrorMsg(msg)) {
            qaCard.failAssistant(msg.error as LLMError, qaPartial);
        }
    });
    port.onDisconnect.addListener(() => { qaPort = null; });
    port.postMessage(msgTaskQA(qaSession.id, qaSession.sourceText, messages));
}

async function openQACard(text: string): Promise<void> {
    if (!text) return;
    toolbar.hide();
    const rect = getSelectionRect();
    qaSession = {
        id: uuid(),
        sourceText: text,
        model: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
    };
    qaCard.mount(rect, text, {
        onSend: (messages: ChatMessage[]) => sendQAMessages(messages),
        onClose: () => {
            if (qaPort) {
                // streaming in progress → rollback the in-flight user turn
                qaCard.rollbackUserTurn();
            }
            disconnectQA();
            qaSession = null;
        },
        onOpenOptions: () => {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
        },
        onRetry: () => {
            if (!qaSession) return;
            sendQAMessages(qaCard.getMessages());
        },
    });
}

const TOOLBAR_ACTIONS = [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
    { id: "memo", char: "存", label: "保存到备忘录" },
    { id: "settings", char: "设", label: "打开设置" },
];

async function saveSelectionAsMemo(
    text: string,
    pageUrl?: string,
    pageTitle?: string
): Promise<void> {
    if (!text || !text.trim()) return;
    try {
        await addMemo({
            title: "",
            content: text,
            source: "selection",
            pageUrl: pageUrl ?? location.href,
            pageTitle: pageTitle ?? document.title,
        });
        chrome.runtime.sendMessage(rtMemoUpdated()).catch(() => {/* ignore */});
        showToast("已保存 ✓", {
            actionLabel: "打开",
            onAction: () => {
                chrome.runtime.sendMessage(rtOpenSidepanel("memo")).catch(() => {/* ignore */});
            },
        });
    } catch (e) {
        console.error("[翻译插件] saveSelectionAsMemo failed:", e);
        showToast("保存失败：存储空间不足，请清理旧条目");
    }
}
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
    const actions = TOOLBAR_ACTIONS.filter(a => {
        if (a.id === "qa") return settings.enableQA;
        if (a.id === "memo") return settings.enableMemo;
        if (a.id === "settings") return settings.enableSettingsButton;
        return true;
    });
    toolbar.show(rect, actions, (id) => {
        if (id === "translate") {
            void handleTrigger(text);
        } else if (id === "qa") {
            void openQACard(text);
        } else if (id === "memo") {
            void saveSelectionAsMemo(text);
        } else if (id === "settings") {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
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
    } else if (m.type === "openQA") {
        const text = (m.text || getSelectionText()).trim();
        if (text) void openQACard(text);
    } else if (m.type === "saveMemo") {
        const text = (m.text || getSelectionText()).trim();
        if (text) void saveSelectionAsMemo(text, m.pageUrl, m.pageTitle);
    }
});
