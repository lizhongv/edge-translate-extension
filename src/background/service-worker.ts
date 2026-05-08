import { translate } from "./translator";
import { answerQA } from "./qa";
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenQA, rtSaveMemo,
    rtQASessionUpdated, isTaskMsg, isRuntimeMessage,
} from "../shared/messages";

const MENU_ID = "fayichajian-translate-selection";
const MENU_QA_ID = "fayichajian-qa-selection";
const MENU_MEMO_ID = "fayichajian-memo-selection";

const isRestrictedUrl = (url: string | undefined): boolean => {
    if (!url) return true;
    return /^(chrome|edge|about|chrome-extension|moz-extension|file):/i.test(url);
};

const notifyRestricted = (action: "翻译" | "问答" | "保存" = "翻译") => {
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: "翻译插件",
        message: `无法在此页面${action}（受限页面）`,
    });
};

function registerContextMenu(): void {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: MENU_ID,
            title: "翻译选中内容",
            contexts: ["selection"],
        }, () => {
            const err = chrome.runtime.lastError;
            if (err) console.error("[翻译插件] 注册右键菜单失败:", err.message);
            else console.log("[翻译插件] 右键菜单已注册");
        });
        chrome.contextMenus.create({
            id: MENU_QA_ID,
            title: "问答选中内容",
            contexts: ["selection"],
        }, () => {
            const err = chrome.runtime.lastError;
            if (err) console.error("[翻译插件] 注册问答菜单失败:", err.message);
        });
        chrome.contextMenus.create({
            id: MENU_MEMO_ID,
            title: "保存选中到备忘录",
            contexts: ["selection"],
        }, () => {
            const err = chrome.runtime.lastError;
            if (err) console.error("[翻译插件] 注册备忘录菜单失败:", err.message);
        });
    });
}

chrome.runtime.onInstalled.addListener(registerContextMenu);
chrome.runtime.onStartup.addListener(registerContextMenu);
registerContextMenu();

function getContentScriptFiles(): string[] {
    const m = chrome.runtime.getManifest();
    const cs = m.content_scripts?.[0];
    return cs?.js ?? [];
}

async function dispatchToTab(tabId: number, message: unknown): Promise<void> {
    try {
        await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
        console.warn("[翻译插件] sendMessage 失败，尝试注入 content script:", err);
        const files = getContentScriptFiles();
        if (files.length === 0) {
            notifyRestricted();
            return;
        }
        try {
            await chrome.scripting.executeScript({ target: { tabId }, files });
            await new Promise((r) => setTimeout(r, 80));
            await chrome.tabs.sendMessage(tabId, message);
        } catch (e) {
            console.error("[翻译插件] 注入并重发失败:", e);
            notifyRestricted();
        }
    }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) {
        if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("翻译"); return; }
        void dispatchToTab(tab.id, rtShowCard(info.selectionText));
    } else if (info.menuItemId === MENU_QA_ID) {
        if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("问答"); return; }
        void dispatchToTab(tab.id, rtOpenQA(info.selectionText));
    } else if (info.menuItemId === MENU_MEMO_ID) {
        if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("保存"); return; }
        void dispatchToTab(tab.id, rtSaveMemo(info.selectionText ?? "", tab.url, tab.title));
    }
});

chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (command === "translate") {
            if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("翻译"); return; }
            void dispatchToTab(tab.id, rtRequestTranslate());
        } else if (command === "qa") {
            if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("问答"); return; }
            void dispatchToTab(tab.id, rtOpenQA());
        }
    });
});

chrome.action.onClicked.addListener((tab) => {
    if (!tab.windowId) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {/* ignore */});
});

chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!isRuntimeMessage(msg)) return;
    if (msg.type === "openOptions") {
        chrome.runtime.openOptionsPage();
    } else if (msg.type === "openSidepanel") {
        const tab = msg.tab ?? "translate";
        chrome.storage.local.set({ last_sidepanel_tab: tab }).catch(() => {/* ignore */});
        const windowId = sender.tab?.windowId;
        if (windowId !== undefined) {
            chrome.sidePanel.open({ windowId }).catch((e) => {
                // Known limitation: if user gesture chain breaks, sidePanel.open
                // throws and the user must click the extension icon manually.
                console.warn("[翻译插件] sidePanel.open failed:", e);
            });
        } else {
            chrome.windows.getLastFocused().then((w) => {
                if (w.id !== undefined) {
                    chrome.sidePanel.open({ windowId: w.id }).catch((e) => {
                        // Known limitation: if user gesture chain breaks, sidePanel.open
                        // throws and the user must click the extension icon manually.
                        console.warn("[翻译插件] sidePanel.open fallback failed:", e);
                    });
                }
            });
        }
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "task") return;
    const ctrl = new AbortController();
    let pageOrigin: string | undefined;
    try {
        pageOrigin = port.sender?.url ? new URL(port.sender.url).origin : undefined;
    } catch { /* ignore */ }

    port.onMessage.addListener(async (msg) => {
        if (!isTaskMsg(msg)) return;
        const p = msg.payload;
        if (p.task === "translate") {
            await translate(p.text, port, ctrl.signal, undefined, pageOrigin);
            chrome.runtime.sendMessage(rtHistoryUpdated()).catch(() => {/* no listener ok */});
        } else if (p.task === "qa") {
            await answerQA(p.sessionId, p.sourceText, p.messages, port, ctrl.signal, pageOrigin);
            chrome.runtime.sendMessage(rtQASessionUpdated(p.sessionId)).catch(() => {/* no listener ok */});
        }
    });

    port.onDisconnect.addListener(() => {
        ctrl.abort();
    });
});
