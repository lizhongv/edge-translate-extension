import { describe, it, expect } from "vitest";
import {
    getSettings, setSettings, getPublicSettings,
    appendHistory, getHistory, clearHistory, deleteHistoryItem,
    readCache, writeCache,
} from "../../src/shared/storage";
import { DEFAULT_SETTINGS } from "../../src/shared/types";

describe("settings", () => {
    it("returns defaults when nothing stored", async () => {
        const s = await getSettings();
        expect(s).toEqual(DEFAULT_SETTINGS);
    });

    it("setSettings then getSettings round-trips", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const s = await getSettings();
        expect(s.baseUrl).toBe("https://x");
        expect(s.apiKey).toBe("k");
        expect(s.model).toBe("m");
    });

    it("apiKey goes to storage.local, not sync", async () => {
        await setSettings({ apiKey: "secret", baseUrl: "https://x" });
        const sync = await chrome.storage.sync.get(null);
        const local = await chrome.storage.local.get("settingsLocal") as any;
        expect(JSON.stringify(sync)).not.toContain("secret");
        expect(local.settingsLocal.apiKey).toBe("secret");
    });

    it("getPublicSettings omits sensitive fields", async () => {
        await setSettings({ apiKey: "secret", baseUrl: "https://x", longTextThreshold: 1234 });
        const pub = await getPublicSettings();
        expect((pub as any).apiKey).toBeUndefined();
        expect((pub as any).customHeaders).toBeUndefined();
        expect(pub.baseUrl).toBe("https://x");
        expect(pub.longTextThreshold).toBe(1234);
    });
});

describe("history", () => {
    it("starts empty", async () => {
        expect(await getHistory()).toEqual([]);
    });

    it("appendHistory adds items in chronological order, newest first", async () => {
        await appendHistory({
            id: "1", sourceText: "a", translatedText: "A",
            targetLang: "en", model: "m", timestamp: 100,
        });
        await appendHistory({
            id: "2", sourceText: "b", translatedText: "B",
            targetLang: "en", model: "m", timestamp: 200,
        });
        const list = await getHistory();
        expect(list.map(h => h.id)).toEqual(["2", "1"]);
    });

    it("respects historyLimit by trimming oldest", async () => {
        await setSettings({ historyLimit: 2 });
        for (let i = 0; i < 5; i++) {
            await appendHistory({
                id: `${i}`, sourceText: "s", translatedText: "t",
                targetLang: "en", model: "m", timestamp: i,
            });
        }
        const list = await getHistory();
        expect(list.length).toBe(2);
        expect(list.map(h => h.id)).toEqual(["4", "3"]);
    });

    it("deleteHistoryItem removes by id", async () => {
        await appendHistory({
            id: "x", sourceText: "a", translatedText: "A",
            targetLang: "en", model: "m", timestamp: 1,
        });
        await deleteHistoryItem("x");
        expect(await getHistory()).toEqual([]);
    });

    it("clearHistory removes all", async () => {
        await appendHistory({
            id: "y", sourceText: "a", translatedText: "A",
            targetLang: "en", model: "m", timestamp: 1,
        });
        await clearHistory();
        expect(await getHistory()).toEqual([]);
    });
});

describe("cache", () => {
    it("returns undefined for missing key", async () => {
        expect(await readCache("nope")).toBeUndefined();
    });

    it("write then read returns value", async () => {
        await writeCache("k1", "v1");
        expect(await readCache("k1")).toBe("v1");
    });

    it("LRU caps at 500 entries", async () => {
        for (let i = 0; i < 510; i++) {
            await writeCache(`k${i}`, `v${i}`);
        }
        expect(await readCache("k0")).toBeUndefined();
        expect(await readCache("k509")).toBe("v509");
    });
});
