import {
    clearHistory, deleteHistoryItem, getHistory,
    clearQASessions, deleteQASession, getQASessions, upsertQASession,
} from "../shared/storage";
import {
    msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg,
} from "../shared/messages";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";
import type { ChatMessage, HistoryItem, LLMError, QASession } from "../shared/types";

// ===== view state =====
type View = "translate" | "qa" | "detail-qa";
let currentView: View = "translate";
let currentDetailSessionId: string | null = null;

// ===== DOM refs =====
const translateListEl = document.getElementById("list-translate") as HTMLElement;
const qaListEl = document.getElementById("list-qa") as HTMLElement;
const qaDetailEl = document.getElementById("detail-qa") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const backBtn = document.getElementById("back") as HTMLButtonElement;
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab");
const itemTpl = document.getElementById("item-tpl") as HTMLTemplateElement;
const qaItemTpl = document.getElementById("qa-item-tpl") as HTMLTemplateElement;
const qaDetailTpl = document.getElementById("qa-detail-tpl") as HTMLTemplateElement;

const fmtTime = (ts: number): string => new Date(ts).toLocaleString();

// ===== view switching =====
function setView(v: View): void {
    currentView = v;
    translateListEl.classList.toggle("active", v === "translate");
    qaListEl.classList.toggle("active", v === "qa");
    qaDetailEl.classList.toggle("active", v === "detail-qa");
    backBtn.hidden = v !== "detail-qa";
    clearBtn.hidden = v === "detail-qa";
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === v));
}

tabBtns.forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab as "translate" | "qa";
    setView(t);
    void refresh();
}));

backBtn.addEventListener("click", () => {
    currentDetailSessionId = null;
    setView("qa");
    void refresh();
});

clearBtn.addEventListener("click", async () => {
    if (currentView === "translate") {
        if (!confirm("确认清空全部翻译历史？")) return;
        await clearHistory();
    } else if (currentView === "qa") {
        if (!confirm("确认清空全部问答会话？")) return;
        await clearQASessions();
    }
    await refresh();
});

// ===== translate list =====
function renderTranslateList(items: HistoryItem[]): void {
    translateListEl.innerHTML = "";
    if (items.length === 0) {
        translateListEl.innerHTML = '<div class="empty">暂无翻译历史</div>';
        return;
    }
    for (const item of items) {
        const node = itemTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = item.id;
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(item.timestamp);
        (node.querySelector(".model") as HTMLElement).textContent = item.model;
        (node.querySelector(".src") as HTMLElement).textContent = item.sourceText;
        (node.querySelector(".dst") as HTMLElement).textContent = item.translatedText;
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async () => {
            await deleteHistoryItem(item.id);
            await refresh();
        });
        (node.querySelector(".copy-src") as HTMLElement).addEventListener("click", () => {
            navigator.clipboard.writeText(item.sourceText).catch(() => {/* ignore */});
        });
        (node.querySelector(".copy-dst") as HTMLElement).addEventListener("click", () => {
            navigator.clipboard.writeText(item.translatedText).catch(() => {/* ignore */});
        });
        translateListEl.appendChild(node);
    }
}

// ===== qa list =====
function renderQAList(sessions: QASession[]): void {
    qaListEl.innerHTML = "";
    if (sessions.length === 0) {
        qaListEl.innerHTML = '<div class="empty">暂无问答会话</div>';
        return;
    }
    for (const s of sessions) {
        const node = qaItemTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = s.id;
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(s.updatedAt);
        (node.querySelector(".model") as HTMLElement).textContent = s.model || "";
        const turns = Math.floor(s.messages.length / 2) + (s.messages.length % 2);
        (node.querySelector(".turns") as HTMLElement).textContent = `${turns} 轮`;
        (node.querySelector(".src") as HTMLElement).textContent = s.sourceText.slice(0, 120);
        const firstQ = s.messages.find(m => m.role === "user");
        (node.querySelector(".first-q") as HTMLElement).textContent = firstQ ? `问：${firstQ.content}` : "";
        article.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).classList.contains("del")) return;
            currentDetailSessionId = s.id;
            setView("detail-qa");
            void renderDetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteQASession(s.id);
            await refresh();
        });
        qaListEl.appendChild(node);
    }
}

// ===== qa detail (continue chat) =====
let detailSession: QASession | null = null;
let detailMessagesEl: HTMLElement | null = null;
let detailTextarea: HTMLTextAreaElement | null = null;
let detailSendBtn: HTMLButtonElement | null = null;
let detailPort: chrome.runtime.Port | null = null;
let detailPartial = "";
let detailCurrentBubble: HTMLElement | null = null;

async function renderDetail(): Promise<void> {
    qaDetailEl.innerHTML = "";
    if (!currentDetailSessionId) return;
    const sessions = await getQASessions();
    const s = sessions.find(x => x.id === currentDetailSessionId);
    if (!s) {
        qaDetailEl.innerHTML = '<div class="empty">会话不存在</div>';
        return;
    }
    detailSession = s;

    const node = qaDetailTpl.content.cloneNode(true) as DocumentFragment;
    (node.querySelector(".source-text") as HTMLElement).textContent = s.sourceText;
    detailMessagesEl = node.querySelector(".messages") as HTMLElement;
    for (const m of s.messages) {
        const bubble = createMessageBubble(m.role, m.content);
        if (m.role === "assistant") finalizeBubble(bubble, m.content);
        detailMessagesEl.appendChild(bubble);
    }
    detailTextarea = node.querySelector(".input") as HTMLTextAreaElement;
    detailSendBtn = node.querySelector(".send") as HTMLButtonElement;
    detailTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            void detailSend();
        }
    });
    detailSendBtn.addEventListener("click", () => void detailSend());

    qaDetailEl.appendChild(node);
    if (detailMessagesEl) detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;
}

async function detailSend(): Promise<void> {
    if (!detailSession || !detailTextarea || !detailMessagesEl || !detailSendBtn) return;
    const text = detailTextarea.value.trim();
    if (!text) return;
    if (detailPort) return; // already streaming

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...detailSession.messages, userMsg];
    detailSession = { ...detailSession, messages: newMessages, updatedAt: Date.now() };
    detailMessagesEl.appendChild(createMessageBubble("user", text));
    detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;

    detailCurrentBubble = createMessageBubble("assistant", "");
    detailMessagesEl.appendChild(detailCurrentBubble);
    detailTextarea.disabled = true;
    detailSendBtn.disabled = true;
    detailTextarea.value = "";
    detailPartial = "";

    detailPort = chrome.runtime.connect({ name: "task" });
    detailPort.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            detailPartial += msg.chunk;
            if (detailCurrentBubble) appendTokenToBubble(detailCurrentBubble, msg.chunk);
            if (detailMessagesEl) detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;
        } else if (isDoneMsg(msg)) {
            if (detailCurrentBubble) finalizeBubble(detailCurrentBubble, msg.full);
            if (detailSession) {
                detailSession = {
                    ...detailSession,
                    messages: [...detailSession.messages, { role: "assistant", content: msg.full }],
                    updatedAt: Date.now(),
                };
                void upsertQASession(detailSession);
            }
            cleanupDetailPort();
        } else if (isErrorMsg(msg)) {
            if (detailCurrentBubble) setBubbleError(detailCurrentBubble, (msg.error as LLMError).message);
            cleanupDetailPort();
        }
    });
    detailPort.onDisconnect.addListener(() => { cleanupDetailPort(); });
    detailPort.postMessage(msgTaskQA(detailSession.id, detailSession.sourceText, newMessages));
}

function cleanupDetailPort(): void {
    if (detailPort) {
        try { detailPort.disconnect(); } catch {/* ignore */}
        detailPort = null;
    }
    detailCurrentBubble = null;
    if (detailTextarea) detailTextarea.disabled = false;
    if (detailSendBtn) detailSendBtn.disabled = false;
    if (detailTextarea) detailTextarea.focus();
}

// ===== refresh =====
async function refresh(): Promise<void> {
    if (currentView === "translate") {
        const items = await getHistory();
        renderTranslateList(items);
    } else if (currentView === "qa") {
        const sessions = await getQASessions();
        renderQAList(sessions);
    } else if (currentView === "detail-qa") {
        await renderDetail();
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    const t = (msg as { type?: string })?.type;
    if (t === "historyUpdated" && currentView === "translate") {
        void refresh();
    }
    if (t === "qaSessionUpdated") {
        if (currentView === "qa") void refresh();
        if (currentView === "detail-qa"
            && (msg as { sessionId?: string }).sessionId === currentDetailSessionId
            && !detailPort  // 仅在非自身发起的更新时刷新
        ) {
            void refresh();
        }
    }
});

setView("translate");
void refresh();
