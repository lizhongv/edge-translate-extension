import buttonCss from "./hover-button.css?inline";

export function isInEditable(node: Node | null): boolean {
    let n: Node | null = node;
    while (n) {
        if (n instanceof HTMLElement) {
            if (n.isContentEditable) return true;
            // Fallback for environments (e.g. jsdom) where isContentEditable
            // does not reflect the attribute set via setAttribute.
            const ce = n.getAttribute("contenteditable");
            if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
            const tag = n.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
        }
        n = n.parentNode;
    }
    return false;
}

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
