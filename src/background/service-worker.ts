import { translate } from "./translator";
import { answerQA } from "./qa";
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenQA, rtSaveMemo,
    rtQASessionUpdated, isTaskMsg, isRuntimeMessage,
} from "../shared/messages";
import { APP_NAME, LOG_PREFIX, MENU_IDS } from "../shared/constants";

const MENU_ID = MENU_IDS.translate;
const MENU_QA_ID = MENU_IDS.qa;
const MENU_MEMO_ID = MENU_IDS.memo;
const MENU_ROOT_ID = "selectlingo-root";

const isRestrictedUrl = (url: string | undefined): boolean => {
    if (!url) return true;
    return /^(chrome|edge|about|chrome-extension|moz-extension|file):/i.test(url);
};

const notifyRestricted = (action: "翻译" | "问答" | "保存" = "翻译") => {
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: APP_NAME,
        message: `无法在此页面${action}（浏览器内置页面与扩展页面受限）`,
    });
};

/** 右键菜单：三个动作收在「划词译问」父菜单下，不在页面右键菜单里平铺占位。 */
function registerContextMenu(): void {
    const onCreated = (label: string) => () => {
        const err = chrome.runtime.lastError;
        if (err) console.error(LOG_PREFIX, `注册右键菜单「${label}」失败:`, err.message);
    };
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({ id: MENU_ROOT_ID, title: APP_NAME, contexts: ["selection"] },
            onCreated(APP_NAME));
        const items: [string, string][] = [
            [MENU_ID, "翻译选中内容"],
            [MENU_QA_ID, "就选中内容提问"],
            [MENU_MEMO_ID, "保存到备忘录"],
        ];
        for (const [id, title] of items) {
            chrome.contextMenus.create({ id, parentId: MENU_ROOT_ID, title, contexts: ["selection"] },
                onCreated(title));
        }
    });
}

chrome.runtime.onInstalled.addListener((details) => {
    registerContextMenu();
    // 首次安装打开设置页的欢迎引导：没有 API Key 时所有功能都不可用，先引导完成配置
    if (details.reason === "install") {
        chrome.tabs.create({ url: chrome.runtime.getURL("src/options/index.html#welcome") })
            .catch(() => chrome.runtime.openOptionsPage());
    }
});
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
        console.warn(LOG_PREFIX, "sendMessage 失败，尝试注入 content script:", err);
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
            console.error(LOG_PREFIX, "注入并重发失败:", e);
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
                console.warn(LOG_PREFIX, "sidePanel.open failed:", e);
            });
        } else {
            chrome.windows.getLastFocused().then((w) => {
                if (w.id !== undefined) {
                    chrome.sidePanel.open({ windowId: w.id }).catch((e) => {
                        // Known limitation: if user gesture chain breaks, sidePanel.open
                        // throws and the user must click the extension icon manually.
                        console.warn(LOG_PREFIX, "sidePanel.open fallback failed:", e);
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
