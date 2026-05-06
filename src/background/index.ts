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

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: MENU_ID,
            title: "翻译选中内容",
            contexts: ["selection"],
        });
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    if (!tab?.id || isRestrictedUrl(tab.url)) {
        notifyRestricted();
        return;
    }
    chrome.tabs.sendMessage(tab.id, rtShowCard()).catch(() => {
        notifyRestricted();
    });
});

chrome.commands.onCommand.addListener((command) => {
    if (command !== "translate") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id || isRestrictedUrl(tab.url)) {
            notifyRestricted();
            return;
        }
        chrome.tabs.sendMessage(tab.id, rtRequestTranslate()).catch(() => {
            notifyRestricted();
        });
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
