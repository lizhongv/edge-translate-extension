export function createMessageBubble(role: "user" | "assistant", content: string): HTMLElement {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    const c = document.createElement("div");
    c.className = "content";
    c.textContent = content;
    el.appendChild(c);
    return el;
}

export function appendTokenToBubble(bubble: HTMLElement, chunk: string): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (!c) return;
    c.textContent = (c.textContent ?? "") + chunk;
}

export function finalizeBubble(
    bubble: HTMLElement,
    fullContent: string,
    options?: {
        sourceText?: string;
        extraActions?: { label: string; onClick: () => void }[];
    }
): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) c.textContent = fullContent;
    if (bubble.querySelector(".copy")) return;

    const btnAns = document.createElement("button");
    btnAns.className = "copy";
    btnAns.type = "button";
    btnAns.textContent = "复制答案";
    btnAns.addEventListener("click", () => {
        navigator.clipboard.writeText(fullContent).catch(() => {/* ignore */});
    });
    bubble.appendChild(btnAns);

    if (options?.sourceText) {
        const btnSrc = document.createElement("button");
        btnSrc.className = "copy";
        btnSrc.type = "button";
        btnSrc.textContent = "复制原文";
        const srcText = options.sourceText;
        btnSrc.addEventListener("click", () => {
            navigator.clipboard.writeText(srcText).catch(() => {/* ignore */});
        });
        bubble.appendChild(btnSrc);
    }

    if (options?.extraActions) {
        for (const a of options.extraActions) {
            const btn = document.createElement("button");
            btn.className = "copy";
            btn.type = "button";
            btn.textContent = a.label;
            btn.addEventListener("click", a.onClick);
            bubble.appendChild(btn);
        }
    }
}

export function setBubbleError(bubble: HTMLElement, message: string): void {
    bubble.classList.add("error");
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) {
        const cur = c.textContent ?? "";
        c.textContent = (cur ? cur + "\n\n" : "") + `⚠ ${message}`;
    }
}
