import toolbarCss from "./toolbar.css?inline";

export type ToolbarAction = { id: string; char: string; label: string };

const BTN_SIZE = 28;
const MARGIN = 4;

export class Toolbar {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;

    show(rect: DOMRect, actions: ToolbarAction[], onPick: (id: string) => void): void {
        this.hide();
        try {
            this.host = document.createElement("div");
            this.host.style.all = "initial";
            this.root = this.host.attachShadow({ mode: "closed" });

            const style = document.createElement("style");
            style.textContent = toolbarCss;
            this.root.appendChild(style);

            const bar = document.createElement("div");
            bar.className = "bar";
            for (const a of actions) {
                const btn = document.createElement("button");
                btn.className = "btn";
                btn.type = "button";
                btn.title = a.label;
                btn.dataset.id = a.id;
                const ch = document.createElement("span");
                ch.className = "char";
                ch.textContent = a.char;
                btn.appendChild(ch);
                btn.addEventListener("mousedown", (e) => e.stopPropagation());
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onPick(a.id);
                    this.hide();
                });
                bar.appendChild(btn);
            }

            const totalWidth = BTN_SIZE * actions.length;
            const { x, y } = this.computePosition(rect, totalWidth);
            bar.style.left = `${x}px`;
            bar.style.top = `${y}px`;

            this.root.appendChild(bar);
            document.body.appendChild(this.host);
        } catch {
            this.host = null;
            this.root = null;
        }
    }

    hide(): void {
        if (this.host?.parentNode) {
            this.host.parentNode.removeChild(this.host);
        }
        this.host = null;
        this.root = null;
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

    private computePosition(rect: DOMRect, totalWidth: number): { x: number; y: number } {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.right - totalWidth;
        let y = rect.bottom + MARGIN;
        if (x + totalWidth > vw - MARGIN) x = vw - totalWidth - MARGIN;
        if (x < MARGIN) x = MARGIN;
        if (y + BTN_SIZE > vh - MARGIN) y = rect.top - BTN_SIZE - MARGIN;
        if (y < MARGIN) y = MARGIN;
        return { x, y };
    }
}
