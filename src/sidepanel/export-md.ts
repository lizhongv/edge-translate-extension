import type { Memo } from "../shared/types";

export function buildMemosMarkdown(memos: Memo[]): string {
    if (memos.length === 0) return "";
    return memos
        .map(m => `# ${m.title}\n\n${m.content}\n`)
        .join("\n---\n\n") + "\n---\n";
}
