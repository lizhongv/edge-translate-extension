import { DEFAULT_SETTINGS, type Settings, type HistoryItem } from "./types";

const SETTINGS_SYNC_KEY = "settingsSync";
const SETTINGS_LOCAL_KEY = "settingsLocal";
const HISTORY_KEY = "history";
const CACHE_KEY = "cache";
const CACHE_MAX_ENTRIES = 500;
const STORAGE_TIMEOUT_MS = 1500;

const SENSITIVE_KEYS: Array<keyof Settings> = ["apiKey", "customHeaders"];

const splitSettings = (s: Settings): { syncPart: Partial<Settings>; localPart: Partial<Settings> } => {
    const syncPart: Partial<Settings> = { ...s };
    const localPart: Partial<Settings> = {};
    for (const k of SENSITIVE_KEYS) {
        localPart[k] = s[k] as never;
        delete syncPart[k];
    }
    return { syncPart, localPart };
};

function withTimeout<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
    return new Promise<T>((resolve) => {
        const timer = setTimeout(() => {
            console.warn(`[工具插件] storage ${label} 超过 ${STORAGE_TIMEOUT_MS}ms，使用默认值（chrome.storage.sync 可能因 Edge 同步异常而卡住）`);
            resolve(fallback);
        }, STORAGE_TIMEOUT_MS);
        promise.then((v) => { clearTimeout(timer); resolve(v); })
               .catch((e) => { clearTimeout(timer); console.warn(`[工具插件] storage ${label} 失败:`, e); resolve(fallback); });
    });
}

export async function getSettings(): Promise<Settings> {
    const [sync, local] = await Promise.all([
        withTimeout(chrome.storage.sync.get(SETTINGS_SYNC_KEY), {} as Record<string, unknown>, "sync.get(settings)"),
        withTimeout(chrome.storage.local.get(SETTINGS_LOCAL_KEY), {} as Record<string, unknown>, "local.get(settings)"),
    ]);
    return {
        ...DEFAULT_SETTINGS,
        ...((sync[SETTINGS_SYNC_KEY] as Partial<Settings> | undefined) ?? {}),
        ...((local[SETTINGS_LOCAL_KEY] as Partial<Settings> | undefined) ?? {}),
    };
}

export type PublicSettings = Omit<Settings, "apiKey" | "customHeaders">;

export async function getPublicSettings(): Promise<PublicSettings> {
    const sync = await withTimeout(
        chrome.storage.sync.get(SETTINGS_SYNC_KEY),
        {} as Record<string, unknown>,
        "sync.get(public)"
    );
    const merged = {
        ...DEFAULT_SETTINGS,
        ...((sync[SETTINGS_SYNC_KEY] as Partial<Settings> | undefined) ?? {}),
    };
    const { apiKey: _a, customHeaders: _c, ...pub } = merged;
    return pub;
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
    const current = await getSettings();
    const next = { ...current, ...patch };
    const { syncPart, localPart } = splitSettings(next);
    await chrome.storage.sync.set({ [SETTINGS_SYNC_KEY]: syncPart });
    await chrome.storage.local.set({ [SETTINGS_LOCAL_KEY]: localPart });
}

export async function getHistory(): Promise<HistoryItem[]> {
    const r = await chrome.storage.local.get(HISTORY_KEY);
    return (r[HISTORY_KEY] as HistoryItem[]) ?? [];
}

export async function appendHistory(item: HistoryItem): Promise<void> {
    const settings = await getSettings();
    const list = await getHistory();
    const next = [item, ...list].slice(0, settings.historyLimit);
    await chrome.storage.local.set({ [HISTORY_KEY]: next });
}

export async function deleteHistoryItem(id: string): Promise<void> {
    const list = await getHistory();
    await chrome.storage.local.set({ [HISTORY_KEY]: list.filter(h => h.id !== id) });
}

export async function clearHistory(): Promise<void> {
    await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

type CacheStore = { keys: string[]; entries: Record<string, string> };

const readCacheStore = async (): Promise<CacheStore> => {
    const r = await chrome.storage.local.get(CACHE_KEY);
    return (r[CACHE_KEY] as CacheStore) ?? { keys: [], entries: {} };
};

const writeCacheStore = async (s: CacheStore): Promise<void> => {
    await chrome.storage.local.set({ [CACHE_KEY]: s });
};

export async function readCache(key: string): Promise<string | undefined> {
    const store = await readCacheStore();
    return store.entries[key];
}

export async function writeCache(key: string, value: string): Promise<void> {
    const store = await readCacheStore();
    if (!(key in store.entries)) store.keys.push(key);
    store.entries[key] = value;
    while (store.keys.length > CACHE_MAX_ENTRIES) {
        const evict = store.keys.shift();
        if (evict !== undefined) delete store.entries[evict];
    }
    await writeCacheStore(store);
}

const QA_SESSIONS_KEY = "qa_sessions";

export async function getQASessions(): Promise<import("./types").QASession[]> {
    const r = await chrome.storage.local.get(QA_SESSIONS_KEY);
    const list = (r[QA_SESSIONS_KEY] as import("./types").QASession[]) ?? [];
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function upsertQASession(session: import("./types").QASession): Promise<void> {
    const settings = await getSettings();
    const r = await chrome.storage.local.get(QA_SESSIONS_KEY);
    const existing = (r[QA_SESSIONS_KEY] as import("./types").QASession[]) ?? [];
    const filtered = existing.filter(s => s.id !== session.id);
    const next = [session, ...filtered]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, settings.historyLimit);
    await chrome.storage.local.set({ [QA_SESSIONS_KEY]: next });
}

export async function deleteQASession(id: string): Promise<void> {
    const r = await chrome.storage.local.get(QA_SESSIONS_KEY);
    const list = (r[QA_SESSIONS_KEY] as import("./types").QASession[]) ?? [];
    await chrome.storage.local.set({
        [QA_SESSIONS_KEY]: list.filter(s => s.id !== id),
    });
}

export async function clearQASessions(): Promise<void> {
    await chrome.storage.local.set({ [QA_SESSIONS_KEY]: [] });
}

const MEMOS_KEY = "memos";

const memoUuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

const MEMO_TITLE_MAX_LEN = 30;

const autoTitle = (content: string): string =>
    content.replace(/\n/g, " ").trim().slice(0, MEMO_TITLE_MAX_LEN);

export async function getMemos(): Promise<import("./types").Memo[]> {
    const r = await chrome.storage.local.get(MEMOS_KEY);
    const list = (r[MEMOS_KEY] as import("./types").Memo[]) ?? [];
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function addMemo(
    input: Omit<import("./types").Memo, "id" | "createdAt" | "updatedAt">
): Promise<import("./types").Memo> {
    const settings = await getSettings();
    const r = await chrome.storage.local.get(MEMOS_KEY);
    const existing = (r[MEMOS_KEY] as import("./types").Memo[]) ?? [];
    const now = Date.now();
    const memo: import("./types").Memo = {
        ...input,
        id: memoUuid(),
        title: input.title?.trim() || autoTitle(input.content),
        createdAt: now,
        updatedAt: now,
    };
    const next = [memo, ...existing]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, settings.historyLimit);
    await chrome.storage.local.set({ [MEMOS_KEY]: next });
    return memo;
}

export async function updateMemo(
    id: string,
    patch: Partial<Pick<import("./types").Memo, "title" | "content">>
): Promise<void> {
    const r = await chrome.storage.local.get(MEMOS_KEY);
    const list = (r[MEMOS_KEY] as import("./types").Memo[]) ?? [];
    const idx = list.findIndex(m => m.id === id);
    if (idx === -1) return;
    const cur = list[idx];
    const nextContent = patch.content !== undefined ? patch.content : cur.content;
    const explicitTitle = patch.title !== undefined ? patch.title.trim() : undefined;
    const nextTitle = explicitTitle && explicitTitle.length > 0
        ? explicitTitle
        : (patch.title !== undefined ? autoTitle(nextContent) : cur.title);
    const updated: import("./types").Memo = {
        ...cur,
        title: nextTitle,
        content: nextContent,
        updatedAt: Date.now(),
    };
    const next = [...list.slice(0, idx), updated, ...list.slice(idx + 1)]
        .sort((a, b) => b.updatedAt - a.updatedAt);
    await chrome.storage.local.set({ [MEMOS_KEY]: next });
}

export async function deleteMemo(id: string): Promise<void> {
    const r = await chrome.storage.local.get(MEMOS_KEY);
    const list = (r[MEMOS_KEY] as import("./types").Memo[]) ?? [];
    await chrome.storage.local.set({
        [MEMOS_KEY]: list.filter(m => m.id !== id),
    });
}

export async function clearMemos(): Promise<void> {
    await chrome.storage.local.set({ [MEMOS_KEY]: [] });
}
