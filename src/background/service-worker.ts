import { translate } from "./translator";
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated,
    isTranslateMsg, isRuntimeMessage,
} from "../shared/messages";

const MENU_ID = "fayichajian-translate-selection";

const isRestrictedUrl = (url: string | undefined): boolean => {
    if (!url) return true;
    return /^(chrome|edge|about|chrome-extension|moz-extension|file):/i.test(url);
};

const notifyRestricted = () => {
    chrome.notifications.create({
        type: "basic",
        iconUrl: chrome.runtime.getURL("icons/128.png"),
        title: "翻译插件",
        message: "无法在此页面翻译（受限页面）",
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
    if (info.menuItemId !== MENU_ID) return;
    console.log("[翻译插件] 右键点击，selectionText=", info.selectionText?.slice(0, 50));
    if (!tab?.id || isRestrictedUrl(tab.url)) {
        notifyRestricted();
        return;
    }
    void dispatchToTab(tab.id, rtShowCard(info.selectionText));
});

chrome.commands.onCommand.addListener((command) => {
    if (command !== "translate") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id || isRestrictedUrl(tab.url)) {
            notifyRestricted();
            return;
        }
        void dispatchToTab(tab.id, rtRequestTranslate());
    });
});

chrome.action.onClicked.addListener((tab) => {
    if (!tab.windowId) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {/* ignore */});
});

chrome.runtime.onMessage.addListener((msg) => {
    if (!isRuntimeMessage(msg)) return;
    if (msg.type === "openOptions") {
        chrome.runtime.openOptionsPage();
    }
});

chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "translate") return;
    const ctrl = new AbortController();
    let pageOrigin: string | undefined;
    try {
        pageOrigin = port.sender?.url ? new URL(port.sender.url).origin : undefined;
    } catch { /* ignore */ }

    port.onMessage.addListener(async (msg) => {
        if (!isTranslateMsg(msg)) return;
        await translate(msg.text, port, ctrl.signal, undefined, pageOrigin);
        chrome.runtime.sendMessage(rtHistoryUpdated()).catch(() => {/* no listener ok */});
    });

    port.onDisconnect.addListener(() => {
        ctrl.abort();
    });
});
