import qaCardCss from "./qa-card.css?inline";
import type { ChatMessage, LLMError } from "../shared/types";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";

type QACardCallbacks = {
    onSend: (messages: ChatMessage[]) => void;
    onClose: () => void;
    onOpenOptions: () => void;
    onRetry: () => void;
};

export class QACard {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
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
            finalizeBubble(this.currentAssistantBubble, full);
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
        }
        // failed turn: don't add assistant to messages
        this.currentAssistantBubble = null;
        this.streaming = false;
        if (this.textareaEl) this.textareaEl.disabled = false;
        if (this.sendBtn) this.sendBtn.disabled = false;
    }

    getMessages(): ChatMessage[] {
        return [...this.messages];
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
        this.messagesEl = null;
        this.textareaEl = null;
        this.sendBtn = null;
        this.cb = null;
        this.messages = [];
        this.streaming = false;
        this.currentAssistantBubble = null;
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
