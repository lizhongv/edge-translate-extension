import qaCardCss from "./qa-card.css?inline";
import type { ChatMessage, LLMError } from "../shared/types";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";
import { addMemo } from "../shared/storage";
import { showToast } from "../shared/toast";
import { rtMemoUpdated, rtOpenSidepanel } from "../shared/messages";

type QACardCallbacks = {
    onSend: (messages: ChatMessage[]) => void;
    onClose: () => void;
    onOpenOptions: () => void;
    onRetry: () => void;
};

export class QACard {
    private host: HTMLDivElement | null = null;
    private sourceText = "";
    private root: ShadowRoot | null = null;
    cardEl: HTMLElement | null = null;
    private messagesEl: HTMLElement | null = null;
    private textareaEl: HTMLTextAreaElement | null = null;
    private sendBtn: HTMLButtonElement | null = null;
    private cb: QACardCallbacks | null = null;
    private messages: ChatMessage[] = [];
    private streaming = false;
    private currentAssistantBubble: HTMLElement | null = null;

    mount(rect: DOMRect | null, sourceText: string, callbacks: QACardCallbacks): void {
        this.unmount();
        if (!sourceText) {
            console.warn("[翻译插件] QACard.mount called with empty sourceText");
            return;
        }
        this.cb = callbacks;
        this.messages = [];
        this.sourceText = sourceText;

        this.host = document.createElement("div");
        this.host.style.all = "initial";
        this.root = this.host.attachShadow({ mode: "closed" });

        const style = document.createElement("style");
        style.textContent = qaCardCss;
        this.root.appendChild(style);

        const card = document.createElement("div");
        card.className = "card";
        const { x, y } = this.computePosition(rect);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;

        // header
        const header = document.createElement("div");
        header.className = "header";
        const title = document.createElement("span");
        title.textContent = "问答";
        const close = document.createElement("button");
        close.className = "close";
        close.type = "button";
        close.textContent = "×";
        close.title = "关闭";
        close.addEventListener("click", () => {
            this.cb?.onClose();
            this.unmount();
        });
        header.appendChild(title);
        header.appendChild(close);
        card.appendChild(header);

        // source row
        const sourceRow = document.createElement("div");
        sourceRow.className = "source collapsed";
        const sourceTextEl = document.createElement("div");
        sourceTextEl.className = "source-text";
        sourceTextEl.textContent = sourceText;
        sourceRow.appendChild(sourceTextEl);
        sourceRow.addEventListener("click", () => {
            sourceRow.classList.toggle("collapsed");
        });
        card.appendChild(sourceRow);

        // messages container
        const messages = document.createElement("div");
        messages.className = "messages";
        this.messagesEl = messages;
        card.appendChild(messages);

        // input row
        const inputRow = document.createElement("div");
        inputRow.className = "input-row";
        const ta = document.createElement("textarea");
        ta.placeholder = "请输入问题…";
        ta.rows = 1;
        ta.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                this.handleSend();
            }
        });
        const send = document.createElement("button");
        send.className = "send";
        send.type = "button";
        send.textContent = "↑";
        send.title = "发送";
        send.addEventListener("click", () => this.handleSend());
        inputRow.appendChild(ta);
        inputRow.appendChild(send);
        card.appendChild(inputRow);

        this.textareaEl = ta;
        this.sendBtn = send;

        this.cardEl = card;
        this.root.appendChild(card);
        document.body.appendChild(this.host);

        document.addEventListener("keydown", this.onKey, true);
        document.addEventListener("mousedown", this.onClickOutside, true);

        ta.focus();
    }

    private handleSend(): void {
        if (this.streaming) return;
        if (!this.textareaEl) return;
        const text = this.textareaEl.value.trim();
        if (!text) return;
        const userMsg: ChatMessage = { role: "user", content: text };
        this.messages = [...this.messages, userMsg];
        if (this.messagesEl) {
            const bubble = createMessageBubble("user", text);
            this.messagesEl.appendChild(bubble);
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
        this.cb?.onSend(this.messages);
    }

    beginAssistant(): void {
        this.streaming = true;
        if (this.textareaEl) this.textareaEl.disabled = true;
        if (this.sendBtn) this.sendBtn.disabled = true;
        if (this.messagesEl) {
            const bubble = createMessageBubble("assistant", "");
            const spinner = document.createElement("span");
            spinner.className = "spinner";
            bubble.querySelector(".content")?.prepend(spinner);
            this.messagesEl.appendChild(bubble);
            this.currentAssistantBubble = bubble;
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    appendToken(chunk: string): void {
        if (!this.currentAssistantBubble) return;
        const sp = this.currentAssistantBubble.querySelector(".spinner");
        if (sp) sp.remove();
        appendTokenToBubble(this.currentAssistantBubble, chunk);
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    endAssistant(full: string): void {
        if (this.currentAssistantBubble) {
            const sp = this.currentAssistantBubble.querySelector(".spinner");
            if (sp) sp.remove();
            const sourceText = this.sourceText;
            finalizeBubble(this.currentAssistantBubble, full, {
                sourceText,
                extraActions: [{
                    label: "保存到备忘录",
                    onClick: () => { void saveQAAnswerToMemo(full, sourceText); },
                }],
            });
        }
        this.messages = [...this.messages, { role: "assistant", content: full }];
        this.currentAssistantBubble = null;
        this.streaming = false;
        if (this.textareaEl) {
            this.textareaEl.disabled = false;
            this.textareaEl.value = "";
            this.textareaEl.focus();
        }
        if (this.sendBtn) this.sendBtn.disabled = false;
    }

    failAssistant(err: LLMError, partial?: string): void {
        if (this.currentAssistantBubble) {
            const sp = this.currentAssistantBubble.querySelector(".spinner");
            if (sp) sp.remove();
            const c = this.currentAssistantBubble.querySelector<HTMLElement>(".content");
            if (c && partial) c.textContent = partial;
            setBubbleError(this.currentAssistantBubble, err.message);

            const actions = document.createElement("div");
            actions.className = "actions";
            if (err.code === "auth") {
                const btn = document.createElement("button");
                btn.className = "copy action-options";
                btn.type = "button";
                btn.textContent = "打开设置";
                btn.addEventListener("click", () => this.cb?.onOpenOptions());
                actions.appendChild(btn);
            }
            if (err.retryable || err.code === "bad_response" || err.code === "unknown") {
                const btn = document.createElement("button");
                btn.className = "copy action-retry";
                btn.type = "button";
                btn.textContent = "重试";
                btn.addEventListener("click", () => this.cb?.onRetry());
                actions.appendChild(btn);
            }
            if (partial && partial.length > 0) {
                const btn = document.createElement("button");
                btn.className = "copy action-copy-partial";
                btn.type = "button";
                btn.textContent = "复制部分";
                btn.addEventListener("click", () => {
                    navigator.clipboard.writeText(partial).catch(() => {/* ignore */});
                });
                actions.appendChild(btn);
            }
            this.currentAssistantBubble.appendChild(actions);
        }
        this.currentAssistantBubble = null;
        this.streaming = false;
        if (this.textareaEl) this.textareaEl.disabled = false;
        if (this.sendBtn) this.sendBtn.disabled = false;
    }

    getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    setMessages(messages: ChatMessage[]): void {
        this.messages = [...messages];
        if (!this.messagesEl) return;
        this.messagesEl.innerHTML = "";
        for (const m of messages) {
            const bubble = createMessageBubble(m.role, m.content);
            if (m.role === "assistant") finalizeBubble(bubble, m.content);
            this.messagesEl.appendChild(bubble);
        }
        this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }

    showTurnCapNotice(maxTurns: number): void {
        if (!this.cardEl) return;
        let notice = this.cardEl.querySelector<HTMLElement>(".notice");
        if (!notice) {
            notice = document.createElement("div");
            notice.className = "notice";
            const inputRow = this.cardEl.querySelector(".input-row");
            if (inputRow) this.cardEl.insertBefore(notice, inputRow);
            else this.cardEl.appendChild(notice);
        }
        notice.textContent = `为控制费用，仅保留最近 ${maxTurns} 轮对话作为上下文`;
    }

    rollbackUserTurn(): void {
        if (this.messages.length === 0) return;
        const last = this.messages[this.messages.length - 1];
        if (last.role !== "user") return;
        this.messages = this.messages.slice(0, -1);
        if (this.currentAssistantBubble?.parentElement) {
            this.currentAssistantBubble.parentElement.removeChild(this.currentAssistantBubble);
        }
        this.currentAssistantBubble = null;
        if (this.messagesEl) {
            const userBubbles = this.messagesEl.querySelectorAll(".msg.user");
            const lastUser = userBubbles[userBubbles.length - 1];
            if (lastUser?.parentElement) lastUser.parentElement.removeChild(lastUser);
        }
        if (this.textareaEl) {
            this.textareaEl.disabled = false;
            this.textareaEl.value = last.content;
            this.textareaEl.focus();
        }
        if (this.sendBtn) this.sendBtn.disabled = false;
        this.streaming = false;
    }

    isMounted(): boolean {
        return this.host !== null;
    }

    unmount(): void {
        document.removeEventListener("keydown", this.onKey, true);
        document.removeEventListener("mousedown", this.onClickOutside, true);
        if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
        this.host = null;
        this.root = null;
        this.cardEl = null;
        this.messagesEl = null;
        this.textareaEl = null;
        this.sendBtn = null;
        this.cb = null;
        this.messages = [];
        this.streaming = false;
        this.currentAssistantBubble = null;
        this.sourceText = "";
    }

    private computePosition(rect: DOMRect | null): { x: number; y: number } {
        const margin = 8;
        const cardW = 420;
        const cardH = 540;
        if (!rect) return { x: margin, y: margin };
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.left;
        let y = rect.bottom + margin;
        if (x + cardW > vw - margin) x = vw - cardW - margin;
        if (y + cardH > vh - margin) y = Math.max(margin, rect.top - cardH - margin);
        return { x: Math.max(margin, x), y: Math.max(margin, y) };
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && this.host) {
            this.cb?.onClose();
            this.unmount();
        }
    };

    private onClickOutside = (e: MouseEvent): void => {
        if (!this.host) return;
        const path = e.composedPath();
        if (!path.includes(this.host)) {
            this.cb?.onClose();
            this.unmount();
        }
    };
}

async function saveQAAnswerToMemo(answer: string, sourceContext: string): Promise<void> {
    try {
        await addMemo({
            title: "",
            content: answer,
            source: "qa",
            sourceContext,
            pageUrl: location.href,
            pageTitle: document.title,
        });
        chrome.runtime.sendMessage(rtMemoUpdated()).catch(() => {/* ignore */});
        showToast("已保存 ✓", {
            actionLabel: "打开",
            onAction: () => {
                chrome.runtime.sendMessage(rtOpenSidepanel("memo")).catch(() => {/* ignore */});
            },
        });
    } catch (e) {
        console.error("[翻译插件] saveQAAnswerToMemo failed:", e);
        showToast("保存失败：存储空间不足");
    }
}
