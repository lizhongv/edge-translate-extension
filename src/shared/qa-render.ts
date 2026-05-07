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

export function finalizeBubble(bubble: HTMLElement, fullContent: string): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) c.textContent = fullContent;
    if (bubble.querySelector(".copy")) return;
    const btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "复制";
    btn.addEventListener("click", () => {
        navigator.clipboard.writeText(fullContent).catch(() => {/* ignore */});
    });
    bubble.appendChild(btn);
}

export function setBubbleError(bubble: HTMLElement, message: string): void {
    bubble.classList.add("error");
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) {
        const cur = c.textContent ?? "";
        c.textContent = (cur ? cur + "\n\n" : "") + `⚠ ${message}`;
    }
}
