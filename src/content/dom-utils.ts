export function isInEditable(node: Node | null): boolean {
    let n: Node | null = node;
    while (n) {
        if (n instanceof HTMLElement) {
            if (n.isContentEditable) return true;
            const ce = n.getAttribute("contenteditable");
            if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
            const tag = n.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
        }
        n = n.parentNode;
    }
    return false;
}
