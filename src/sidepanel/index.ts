import { clearHistory, deleteHistoryItem, getHistory } from "../shared/storage";
import type { HistoryItem } from "../shared/types";

const listEl = document.getElementById("list") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const tpl = document.getElementById("item-tpl") as HTMLTemplateElement;

function fmtTime(ts: number): string {
    return new Date(ts).toLocaleString();
}

function render(items: HistoryItem[]): void {
    listEl.innerHTML = "";
    if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "暂无翻译历史";
        listEl.appendChild(empty);
        return;
    }
    for (const item of items) {
        const node = tpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = item.id;
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(item.timestamp);
        (node.querySelector(".model") as HTMLElement).textContent = item.model;
        (node.querySelector(".src") as HTMLElement).textContent = item.sourceText;
        (node.querySelector(".dst") as HTMLElement).textContent = item.translatedText;
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async () => {
            await deleteHistoryItem(item.id);
            await refresh();
        });
        (node.querySelector(".copy") as HTMLElement).addEventListener("click", () => {
            navigator.clipboard.writeText(item.translatedText).catch(() => {/* ignore */});
        });
        listEl.appendChild(node);
    }
}

async function refresh(): Promise<void> {
    const items = await getHistory();
    render(items);
}

clearBtn.addEventListener("click", async () => {
    if (!confirm("确认清空全部历史？")) return;
    await clearHistory();
    await refresh();
});

chrome.runtime.onMessage.addListener((msg) => {
    if ((msg as any)?.type === "historyUpdated") {
        void refresh();
    }
});

void refresh();
