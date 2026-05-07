import buttonCss from "./hover-button.css?inline";
export { isInEditable } from "./dom-utils";

const BTN_SIZE = 28;
const MARGIN = 4;

export class HoverButton {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
    public button: HTMLButtonElement | null = null;

    show(rect: DOMRect, onClick: () => void): void {
        this.hide();
        try {
            this.host = document.createElement("div");
            this.host.style.all = "initial";
            this.root = this.host.attachShadow({ mode: "closed" });

            const style = document.createElement("style");
            style.textContent = buttonCss;
            this.root.appendChild(style);

            const btn = document.createElement("button");
            btn.className = "btn";
            btn.type = "button";
            btn.title = "翻译选中内容";

            const char = document.createElement("span");
            char.className = "char";
            char.textContent = "翻";
            btn.appendChild(char);

            const { x, y } = this.computePosition(rect);
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;

            btn.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick();
                this.hide();
            });

            this.root.appendChild(btn);
            document.body.appendChild(this.host);
            this.button = btn;
        } catch {
            this.host = null;
            this.root = null;
            this.button = null;
        }
    }

    hide(): void {
        if (this.host?.parentNode) {
            this.host.parentNode.removeChild(this.host);
        }
        this.host = null;
        this.root = null;
        this.button = null;
    }

    isShown(): boolean {
        return this.host !== null;
    }

    contains(target: EventTarget | null): boolean {
        if (!this.host || !target) return false;
        if (target instanceof Node) {
            return this.host.contains(target) || this.host === target;
        }
        return false;
    }

    private computePosition(rect: DOMRect): { x: number; y: number } {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.right - BTN_SIZE;
        let y = rect.bottom + MARGIN;
        if (x + BTN_SIZE > vw - MARGIN) x = vw - BTN_SIZE - MARGIN;
        if (x < MARGIN) x = MARGIN;
        if (y + BTN_SIZE > vh - MARGIN) y = rect.top - BTN_SIZE - MARGIN;
        if (y < MARGIN) y = MARGIN;
        return { x, y };
    }
}
