export function getSelectionText(): string {
    return (window.getSelection()?.toString() ?? "").trim();
}

export function getSelectionRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    return range.getBoundingClientRect();
}
