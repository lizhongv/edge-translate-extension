import { vi, beforeEach } from "vitest";

type StorageArea = {
    get: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
};

const makeStorageArea = (): StorageArea => {
    const store = new Map<string, unknown>();
    return {
        get: vi.fn((keys?: string | string[] | null) => {
            if (keys == null) return Promise.resolve(Object.fromEntries(store));
            const list = typeof keys === "string" ? [keys] : keys;
            const out: Record<string, unknown> = {};
            for (const k of list) if (store.has(k)) out[k] = store.get(k);
            return Promise.resolve(out);
        }),
        set: vi.fn((items: Record<string, unknown>) => {
            for (const [k, v] of Object.entries(items)) store.set(k, v);
            return Promise.resolve();
        }),
        remove: vi.fn((keys: string | string[]) => {
            const list = typeof keys === "string" ? [keys] : keys;
            for (const k of list) store.delete(k);
            return Promise.resolve();
        }),
        clear: vi.fn(() => {
            store.clear();
            return Promise.resolve();
        }),
    };
};

beforeEach(() => {
    (globalThis as any).chrome = {
        storage: {
            sync: makeStorageArea(),
            local: makeStorageArea(),
            onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        runtime: {
            sendMessage: vi.fn(),
            onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
            connect: vi.fn(),
            onConnect: { addListener: vi.fn(), removeListener: vi.fn() },
            getURL: vi.fn((p: string) => `chrome-extension://test/${p}`),
            openOptionsPage: vi.fn(),
        },
        contextMenus: {
            create: vi.fn(),
            removeAll: vi.fn(),
            onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
        },
        commands: { onCommand: { addListener: vi.fn(), removeListener: vi.fn() } },
        notifications: { create: vi.fn() },
        sidePanel: { open: vi.fn(), setOptions: vi.fn() },
        tabs: { sendMessage: vi.fn(), query: vi.fn() },
    };
});
