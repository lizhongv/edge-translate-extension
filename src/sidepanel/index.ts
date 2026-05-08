import {
    clearHistory, deleteHistoryItem, getHistory,
    clearQASessions, deleteQASession, getQASessions,
    getMemos, addMemo, updateMemo, deleteMemo, clearMemos,
} from "../shared/storage";
import {
    msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg,
} from "../shared/messages";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";
import { showToast } from "../shared/toast";
import type { ChatMessage, HistoryItem, LLMError, Memo, QASession } from "../shared/types";

// ===== view state =====
type View = "translate" | "qa" | "detail-qa" | "memo" | "detail-memo";
let currentView: View = "translate";
let currentDetailSessionId: string | null = null;
let currentDetailMemoId: string | null = null;
let memoQuery = "";

// ===== DOM refs =====
const translateListEl = document.getElementById("list-translate") as HTMLElement;
const qaListEl = document.getElementById("list-qa") as HTMLElement;
const qaDetailEl = document.getElementById("detail-qa") as HTMLElement;
const memoListEl = document.getElementById("list-memo") as HTMLElement;
const memoDetailEl = document.getElementById("detail-memo") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const backBtn = document.getElementById("back") as HTMLButtonElement;
const memoSearchInput = document.getElementById("memo-search") as HTMLInputElement;
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab");
const itemTpl = document.getElementById("item-tpl") as HTMLTemplateElement;
const qaItemTpl = document.getElementById("qa-item-tpl") as HTMLTemplateElement;
const qaDetailTpl = document.getElementById("qa-detail-tpl") as HTMLTemplateElement;
const memoItemTpl = document.getElementById("memo-item-tpl") as HTMLTemplateElement;
const memoDetailTpl = document.getElementById("memo-detail-tpl") as HTMLTemplateElement;

const fmtTime = (ts: number): string => new Date(ts).toLocaleString();

// ===== view switching =====
function setView(v: View): void {
    currentView = v;
    translateListEl.classList.toggle("active", v === "translate");
    qaListEl.classList.toggle("active", v === "qa");
    qaDetailEl.classList.toggle("active", v === "detail-qa");
    memoListEl.classList.toggle("active", v === "memo");
    memoDetailEl.classList.toggle("active", v === "detail-memo");
    backBtn.hidden = v !== "detail-qa" && v !== "detail-memo";
    clearBtn.hidden = v === "detail-qa" || v === "detail-memo";
    memoSearchInput.hidden = v !== "memo";
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === v
        || (b.dataset.tab === "qa" && v === "detail-qa")
        || (b.dataset.tab === "memo" && v === "detail-memo")));
}

tabBtns.forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab as "translate" | "qa" | "memo";
    setView(t);
    void refresh();
}));

backBtn.addEventListener("click", () => {
    if (currentView === "detail-qa") {
        currentDetailSessionId = null;
        setView("qa");
    } else if (currentView === "detail-memo") {
        currentDetailMemoId = null;
        setView("memo");
    }
    void refresh();
});

clearBtn.addEventListener("click", async () => {
    if (currentView === "translate") {
        if (!confirm("确认清空全部翻译历史？")) return;
        await clearHistory();
    } else if (currentView === "qa") {
        if (!confirm("确认清空全部问答会话？")) return;
        await clearQASessions();
    } else if (currentView === "memo") {
        if (!confirm("确认清空全部备忘录？")) return;
        await clearMemos();
    }
    await refresh();
});

memoSearchInput.addEventListener("input", () => {
    memoQuery = memoSearchInput.value.trim().toLowerCase();
    if (currentView === "memo") void refresh();
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
            void renderQADetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteQASession(s.id);
            await refresh();
        });
        qaListEl.appendChild(node);
    }
}

// ===== qa detail =====
let detailSession: QASession | null = null;
let detailMessagesEl: HTMLElement | null = null;
let detailTextarea: HTMLTextAreaElement | null = null;
let detailSendBtn: HTMLButtonElement | null = null;
let detailPort: chrome.runtime.Port | null = null;
let detailPartial = "";
let detailCurrentBubble: HTMLElement | null = null;

async function renderQADetail(): Promise<void> {
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
        if (m.role === "assistant") {
            const sourceText = s.sourceText;
            const content = m.content;
            const pageOrigin = s.pageOrigin;
            finalizeBubble(bubble, content, {
                sourceText,
                extraActions: [{
                    label: "保存到备忘录",
                    onClick: () => { void saveQAAnswerToMemoFromSidepanel(content, sourceText, pageOrigin); },
                }],
            });
        }
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

async function saveQAAnswerToMemoFromSidepanel(
    answer: string, sourceContext: string, pageOrigin?: string
): Promise<void> {
    try {
        await addMemo({
            title: "",
            content: answer,
            source: "qa",
            sourceContext,
            pageUrl: pageOrigin,
        });
        showToast("已保存 ✓");
        if (currentView === "memo") void refresh();
    } catch (e) {
        console.error("[翻译插件] sidepanel save memo failed:", e);
        showToast("保存失败");
    }
}

async function detailSend(): Promise<void> {
    if (!detailSession || !detailTextarea || !detailMessagesEl || !detailSendBtn) return;
    const text = detailTextarea.value.trim();
    if (!text) return;
    if (detailPort) return;

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
            const fullAnswer = msg.full;
            const sourceText = detailSession?.sourceText ?? "";
            const pageOrigin = detailSession?.pageOrigin;
            if (detailCurrentBubble) {
                finalizeBubble(detailCurrentBubble, fullAnswer, {
                    sourceText,
                    extraActions: [{
                        label: "保存到备忘录",
                        onClick: () => { void saveQAAnswerToMemoFromSidepanel(fullAnswer, sourceText, pageOrigin); },
                    }],
                });
            }
            if (detailSession) {
                detailSession = {
                    ...detailSession,
                    messages: [...detailSession.messages, { role: "assistant", content: fullAnswer }],
                    updatedAt: Date.now(),
                };
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

// ===== memo list =====
function memoIcon(source: "selection" | "qa"): string {
    return source === "selection" ? "📝" : "💬";
}

function memoMatches(memo: Memo, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return memo.title.toLowerCase().includes(q) || memo.content.toLowerCase().includes(q);
}

function renderMemoList(memos: Memo[]): void {
    memoListEl.innerHTML = "";
    const filtered = memos.filter(m => memoMatches(m, memoQuery));
    if (filtered.length === 0) {
        memoListEl.innerHTML = `<div class="empty">${memoQuery ? "无匹配项" : "暂无备忘录"}</div>`;
        return;
    }
    for (const m of filtered) {
        const node = memoItemTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = m.id;
        (node.querySelector(".icon") as HTMLElement).textContent = memoIcon(m.source);
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(m.updatedAt);
        (node.querySelector(".title") as HTMLElement).textContent = m.title;
        (node.querySelector(".preview") as HTMLElement).textContent = m.content;
        (node.querySelector(".source") as HTMLElement).textContent = m.pageTitle || m.pageUrl || "";
        article.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).classList.contains("del")) return;
            currentDetailMemoId = m.id;
            setView("detail-memo");
            void renderMemoDetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteMemo(m.id);
            await refresh();
        });
        memoListEl.appendChild(node);
    }
}

// ===== memo detail =====
async function renderMemoDetail(): Promise<void> {
    memoDetailEl.innerHTML = "";
    if (!currentDetailMemoId) return;
    const memos = await getMemos();
    const memo = memos.find(m => m.id === currentDetailMemoId);
    if (!memo) {
        memoDetailEl.innerHTML = '<div class="empty">该条已被删除</div>';
        return;
    }
    const node = memoDetailTpl.content.cloneNode(true) as DocumentFragment;
    const titleInput = node.querySelector(".memo-title-input") as HTMLInputElement;
    const contentInput = node.querySelector(".memo-content-input") as HTMLTextAreaElement;
    const sourceLink = node.querySelector(".memo-source-link") as HTMLAnchorElement;
    const sourceRow = node.querySelector(".memo-source-row") as HTMLElement;
    const errorEl = node.querySelector(".memo-error") as HTMLElement;
    const cancelBtn = node.querySelector(".memo-cancel") as HTMLButtonElement;
    const saveBtn = node.querySelector(".memo-save") as HTMLButtonElement;

    titleInput.value = memo.title;
    contentInput.value = memo.content;
    if (memo.pageUrl) {
        sourceLink.href = memo.pageUrl;
        sourceLink.textContent = memo.pageTitle || memo.pageUrl;
    } else {
        sourceRow.hidden = true;
    }

    cancelBtn.addEventListener("click", () => {
        currentDetailMemoId = null;
        setView("memo");
        void refresh();
    });

    saveBtn.addEventListener("click", async () => {
        const newContent = contentInput.value.trim();
        if (!newContent) {
            errorEl.textContent = "正文不能为空";
            errorEl.hidden = false;
            return;
        }
        errorEl.hidden = true;
        try {
            await updateMemo(memo.id, {
                title: titleInput.value,
                content: contentInput.value,
            });
            showToast("已更新 ✓");
            currentDetailMemoId = null;
            setView("memo");
            await refresh();
        } catch (e) {
            console.error("[翻译插件] updateMemo failed:", e);
            showToast("保存失败");
        }
    });

    memoDetailEl.appendChild(node);
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
        await renderQADetail();
    } else if (currentView === "memo") {
        const memos = await getMemos();
        renderMemoList(memos);
    } else if (currentView === "detail-memo") {
        await renderMemoDetail();
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
            && !detailPort
        ) {
            void refresh();
        }
    }
    if (t === "memoUpdated" && currentView === "memo") {
        void refresh();
    }
});

// startup: read last_sidepanel_tab
async function init(): Promise<void> {
    try {
        const r = await chrome.storage.local.get("last_sidepanel_tab");
        const tab = r.last_sidepanel_tab as View | undefined;
        if (tab && (tab === "translate" || tab === "qa" || tab === "memo")) {
            await chrome.storage.local.remove("last_sidepanel_tab");
            setView(tab);
            await refresh();
            return;
        }
    } catch {/* ignore */}
    setView("translate");
    await refresh();
}

void init();
