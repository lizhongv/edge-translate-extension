import cardCss from "./card.css?inline";
import type { LLMError } from "../shared/types";

type CardCallbacks = {
    onClose?: () => void;
    onRetry?: () => void;
    onConfirmLong?: () => void;
    onCancelLong?: () => void;
    onOpenOptions?: () => void;
};

export class FloatingCard {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
    private bodyEl: HTMLDivElement | null = null;
    private footerEl: HTMLDivElement | null = null;
    headerEl: HTMLDivElement | null = null;
    private cb: CardCallbacks = {};

    mount(rect: DOMRect | null, callbacks: CardCallbacks = {}): void {
        this.unmount();
        this.cb = callbacks;
        this.host = document.createElement("div");
        this.host.style.all = "initial";
        this.root = this.host.attachShadow({ mode: "closed" });
        const style = document.createElement("style");
        style.textContent = cardCss;
        this.root.appendChild(style);

        const card = document.createElement("div");
        card.className = "card";
        const { x, y } = this.computePosition(rect);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;

        const header = document.createElement("div");
        header.className = "header";
        header.innerHTML = '<span>法译查鉴</span><span class="status"></span>';
        const body = document.createElement("div");
        body.className = "body";
        const footer = document.createElement("div");
        footer.className = "footer";

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        this.root.appendChild(card);
        document.body.appendChild(this.host);

        this.headerEl = header;
        this.bodyEl = body;
        this.footerEl = footer;

        this.setLoading();

        document.addEventListener("keydown", this.onKey, true);
        document.addEventListener("mousedown", this.onClickOutside, true);
    }

    setLoading(): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.innerHTML = '<span class="spinner"></span>翻译中…';
        this.footerEl.innerHTML = "";
        const closeBtn = this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        });
        this.footerEl.appendChild(closeBtn);
    }

    requestLongConfirm(charCount: number): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.textContent = `选中内容较长（${charCount} 字符），可能费用较高/响应较慢，是否继续？`;
        this.footerEl.innerHTML = "";
        const ok = this.makeButton("继续", () => {
            this.cb.onConfirmLong?.();
        });
        const cancel = this.makeButton("取消", () => {
            this.cb.onCancelLong?.();
            this.unmount();
        });
        this.footerEl.appendChild(cancel);
        this.footerEl.appendChild(ok);
    }

    appendToken(chunk: string): void {
        if (!this.bodyEl) return;
        if (this.bodyEl.textContent?.startsWith("翻译中") || this.bodyEl.querySelector(".spinner")) {
            this.bodyEl.textContent = "";
        }
        this.bodyEl.textContent = (this.bodyEl.textContent ?? "") + chunk;
    }

    setComplete(full: string): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.textContent = full;
        this.footerEl.innerHTML = "";
        const copy = this.makeButton("复制", () => {
            navigator.clipboard.writeText(full).catch(() => {/* ignore */});
        });
        const close = this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        });
        this.footerEl.appendChild(copy);
        this.footerEl.appendChild(close);
    }

    setError(err: LLMError, partial?: string): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.innerHTML = "";
        const errLine = document.createElement("div");
        errLine.className = "error";
        errLine.textContent = `⚠ ${err.message}`;
        this.bodyEl.appendChild(errLine);

        if (partial && partial.length > 0) {
            const part = document.createElement("div");
            part.style.marginTop = "8px";
            part.style.opacity = "0.8";
            part.textContent = partial;
            this.bodyEl.appendChild(part);
        }

        this.footerEl.innerHTML = "";
        if (err.code === "auth") {
            this.footerEl.appendChild(this.makeButton("打开设置", () => {
                this.cb.onOpenOptions?.();
                this.unmount();
            }));
        }
        if (err.code === "bad_response" || err.code === "unknown") {
            this.footerEl.appendChild(this.makeButton("重试", () => {
                this.cb.onRetry?.();
            }));
        }
        if (partial && partial.length > 0) {
            this.footerEl.appendChild(this.makeButton("复制部分", () => {
                navigator.clipboard.writeText(partial).catch(() => {/* ignore */});
            }));
        }
        this.footerEl.appendChild(this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        }));
    }

    unmount(): void {
        document.removeEventListener("keydown", this.onKey, true);
        document.removeEventListener("mousedown", this.onClickOutside, true);
        if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
        this.host = null;
        this.root = null;
        this.bodyEl = null;
        this.footerEl = null;
        this.headerEl = null;
    }

    isMounted(): boolean {
        return this.host !== null;
    }

    private makeButton(label: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    private computePosition(rect: DOMRect | null): { x: number; y: number } {
        const margin = 8;
        if (!rect) return { x: 16, y: 16 };
        const cardW = 420;
        const cardH = 200;
        let x = rect.left;
        let y = rect.bottom + margin;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (x + cardW > vw - margin) x = vw - cardW - margin;
        if (y + cardH > vh - margin) y = Math.max(margin, rect.top - cardH - margin);
        return { x: Math.max(margin, x), y: Math.max(margin, y) };
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && this.host) {
            this.cb.onClose?.();
            this.unmount();
        }
    };

    private onClickOutside = (e: MouseEvent): void => {
        if (!this.host) return;
        const path = e.composedPath();
        if (!path.includes(this.host)) {
            this.cb.onClose?.();
            this.unmount();
        }
    };
}
