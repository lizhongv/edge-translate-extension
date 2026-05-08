import { vi, beforeEach } from "vitest";

// Minimal sidepanel HTML so that src/sidepanel/index.ts can initialise its
// module-level DOM refs when it is imported in unit tests.
document.body.innerHTML = `
  <section id="list-translate"></section>
  <section id="list-qa"></section>
  <section id="detail-qa"></section>
  <section id="list-memo"></section>
  <section id="detail-memo"></section>
  <button id="clear"></button>
  <button id="back" hidden></button>
  <input id="memo-search" hidden />
  <button id="memo-export" hidden></button>
  <button class="tab" data-tab="translate"></button>
  <button class="tab" data-tab="qa"></button>
  <button class="tab" data-tab="memo"></button>
  <template id="item-tpl"></template>
  <template id="qa-item-tpl"></template>
  <template id="qa-detail-tpl"></template>
  <template id="memo-item-tpl"></template>
  <template id="memo-detail-tpl"></template>
`;

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

const makeChromeGlobal = () => ({
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
});

// Provide chrome globals at module-load time so that any module that
// references `chrome.*` at top-level (e.g. sidepanel/index.ts) doesn't throw.
(globalThis as any).chrome = makeChromeGlobal();

beforeEach(() => {
    (globalThis as any).chrome = makeChromeGlobal();
});
