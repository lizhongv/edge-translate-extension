# 法译查鉴 · Edge 翻译扩展 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现一个 Edge MV3 翻译扩展：左键划词、右键菜单或 `Alt+T` 调用 OpenAI 兼容大模型流式翻译，浮动卡片显示，侧边栏累积历史，所有 LLM/语言/阈值/快捷键可配置。

**Architecture:** 4 运行时（service worker / content script / side panel / options page）协作，所有 LLM 调用集中在 service worker，content ↔ background 通过 `chrome.runtime.connect` 长连接传递流式 token。智能反向逻辑由 system prompt 完成，客户端不做语言判定。

**Tech Stack:** TypeScript + Vite + `@crxjs/vite-plugin`（MV3 manifest 生成与 HMR）+ Vitest（单元）+ Playwright（本地集成）。UI 用原生 DOM + Shadow DOM。无 React/Vue/Lit。

**Spec:** `docs/superpowers/specs/2026-05-06-edge-translation-extension-design.md`

---

## 文件结构（最终态）

```
fayichajian/
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts                # Phase 13
├── src/
│   ├── manifest.ts                     # CRXJS defineManifest
│   ├── shared/
│   │   ├── types.ts
│   │   ├── messages.ts
│   │   ├── storage.ts
│   │   └── lang.ts
│   ├── background/
│   │   ├── index.ts
│   │   ├── llm-client.ts
│   │   ├── translator.ts
│   │   └── cache.ts
│   ├── content/
│   │   ├── index.ts
│   │   ├── floating-card.ts
│   │   ├── selection.ts
│   │   └── card.css
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── index.ts
│   │   └── sidepanel.css
│   └── options/
│       ├── index.html
│       ├── index.ts
│       └── options.css
├── public/
│   └── icons/
│       ├── 16.png
│       ├── 32.png
│       ├── 48.png
│       └── 128.png
├── tests/
│   ├── setup.ts                        # vitest setup, chrome mock
│   ├── unit/
│   │   ├── lang.test.ts
│   │   ├── messages.test.ts
│   │   ├── storage.test.ts
│   │   ├── cache.test.ts
│   │   ├── llm-client.test.ts
│   │   └── translator.test.ts
│   └── e2e/                            # Phase 13
│       ├── fixtures/
│       │   └── mock-llm-server.ts
│       └── basic-flow.spec.ts
└── docs/superpowers/
    ├── specs/2026-05-06-edge-translation-extension-design.md
    └── plans/2026-05-06-edge-translation-extension.md
```

每个文件单一职责。`shared/` 内的模块不依赖任何 chrome.* 之外的运行时；`background/` 模块只在 service worker 跑；`content/` 在网页注入；`sidepanel/` 与 `options/` 是独立 HTML 页面。

---

## Task 1：项目初始化与 git 仓库

**Files:**
- Create: `.gitignore`
- Create: `README.md`
- Create: `package.json`

- [ ] **Step 1.1: 初始化 git 仓库**

```bash
git init
git config core.autocrlf true
```

- [ ] **Step 1.2: 写 `.gitignore`**

创建 `.gitignore`：

```
node_modules/
dist/
dist-build/
*.log
.DS_Store
.vscode/
.idea/
playwright-report/
test-results/
coverage/
.env
.env.local
```

- [ ] **Step 1.3: 写最小 README**

创建 `README.md`：

````markdown
# 法译查鉴 (fayichajian)

Edge / Chromium 浏览器翻译扩展：左键划词、右键菜单或 `Alt+T` 调用 OpenAI 兼容大模型流式翻译。

## 开发

```bash
npm install
npm run dev      # Vite + HMR，输出到 dist/
```

加载扩展：打开 `edge://extensions` → 启用"开发者模式" → "加载解压缩的扩展" → 选择 `dist/`。

## 配置

安装后右键扩展图标 → 选项，填入：
- Base URL（如 `https://api.openai.com/v1`）
- API Key
- Model（如 `gpt-4o-mini`）

详见 [设计文档](docs/superpowers/specs/2026-05-06-edge-translation-extension-design.md)。
````

- [ ] **Step 1.4: 初始化 npm 项目**

```bash
npm init -y
```

- [ ] **Step 1.5: 用以下完整内容覆盖 `package.json`**

```json
{
  "name": "fayichajian",
  "version": "0.1.0",
  "description": "Edge translation extension powered by OpenAI-compatible LLMs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "license": "MIT"
}
```

- [ ] **Step 1.6: 提交**

```bash
git add .gitignore README.md package.json
git commit -m "chore: initialize project skeleton"
```

---

## Task 2：安装依赖与 TypeScript / Vite / Vitest 配置

**Files:**
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`
- Modify: `package.json`（自动通过 npm install）

- [ ] **Step 2.1: 安装依赖**

```bash
npm install --save-dev typescript vite @types/chrome @crxjs/vite-plugin@beta vitest @vitest/coverage-v8 jsdom @types/node
```

- [ ] **Step 2.2: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["chrome", "node", "vitest/globals"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 2.3: 写 `vite.config.ts`（占位，Task 13 会接 manifest 插件）**

```ts
import { defineConfig } from "vite";

export default defineConfig({
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
    },
});
```

- [ ] **Step 2.4: 写 `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: ["./tests/setup.ts"],
        coverage: {
            provider: "v8",
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.d.ts", "src/manifest.ts"],
        },
    },
});
```

- [ ] **Step 2.5: 写 `tests/setup.ts`（chrome.* mock）**

```ts
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

declare global {
    // eslint-disable-next-line no-var
    var chrome: any;
}

beforeEach(() => {
    globalThis.chrome = {
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
```

- [ ] **Step 2.6: 验证 typecheck 与 vitest 启动**

```bash
npm run typecheck
npm run test
```

预期：typecheck 通过；vitest 报"No test files found"（正常，因为还没写测试）。

- [ ] **Step 2.7: 提交**

```bash
git add tsconfig.json vite.config.ts vitest.config.ts tests/setup.ts package.json package-lock.json
git commit -m "chore: configure typescript, vite, vitest"
```

---

## Task 3：`src/shared/types.ts`（全局类型）

**Files:**
- Create: `src/shared/types.ts`

类型只是声明，不需要 TDD。但要与后续模块**严格一致**——后续所有任务都引用这里。

- [ ] **Step 3.1: 写完整类型文件**

```ts
export type Settings = {
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    customHeaders: Record<string, string>;
    primaryTarget: string;
    secondaryTarget: string;
    longTextThreshold: number;
    historyLimit: number;
    shortcut: string;
};

export type HistoryItem = {
    id: string;
    sourceText: string;
    translatedText: string;
    targetLang: string;
    model: string;
    timestamp: number;
    pageOrigin?: string;
};

export type LLMErrorCode =
    | "auth"
    | "rate_limit"
    | "context_too_long"
    | "network"
    | "bad_response"
    | "aborted"
    | "unknown";

export type LLMError = {
    code: LLMErrorCode;
    message: string;
    retryable: boolean;
    httpStatus?: number;
};

export type PortMessage =
    | { type: "translate"; text: string }
    | { type: "token"; chunk: string }
    | { type: "done"; full: string }
    | { type: "error"; error: LLMError };

export type RuntimeMessage =
    | { type: "showCard" }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "openOptions" };

export type CacheEntry = {
    key: string;
    value: string;
    timestamp: number;
};

export const DEFAULT_SYSTEM_PROMPT =
    "You are a professional translator. Translate the user's input into {{TARGET_LANG}}.\n" +
    "Output only the translation itself: no explanations, no quotes, no markdown.\n" +
    "Preserve original formatting (line breaks, lists).\n" +
    "If the input is already in {{TARGET_LANG}}, translate it into {{SECONDARY_LANG}} instead.";

export const DEFAULT_SETTINGS: Settings = {
    baseUrl: "",
    apiKey: "",
    model: "gpt-4o-mini",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.2,
    customHeaders: {},
    primaryTarget: "中文",
    secondaryTarget: "English",
    longTextThreshold: 5000,
    historyLimit: 200,
    shortcut: "Alt+T",
};
```

- [ ] **Step 3.2: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 3.3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add core types and defaults"
```

---

## Task 4：`src/shared/lang.ts`（CJK 比例，仅供展示）

**Files:**
- Create: `tests/unit/lang.test.ts`
- Create: `src/shared/lang.ts`

- [ ] **Step 4.1: 写失败的测试**

`tests/unit/lang.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { detectChineseRatio, isChineseDominant } from "../../src/shared/lang";

describe("detectChineseRatio", () => {
    it("returns 0 for empty string", () => {
        expect(detectChineseRatio("")).toBe(0);
    });
    it("returns 0 for pure English", () => {
        expect(detectChineseRatio("hello world")).toBe(0);
    });
    it("returns 1 for pure Chinese", () => {
        expect(detectChineseRatio("你好世界")).toBe(1);
    });
    it("returns ratio for mixed content", () => {
        const r = detectChineseRatio("hello你好");
        expect(r).toBeGreaterThan(0);
        expect(r).toBeLessThan(1);
    });
    it("ignores ASCII punctuation and whitespace", () => {
        expect(detectChineseRatio("你好, world!")).toBeCloseTo(2 / (2 + 5), 2);
    });
    it("treats Japanese kana as CJK", () => {
        expect(detectChineseRatio("こんにちは")).toBe(1);
    });
});

describe("isChineseDominant", () => {
    it("true for >50% CJK", () => {
        expect(isChineseDominant("你好世界 hi")).toBe(true);
    });
    it("false for <50% CJK", () => {
        expect(isChineseDominant("hello world 你")).toBe(false);
    });
    it("false for empty", () => {
        expect(isChineseDominant("")).toBe(false);
    });
});
```

- [ ] **Step 4.2: 运行测试，确认失败**

```bash
npm run test -- lang
```

预期：FAIL（模块不存在）。

- [ ] **Step 4.3: 写实现**

`src/shared/lang.ts`：

```ts
const CJK_RANGE = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
const COUNTABLE = /[^\s\p{P}]/u;

export function detectChineseRatio(text: string): number {
    if (text.length === 0) return 0;
    let cjk = 0;
    let total = 0;
    for (const ch of text) {
        if (!COUNTABLE.test(ch)) continue;
        total++;
        if (CJK_RANGE.test(ch)) cjk++;
    }
    if (total === 0) return 0;
    return cjk / total;
}

export function isChineseDominant(text: string): boolean {
    return detectChineseRatio(text) > 0.5;
}
```

- [ ] **Step 4.4: 运行测试，确认通过**

```bash
npm run test -- lang
```

预期：PASS（8 个测试用例）。

- [ ] **Step 4.5: 提交**

```bash
git add src/shared/lang.ts tests/unit/lang.test.ts
git commit -m "feat(shared): add CJK ratio detection"
```

---

## Task 5：`src/shared/messages.ts`（消息构造器与守卫）

**Files:**
- Create: `tests/unit/messages.test.ts`
- Create: `src/shared/messages.ts`

- [ ] **Step 5.1: 写失败的测试**

`tests/unit/messages.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
    msgTranslate, msgToken, msgDone, msgError,
    isTranslateMsg, isTokenMsg, isDoneMsg, isErrorMsg,
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenOptions,
} from "../../src/shared/messages";

describe("port message constructors", () => {
    it("msgTranslate", () => {
        expect(msgTranslate("hi")).toEqual({ type: "translate", text: "hi" });
    });
    it("msgToken", () => {
        expect(msgToken("a")).toEqual({ type: "token", chunk: "a" });
    });
    it("msgDone", () => {
        expect(msgDone("full text")).toEqual({ type: "done", full: "full text" });
    });
    it("msgError", () => {
        const err = { code: "auth" as const, message: "bad", retryable: false };
        expect(msgError(err)).toEqual({ type: "error", error: err });
    });
});

describe("type guards", () => {
    it("isTranslateMsg", () => {
        expect(isTranslateMsg({ type: "translate", text: "x" })).toBe(true);
        expect(isTranslateMsg({ type: "token", chunk: "x" })).toBe(false);
        expect(isTranslateMsg(null)).toBe(false);
        expect(isTranslateMsg({})).toBe(false);
    });
    it("isTokenMsg", () => {
        expect(isTokenMsg({ type: "token", chunk: "x" })).toBe(true);
        expect(isTokenMsg({ type: "done", full: "x" })).toBe(false);
    });
    it("isDoneMsg", () => {
        expect(isDoneMsg({ type: "done", full: "x" })).toBe(true);
    });
    it("isErrorMsg", () => {
        expect(isErrorMsg({ type: "error", error: { code: "auth", message: "", retryable: false } })).toBe(true);
    });
});

describe("runtime message constructors", () => {
    it("constants", () => {
        expect(rtShowCard()).toEqual({ type: "showCard" });
        expect(rtRequestTranslate()).toEqual({ type: "requestTranslate" });
        expect(rtHistoryUpdated()).toEqual({ type: "historyUpdated" });
        expect(rtOpenOptions()).toEqual({ type: "openOptions" });
    });
});
```

- [ ] **Step 5.2: 运行测试，确认失败**

```bash
npm run test -- messages
```

预期：FAIL。

- [ ] **Step 5.3: 写实现**

`src/shared/messages.ts`：

```ts
import type { LLMError, PortMessage, RuntimeMessage } from "./types";

export const msgTranslate = (text: string): PortMessage => ({ type: "translate", text });
export const msgToken = (chunk: string): PortMessage => ({ type: "token", chunk });
export const msgDone = (full: string): PortMessage => ({ type: "done", full });
export const msgError = (error: LLMError): PortMessage => ({ type: "error", error });

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

export const isTranslateMsg = (v: unknown): v is { type: "translate"; text: string } =>
    isObj(v) && v.type === "translate" && typeof v.text === "string";

export const isTokenMsg = (v: unknown): v is { type: "token"; chunk: string } =>
    isObj(v) && v.type === "token" && typeof v.chunk === "string";

export const isDoneMsg = (v: unknown): v is { type: "done"; full: string } =>
    isObj(v) && v.type === "done" && typeof v.full === "string";

export const isErrorMsg = (v: unknown): v is { type: "error"; error: LLMError } =>
    isObj(v) && v.type === "error" && isObj(v.error);

export const rtShowCard = (): RuntimeMessage => ({ type: "showCard" });
export const rtRequestTranslate = (): RuntimeMessage => ({ type: "requestTranslate" });
export const rtHistoryUpdated = (): RuntimeMessage => ({ type: "historyUpdated" });
export const rtOpenOptions = (): RuntimeMessage => ({ type: "openOptions" });

export const isRuntimeMessage = (v: unknown): v is RuntimeMessage =>
    isObj(v)
    && typeof v.type === "string"
    && ["showCard", "requestTranslate", "historyUpdated", "openOptions"].includes(v.type);
```

- [ ] **Step 5.4: 运行测试，确认通过**

```bash
npm run test -- messages
```

预期：PASS。

- [ ] **Step 5.5: 提交**

```bash
git add src/shared/messages.ts tests/unit/messages.test.ts
git commit -m "feat(shared): add typed message constructors and guards"
```

---

## Task 6：`src/shared/storage.ts`（设置/历史/缓存的类型化封装）

**Files:**
- Create: `tests/unit/storage.test.ts`
- Create: `src/shared/storage.ts`

设计要点：
- 设置项中**敏感字段**（`apiKey`、`customHeaders`）写 `storage.local`；其余写 `storage.sync`。
- `getSettings()` 合并两边并填充默认值。
- 历史/缓存写 `storage.local`。

- [ ] **Step 6.1: 写失败的测试**

`tests/unit/storage.test.ts`：

```ts
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
        const local = await chrome.storage.local.get("settingsLocal");
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
```

- [ ] **Step 6.2: 运行测试，确认失败**

```bash
npm run test -- storage
```

预期：FAIL（模块不存在）。

- [ ] **Step 6.3: 写实现**

`src/shared/storage.ts`：

```ts
import { DEFAULT_SETTINGS, type Settings, type HistoryItem } from "./types";

const SETTINGS_SYNC_KEY = "settingsSync";
const SETTINGS_LOCAL_KEY = "settingsLocal";
const HISTORY_KEY = "history";
const CACHE_KEY = "cache";
const CACHE_MAX_ENTRIES = 500;

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

export async function getSettings(): Promise<Settings> {
    const sync = await chrome.storage.sync.get(SETTINGS_SYNC_KEY);
    const local = await chrome.storage.local.get(SETTINGS_LOCAL_KEY);
    return {
        ...DEFAULT_SETTINGS,
        ...(sync[SETTINGS_SYNC_KEY] ?? {}),
        ...(local[SETTINGS_LOCAL_KEY] ?? {}),
    };
}

export type PublicSettings = Omit<Settings, "apiKey" | "customHeaders">;

export async function getPublicSettings(): Promise<PublicSettings> {
    const sync = await chrome.storage.sync.get(SETTINGS_SYNC_KEY);
    const merged = { ...DEFAULT_SETTINGS, ...(sync[SETTINGS_SYNC_KEY] ?? {}) };
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
```

- [ ] **Step 6.4: 运行测试，确认通过**

```bash
npm run test -- storage
```

预期：PASS（12 个用例）。

- [ ] **Step 6.5: 提交**

```bash
git add src/shared/storage.ts tests/unit/storage.test.ts
git commit -m "feat(shared): add typed storage wrappers for settings/history/cache"
```

---

## Task 7：`src/background/cache.ts`（缓存键计算）

**Files:**
- Create: `tests/unit/cache.test.ts`
- Create: `src/background/cache.ts`

`storage.ts` 已经实现了 `readCache/writeCache`；`background/cache.ts` 只负责把"翻译参数"映射成稳定 key。

- [ ] **Step 7.1: 写失败的测试**

`tests/unit/cache.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { computeCacheKey, getCachedTranslation, setCachedTranslation } from "../../src/background/cache";

describe("computeCacheKey", () => {
    it("same input produces same key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        expect(a).toBe(b);
    });
    it("different text produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("world", "中文", "gpt-4o-mini");
        expect(a).not.toBe(b);
    });
    it("different target produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "English", "gpt-4o-mini");
        expect(a).not.toBe(b);
    });
    it("different model produces different key", async () => {
        const a = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        const b = await computeCacheKey("hello", "中文", "gpt-4o");
        expect(a).not.toBe(b);
    });
    it("returns hex string", async () => {
        const k = await computeCacheKey("hello", "中文", "gpt-4o-mini");
        expect(k).toMatch(/^[0-9a-f]+$/);
    });
});

describe("get/set cached translation", () => {
    it("miss returns undefined", async () => {
        const r = await getCachedTranslation("hi", "中文", "m");
        expect(r).toBeUndefined();
    });
    it("set then get returns value", async () => {
        await setCachedTranslation("hi", "中文", "m", "你好");
        const r = await getCachedTranslation("hi", "中文", "m");
        expect(r).toBe("你好");
    });
});
```

- [ ] **Step 7.2: 运行测试，确认失败**

```bash
npm run test -- cache
```

- [ ] **Step 7.3: 写实现**

`src/background/cache.ts`：

```ts
import { readCache, writeCache } from "../shared/storage";

const encoder = new TextEncoder();

export async function computeCacheKey(text: string, target: string, model: string): Promise<string> {
    const data = encoder.encode(`${model} ${target} ${text}`);
    const buf = await crypto.subtle.digest("SHA-1", data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function getCachedTranslation(text: string, target: string, model: string): Promise<string | undefined> {
    const key = await computeCacheKey(text, target, model);
    return readCache(key);
}

export async function setCachedTranslation(text: string, target: string, model: string, value: string): Promise<void> {
    const key = await computeCacheKey(text, target, model);
    await writeCache(key, value);
}
```

`crypto.subtle` 在 jsdom 环境通过 Node 的 `node:crypto` webcrypto 提供。如果 jsdom 不暴露，在 `tests/setup.ts` 顶部加：

```ts
import { webcrypto } from "node:crypto";
if (!globalThis.crypto) (globalThis as any).crypto = webcrypto;
```

- [ ] **Step 7.4: 运行测试，确认通过**

```bash
npm run test -- cache
```

预期：PASS。如果 `crypto.subtle is not defined`，添加上面的 polyfill 到 `tests/setup.ts`。

- [ ] **Step 7.5: 提交**

```bash
git add src/background/cache.ts tests/unit/cache.test.ts tests/setup.ts
git commit -m "feat(background): add SHA-1 keyed translation cache"
```

---

## Task 8：`src/background/llm-client.ts` · 第 1 部分：错误归一化

**Files:**
- Create: `tests/unit/llm-client.test.ts`
- Create: `src/background/llm-client.ts`

llm-client 复杂，分三个 task 推进：8（错误归一化）、9（SSE 解析与重试）、10（流式 stream() 函数）。

- [ ] **Step 8.1: 写失败的测试**

`tests/unit/llm-client.test.ts`（第一批）：

```ts
import { describe, it, expect } from "vitest";
import { normalizeError } from "../../src/background/llm-client";

describe("normalizeError", () => {
    it("401 → auth", () => {
        const e = normalizeError(new Response("", { status: 401 }), null);
        expect(e.code).toBe("auth");
        expect(e.retryable).toBe(false);
        expect(e.httpStatus).toBe(401);
    });

    it("403 → auth", () => {
        const e = normalizeError(new Response("", { status: 403 }), null);
        expect(e.code).toBe("auth");
    });

    it("429 → rate_limit retryable", () => {
        const e = normalizeError(new Response("", { status: 429 }), null);
        expect(e.code).toBe("rate_limit");
        expect(e.retryable).toBe(true);
    });

    it("400 with token/context body → context_too_long", () => {
        const e = normalizeError(
            new Response("", { status: 400 }),
            "This model's maximum context length is 8192 tokens"
        );
        expect(e.code).toBe("context_too_long");
        expect(e.retryable).toBe(false);
    });

    it("400 without token clue → unknown", () => {
        const e = normalizeError(new Response("", { status: 400 }), "bad request");
        expect(e.code).toBe("unknown");
    });

    it("500 → unknown retryable", () => {
        const e = normalizeError(new Response("", { status: 500 }), null);
        expect(e.code).toBe("unknown");
        expect(e.retryable).toBe(true);
    });

    it("AbortError → aborted", () => {
        const err = new DOMException("aborted", "AbortError");
        const e = normalizeError(null, null, err);
        expect(e.code).toBe("aborted");
        expect(e.retryable).toBe(false);
    });

    it("TypeError → network retryable", () => {
        const err = new TypeError("fetch failed");
        const e = normalizeError(null, null, err);
        expect(e.code).toBe("network");
        expect(e.retryable).toBe(true);
    });
});
```

- [ ] **Step 8.2: 运行测试，确认失败**

```bash
npm run test -- llm-client
```

- [ ] **Step 8.3: 写实现（仅 normalizeError，文件其余部分为占位）**

`src/background/llm-client.ts`：

```ts
import type { LLMError } from "../shared/types";

const TOKEN_HINT = /token|context length|maximum length|too long/i;

export function normalizeError(
    response: Response | null,
    body: string | null,
    err?: unknown
): LLMError {
    if (err instanceof DOMException && err.name === "AbortError") {
        return { code: "aborted", message: "已取消", retryable: false };
    }
    if (err instanceof TypeError) {
        return { code: "network", message: "网络异常", retryable: true };
    }
    if (response) {
        const status = response.status;
        if (status === 401 || status === 403) {
            return {
                code: "auth",
                message: "API Key 无效或权限不足，请检查设置",
                retryable: false,
                httpStatus: status,
            };
        }
        if (status === 429) {
            return {
                code: "rate_limit",
                message: "请求过于频繁，请稍后再试",
                retryable: true,
                httpStatus: 429,
            };
        }
        if (status === 400 && body && TOKEN_HINT.test(body)) {
            return {
                code: "context_too_long",
                message: "选中内容过长，超出模型上下文。请缩短选择或更换大上下文模型",
                retryable: false,
                httpStatus: 400,
            };
        }
        if (status >= 500 || status === 400) {
            return {
                code: "unknown",
                message: `服务器错误（${status}），请稍后重试`,
                retryable: status >= 500,
                httpStatus: status,
            };
        }
    }
    if (err instanceof Error) {
        return { code: "unknown", message: err.message, retryable: false };
    }
    return { code: "unknown", message: "未知错误", retryable: false };
}
```

- [ ] **Step 8.4: 运行测试，确认通过**

```bash
npm run test -- llm-client
```

预期：PASS（8 个 normalizeError 用例）。

- [ ] **Step 8.5: 提交**

```bash
git add src/background/llm-client.ts tests/unit/llm-client.test.ts
git commit -m "feat(background): normalize LLM errors to unified shape"
```

---

## Task 9：`llm-client.ts` · 第 2 部分：SSE 解析

**Files:**
- Modify: `src/background/llm-client.ts`
- Modify: `tests/unit/llm-client.test.ts`

OpenAI 兼容 SSE 格式：每行 `data: {...JSON...}\n\n`，`data: [DONE]` 表示结束。需要从 `ReadableStream<Uint8Array>` 提取 `choices[0].delta.content`。

- [ ] **Step 9.1: 在测试文件追加 SSE 解析测试**

```ts
import { parseSSEChunks, streamFromResponse } from "../../src/background/llm-client";

describe("parseSSEChunks", () => {
    it("extracts content from delta", () => {
        const lines = [
            'data: {"choices":[{"delta":{"content":"你"}}]}',
            'data: {"choices":[{"delta":{"content":"好"}}]}',
        ].join("\n\n") + "\n\n";
        expect([...parseSSEChunks(lines)]).toEqual(["你", "好"]);
    });

    it("ignores [DONE]", () => {
        const lines = 'data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["hi"]);
    });

    it("ignores lines without data:", () => {
        const lines = ': comment\n\nevent: ping\n\ndata: {"choices":[{"delta":{"content":"x"}}]}\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["x"]);
    });

    it("yields empty content as empty string (skipped)", () => {
        const lines = 'data: {"choices":[{"delta":{}}]}\n\ndata: {"choices":[{"delta":{"content":"a"}}]}\n\n';
        expect([...parseSSEChunks(lines)]).toEqual(["a"]);
    });

    it("throws on malformed JSON", () => {
        const lines = "data: {oops\n\n";
        expect(() => [...parseSSEChunks(lines)]).toThrow();
    });
});

describe("streamFromResponse", () => {
    const mkResponse = (text: string) => {
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(enc.encode(text));
                c.close();
            },
        });
        return new Response(stream);
    };

    it("yields content tokens in order", async () => {
        const r = mkResponse(
            'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n' +
            'data: {"choices":[{"delta":{"content":" world"}}]}\n\n' +
            'data: [DONE]\n\n'
        );
        const out: string[] = [];
        for await (const t of streamFromResponse(r)) out.push(t);
        expect(out).toEqual(["hello", " world"]);
    });

    it("handles split chunks across reads", async () => {
        const enc = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
            start(c) {
                c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hel'));
                c.enqueue(enc.encode('lo"}}]}\n\n'));
                c.enqueue(enc.encode('data: [DONE]\n\n'));
                c.close();
            },
        });
        const r = new Response(stream);
        const out: string[] = [];
        for await (const t of streamFromResponse(r)) out.push(t);
        expect(out).toEqual(["hello"]);
    });
});
```

- [ ] **Step 9.2: 运行测试，确认失败**

```bash
npm run test -- llm-client
```

- [ ] **Step 9.3: 在 `llm-client.ts` 顶部添加导入与解析函数**

在文件顶部添加：

```ts
// 顶部已有 import { LLMError } from "../shared/types";
```

在文件末尾追加：

```ts
export function* parseSSEChunks(buffer: string): Generator<string> {
    const events = buffer.split(/\n\n/);
    for (const ev of events) {
        if (!ev.trim()) continue;
        for (const line of ev.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            const parsed = JSON.parse(payload);
            const content = parsed?.choices?.[0]?.delta?.content;
            if (typeof content === "string" && content.length > 0) {
                yield content;
            }
        }
    }
}

export async function* streamFromResponse(response: Response): AsyncGenerator<string> {
    if (!response.body) throw new Error("response has no body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lastBoundary = buffer.lastIndexOf("\n\n");
            if (lastBoundary === -1) continue;
            const ready = buffer.slice(0, lastBoundary + 2);
            buffer = buffer.slice(lastBoundary + 2);
            for (const t of parseSSEChunks(ready)) yield t;
        }
        if (buffer.trim()) {
            for (const t of parseSSEChunks(buffer)) yield t;
        }
    } finally {
        reader.releaseLock();
    }
}
```

- [ ] **Step 9.4: 运行测试，确认通过**

```bash
npm run test -- llm-client
```

预期：PASS（normalize 8 + parseSSEChunks 5 + streamFromResponse 2 = 15）。

- [ ] **Step 9.5: 提交**

```bash
git add src/background/llm-client.ts tests/unit/llm-client.test.ts
git commit -m "feat(background): parse OpenAI-compatible SSE stream"
```

---

## Task 10：`llm-client.ts` · 第 3 部分：`stream()` + 重试

**Files:**
- Modify: `src/background/llm-client.ts`
- Modify: `tests/unit/llm-client.test.ts`

`stream()` 编排：构建请求体、插值 prompt、调 fetch、判错、必要时重试、yield token。

- [ ] **Step 10.1: 追加 stream() 测试**

```ts
import { stream } from "../../src/background/llm-client";
import { DEFAULT_SETTINGS } from "../../src/shared/types";

describe("stream", () => {
    const mkSseResponse = (status: number, sse: string) => {
        if (status !== 200) return new Response("err", { status });
        const enc = new TextEncoder();
        const s = new ReadableStream<Uint8Array>({
            start(c) { c.enqueue(enc.encode(sse)); c.close(); },
        });
        return new Response(s, { status });
    };

    const happy = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n';

    it("yields tokens on 200 SSE", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn().mockResolvedValue(mkSseResponse(200, happy));
        const out: string[] = [];
        for await (const t of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
            out.push(t);
        }
        expect(out).toEqual(["你好"]);
        expect(fetchSpy).toHaveBeenCalledOnce();
        const [, init] = fetchSpy.mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.model).toBe("m");
        expect(body.stream).toBe(true);
        expect(body.messages[0].content).toContain("中文");
        expect(body.messages[1].content).toBe("hi");
    });

    it("retries on 429 with backoff (max 2 retries)", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn()
            .mockResolvedValueOnce(mkSseResponse(429, ""))
            .mockResolvedValueOnce(mkSseResponse(429, ""))
            .mockResolvedValueOnce(mkSseResponse(200, happy));
        const out: string[] = [];
        for await (const t of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
            out.push(t);
        }
        expect(fetchSpy).toHaveBeenCalledTimes(3);
        expect(out).toEqual(["你好"]);
    });

    it("throws auth on 401 without retry", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const fetchSpy = vi.fn().mockResolvedValue(mkSseResponse(401, ""));
        await expect(async () => {
            for await (const _ of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
                /* noop */
            }
        }).rejects.toMatchObject({ code: "auth" });
        expect(fetchSpy).toHaveBeenCalledOnce();
    });

    it("throws auth when apiKey is empty without calling fetch", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "", model: "m" };
        const fetchSpy = vi.fn();
        await expect(async () => {
            for await (const _ of stream("hi", "中文", settings, new AbortController().signal, fetchSpy)) {
                /* noop */
            }
        }).rejects.toMatchObject({ code: "auth" });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("aborts mid-stream", async () => {
        const settings = { ...DEFAULT_SETTINGS, baseUrl: "https://api.x", apiKey: "k", model: "m" };
        const ctrl = new AbortController();
        const fetchSpy = vi.fn().mockImplementation(() => {
            // simulate fetch that respects abort
            return new Promise((_, rej) => {
                ctrl.signal.addEventListener("abort", () =>
                    rej(new DOMException("aborted", "AbortError"))
                );
            });
        });
        const promise = (async () => {
            const out: string[] = [];
            for await (const t of stream("hi", "中文", settings, ctrl.signal, fetchSpy)) {
                out.push(t);
            }
            return out;
        })();
        ctrl.abort();
        await expect(promise).rejects.toMatchObject({ code: "aborted" });
    });
});
```

注意：上面 import 中要加 `import { vi } from "vitest";` 到测试文件顶部（如果还没加）。

- [ ] **Step 10.2: 运行测试，确认失败**

```bash
npm run test -- llm-client
```

- [ ] **Step 10.3: 在 `llm-client.ts` 中追加 stream()**

```ts
import type { Settings } from "../shared/types";

type FetchFn = typeof fetch;

const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new DOMException("aborted", "AbortError"));
    }, { once: true });
});

const buildBody = (text: string, target: string, secondary: string, settings: Settings) => {
    const system = settings.systemPrompt
        .replaceAll("{{TARGET_LANG}}", target)
        .replaceAll("{{SECONDARY_LANG}}", secondary);
    return JSON.stringify({
        model: settings.model,
        stream: true,
        temperature: settings.temperature,
        messages: [
            { role: "system", content: system },
            { role: "user", content: text },
        ],
    });
};

const buildHeaders = (settings: Settings): HeadersInit => ({
    "Content-Type": "application/json",
    "Authorization": `Bearer ${settings.apiKey}`,
    ...settings.customHeaders,
});

const RETRY_DELAYS_RATE_LIMIT = [1000, 3000];
const RETRY_DELAYS_NETWORK = [500, 2000];
const RETRY_DELAYS_5XX = [1000];

const pickDelays = (err: LLMError): number[] => {
    if (err.code === "rate_limit") return RETRY_DELAYS_RATE_LIMIT;
    if (err.code === "network") return RETRY_DELAYS_NETWORK;
    if (err.code === "unknown" && err.httpStatus && err.httpStatus >= 500) return RETRY_DELAYS_5XX;
    return [];
};

async function attempt(
    text: string,
    target: string,
    secondary: string,
    settings: Settings,
    signal: AbortSignal,
    fetchFn: FetchFn
): Promise<Response> {
    const url = settings.baseUrl.replace(/\/$/, "") + "/chat/completions";
    let response: Response;
    try {
        response = await fetchFn(url, {
            method: "POST",
            headers: buildHeaders(settings),
            body: buildBody(text, target, secondary, settings),
            signal,
        });
    } catch (err) {
        throw normalizeError(null, null, err);
    }
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw normalizeError(response, body);
    }
    return response;
}

export async function* stream(
    text: string,
    target: string,
    settings: Settings,
    signal: AbortSignal,
    fetchFn: FetchFn = fetch
): AsyncGenerator<string> {
    if (!settings.apiKey) {
        throw {
            code: "auth",
            message: "请先在扩展设置中填入 API Key",
            retryable: false,
        } satisfies LLMError;
    }
    if (!settings.baseUrl) {
        throw {
            code: "auth",
            message: "请先在扩展设置中填入 Base URL",
            retryable: false,
        } satisfies LLMError;
    }

    let response: Response | null = null;
    let lastErr: LLMError | null = null;
    const allDelays = [0, ...RETRY_DELAYS_RATE_LIMIT, ...RETRY_DELAYS_NETWORK, ...RETRY_DELAYS_5XX];
    let attempts = 0;
    while (attempts < allDelays.length + 1) {
        try {
            response = await attempt(text, target, settings.secondaryTarget, settings, signal, fetchFn);
            break;
        } catch (e) {
            const err = e as LLMError;
            lastErr = err;
            if (!err.retryable) throw err;
            const delays = pickDelays(err);
            if (attempts >= delays.length) throw err;
            await sleep(delays[attempts], signal);
            attempts++;
        }
    }
    if (!response) throw lastErr ?? { code: "unknown", message: "无响应", retryable: false } as LLMError;

    try {
        for await (const chunk of streamFromResponse(response)) {
            yield chunk;
        }
    } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
            throw normalizeError(null, null, e);
        }
        throw {
            code: "bad_response",
            message: "翻译过程中断，请重试",
            retryable: false,
        } satisfies LLMError;
    }
}
```

- [ ] **Step 10.4: 运行测试，确认通过**

```bash
npm run test -- llm-client
```

预期：PASS（之前 15 + 新增 5 = 20）。

如果 retry 测试因 `setTimeout` 阻塞超时，在那个 `describe` 内最前加 `vi.useFakeTimers({ shouldAdvanceTime: true });` 并在 afterEach 重置；或把测试中 `RETRY_DELAYS_RATE_LIMIT` 用 `vi.advanceTimersByTime` 推进。简易做法：对 retry 测试用 `vi.setConfig({ testTimeout: 10000 })` 等真实 sleep（总 4s 可接受）。

- [ ] **Step 10.5: 提交**

```bash
git add src/background/llm-client.ts tests/unit/llm-client.test.ts
git commit -m "feat(background): stream() with retry/backoff and abort support"
```

---

## Task 11：`src/background/translator.ts`（编排）

**Files:**
- Create: `tests/unit/translator.test.ts`
- Create: `src/background/translator.ts`

职责：从 port 收到 `translate` 请求 → 决定 target（智能反向交给 prompt，所以 target 直接传 `primaryTarget`）→ 查缓存 → 调 stream → 推 token → 完成时写历史和缓存。

**关于"智能反向"**：因为反向逻辑由 prompt 完成（system 里有"if input is already in TARGET_LANG, translate to SECONDARY_LANG"），客户端不需要分情况处理。但**缓存键和历史的 targetLang** 需要反映实际方向，否则反向和正向会共用缓存。妥协：缓存键计算仍只用 `primaryTarget + text + model`——只要文本相同，模型行为应一致；历史记录里 `targetLang` 写 `primaryTarget`（用户看到的是"翻译"动作的目标语言名）。这与设计文档 §4.5 一致。

- [ ] **Step 11.1: 写失败的测试**

`tests/unit/translator.test.ts`：

```ts
import { describe, it, expect, vi } from "vitest";
import { translate } from "../../src/background/translator";
import { setSettings, getHistory } from "../../src/shared/storage";
import { setCachedTranslation } from "../../src/background/cache";

const mkPort = () => {
    const messages: any[] = [];
    return {
        port: { postMessage: vi.fn((m: any) => { messages.push(m); }) },
        messages,
    };
};

describe("translate orchestration", () => {
    it("cache hit → skip stream, emit done, write history", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        await setCachedTranslation("hello", "中文", "m", "你好");
        const { port, messages } = mkPort();
        const fakeStream = vi.fn();
        await translate("hello", port as any, new AbortController().signal, fakeStream);
        expect(fakeStream).not.toHaveBeenCalled();
        expect(messages).toEqual([{ type: "done", full: "你好" }]);
        const history = await getHistory();
        expect(history[0].sourceText).toBe("hello");
        expect(history[0].translatedText).toBe("你好");
    });

    it("cache miss → calls stream, pushes tokens, then done, writes cache+history", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* fakeStream() {
            yield "你";
            yield "好";
        }
        const streamFn = vi.fn(() => fakeStream());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages).toEqual([
            { type: "token", chunk: "你" },
            { type: "token", chunk: "好" },
            { type: "done", full: "你好" },
        ]);
        const h = await getHistory();
        expect(h[0].translatedText).toBe("你好");
    });

    it("stream throws LLMError → emits error, no history/cache write", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* failing() {
            yield "你";
            throw { code: "bad_response", message: "broken", retryable: false };
        }
        const streamFn = vi.fn(() => failing());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages[0]).toEqual({ type: "token", chunk: "你" });
        expect(messages[1]).toEqual({ type: "error", error: { code: "bad_response", message: "broken", retryable: false } });
        const h = await getHistory();
        expect(h.length).toBe(0);
    });

    it("aborted error → no history, no error post (silent cancel)", async () => {
        await setSettings({ baseUrl: "https://x", apiKey: "k", model: "m" });
        const { port, messages } = mkPort();
        async function* aborted() {
            throw { code: "aborted", message: "x", retryable: false };
        }
        const streamFn = vi.fn(() => aborted());
        await translate("hello", port as any, new AbortController().signal, streamFn);
        expect(messages).toEqual([]);
        expect((await getHistory()).length).toBe(0);
    });
});
```

- [ ] **Step 11.2: 运行测试，确认失败**

```bash
npm run test -- translator
```

- [ ] **Step 11.3: 写实现**

`src/background/translator.ts`：

```ts
import type { LLMError, Settings } from "../shared/types";
import { msgDone, msgError, msgToken } from "../shared/messages";
import { appendHistory, getSettings } from "../shared/storage";
import { getCachedTranslation, setCachedTranslation } from "./cache";
import { stream as defaultStream } from "./llm-client";

type Port = { postMessage(msg: unknown): void };
type StreamFn = (
    text: string,
    target: string,
    settings: Settings,
    signal: AbortSignal
) => AsyncGenerator<string>;

const uuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

export async function translate(
    text: string,
    port: Port,
    signal: AbortSignal,
    streamFn: StreamFn = defaultStream as StreamFn,
    pageOrigin?: string
): Promise<void> {
    const settings = await getSettings();
    const target = settings.primaryTarget;

    const cached = await getCachedTranslation(text, target, settings.model);
    if (cached !== undefined) {
        port.postMessage(msgDone(cached));
        await appendHistory({
            id: uuid(),
            sourceText: text,
            translatedText: cached,
            targetLang: target,
            model: settings.model,
            timestamp: Date.now(),
            pageOrigin,
        });
        return;
    }

    let full = "";
    try {
        for await (const chunk of streamFn(text, target, settings, signal)) {
            full += chunk;
            port.postMessage(msgToken(chunk));
        }
    } catch (e) {
        const err = e as LLMError;
        if (err.code !== "aborted") {
            port.postMessage(msgError(err));
        }
        return;
    }
    port.postMessage(msgDone(full));
    await setCachedTranslation(text, target, settings.model, full);
    await appendHistory({
        id: uuid(),
        sourceText: text,
        translatedText: full,
        targetLang: target,
        model: settings.model,
        timestamp: Date.now(),
        pageOrigin,
    });
}
```

- [ ] **Step 11.4: 运行测试，确认通过**

```bash
npm run test -- translator
```

预期：PASS（4 用例）。

- [ ] **Step 11.5: 提交**

```bash
git add src/background/translator.ts tests/unit/translator.test.ts
git commit -m "feat(background): orchestrate translate with cache, port, history"
```

---

## Task 12：`src/manifest.ts`（CRXJS 类型化 manifest）

**Files:**
- Create: `src/manifest.ts`

- [ ] **Step 12.1: 写 manifest**

`src/manifest.ts`：

```ts
import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

export default defineManifest({
    manifest_version: 3,
    name: "法译查鉴",
    version: pkg.version,
    description: "右键划词调用 OpenAI 兼容大模型流式翻译",
    permissions: [
        "contextMenus",
        "storage",
        "sidePanel",
        "notifications",
        "activeTab",
        "scripting",
    ],
    host_permissions: ["<all_urls>"],
    background: {
        service_worker: "src/background/index.ts",
        type: "module",
    },
    content_scripts: [
        {
            matches: ["<all_urls>"],
            js: ["src/content/index.ts"],
            run_at: "document_idle",
        },
    ],
    side_panel: {
        default_path: "src/sidepanel/index.html",
    },
    options_page: "src/options/index.html",
    action: {
        default_title: "法译查鉴 - 打开历史",
    },
    commands: {
        translate: {
            suggested_key: { default: "Alt+T" },
            description: "翻译当前选中文本",
        },
    },
    icons: {
        16: "icons/16.png",
        32: "icons/32.png",
        48: "icons/48.png",
        128: "icons/128.png",
    },
});
```

- [ ] **Step 12.2: 启用 tsconfig 的 JSON 模块导入断言**

`tsconfig.json` 已有 `resolveJsonModule: true`，但顶层 `import ... with { type: "json" }` 需要 `module: "ESNext"`（已有）和 `target: "ES2022"`（已有）。如果 typecheck 报错，改用：

```ts
import pkg from "../package.json" assert { type: "json" };
```

或者退而求其次写常量字符串：

```ts
const PKG_VERSION = "0.1.0";  // bump on release
```

- [ ] **Step 12.3: 提交**

```bash
git add src/manifest.ts
git commit -m "feat: add typed CRXJS manifest"
```

---

## Task 13：完整 `vite.config.ts` 与 CRXJS 接入

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 13.1: 用以下完整内容覆盖 `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./src/manifest";

export default defineConfig({
    plugins: [crx({ manifest })],
    build: {
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                sidepanel: "src/sidepanel/index.html",
                options: "src/options/index.html",
            },
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        hmr: { port: 5174 },
    },
});
```

- [ ] **Step 13.2: 提交**

```bash
git add vite.config.ts
git commit -m "build: wire CRXJS plugin and multi-entry HTMLs"
```

---

## Task 14：`src/background/index.ts`（service worker 入口）

**Files:**
- Create: `src/background/index.ts`

入口职责：
1. 注册右键菜单（`contexts: ["selection"]`）。
2. 监听 `commands.onCommand` 处理 `Alt+T`。
3. 监听 `runtime.onConnect` 处理来自 content 的 port，分发到 `translator`。
4. 受限页面提示 notifications。
5. 翻译完成后广播 `historyUpdated`。
6. 工具栏图标点击打开侧边栏。

无单元测试（直接绑定 chrome.* API，集成测试覆盖更合适）。

- [ ] **Step 14.1: 写实现**

`src/background/index.ts`：

```ts
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
        title: "法译查鉴",
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
        // 广播给 sidepanel
        chrome.runtime.sendMessage(rtHistoryUpdated()).catch(() => {/* no listener ok */});
    });

    port.onDisconnect.addListener(() => {
        ctrl.abort();
    });
});
```

- [ ] **Step 14.2: 运行 typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 14.3: 提交**

```bash
git add src/background/index.ts
git commit -m "feat(background): service worker entry with menu/command/port handlers"
```

---

## Task 15：`src/content/selection.ts`（选区与坐标）

**Files:**
- Create: `tests/unit/selection.test.ts`
- Create: `src/content/selection.ts`

- [ ] **Step 15.1: 写测试**

`tests/unit/selection.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getSelectionText, getSelectionRect } from "../../src/content/selection";

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("getSelectionText", () => {
    it("returns empty string when nothing selected", () => {
        expect(getSelectionText()).toBe("");
    });

    it("returns selected text", () => {
        const p = document.createElement("p");
        p.textContent = "hello world";
        document.body.appendChild(p);
        const range = document.createRange();
        range.selectNodeContents(p);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        expect(getSelectionText()).toBe("hello world");
    });
});

describe("getSelectionRect", () => {
    it("returns null when no selection", () => {
        expect(getSelectionRect()).toBeNull();
    });
});
```

- [ ] **Step 15.2: 运行测试，确认失败**

```bash
npm run test -- selection
```

- [ ] **Step 15.3: 写实现**

`src/content/selection.ts`：

```ts
export function getSelectionText(): string {
    return (window.getSelection()?.toString() ?? "").trim();
}

export function getSelectionRect(): DOMRect | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null;
    return range.getBoundingClientRect();
}
```

- [ ] **Step 15.4: 运行测试，确认通过**

```bash
npm run test -- selection
```

预期：PASS（3 用例）。

- [ ] **Step 15.5: 提交**

```bash
git add src/content/selection.ts tests/unit/selection.test.ts
git commit -m "feat(content): add selection text and rect helpers"
```

---

## Task 16：`src/content/floating-card.ts`（Shadow DOM 浮动卡片）

**Files:**
- Create: `src/content/card.css`
- Create: `src/content/floating-card.ts`

无单元测试（DOM API + 视觉行为，覆盖率收益低；手动验收清单覆盖）。后续 jsdom 集成测试可加，但本任务先不写。

- [ ] **Step 16.1: 写 `card.css`**

```css
:host {
    all: initial;
    color-scheme: light dark;
}
.card {
    position: fixed;
    z-index: 2147483647;
    max-width: 420px;
    min-width: 240px;
    background: #fff;
    color: #1a1a1a;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    font-size: 14px;
    line-height: 1.55;
    padding: 12px 14px;
    overflow-wrap: break-word;
}
@media (prefers-color-scheme: dark) {
    .card {
        background: #1f1f1f;
        color: #e6e6e6;
        border-color: rgba(255, 255, 255, 0.1);
    }
}
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
    opacity: 0.75;
}
.body {
    white-space: pre-wrap;
}
.footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 10px;
}
button {
    font: inherit;
    cursor: pointer;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 4px 10px;
    color: inherit;
    opacity: 0.85;
}
button:hover {
    opacity: 1;
}
.error { color: #c0392b; }
.spinner {
    display: inline-block;
    width: 10px; height: 10px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    margin-right: 6px;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 16.2: 写 `floating-card.ts`**

```ts
import cardCss from "./card.css?inline";
import type { LLMError } from "../shared/types";

type CardCallbacks = {
    onClose?: () => void;
    onRetry?: () => void;
    onConfirmLong?: () => void;
    onCancelLong?: () => void;
    onOpenOptions?: () => void;
};

export class FloatingCard {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
    private bodyEl: HTMLDivElement | null = null;
    private footerEl: HTMLDivElement | null = null;
    private headerEl: HTMLDivElement | null = null;
    private cb: CardCallbacks = {};

    mount(rect: DOMRect | null, callbacks: CardCallbacks = {}): void {
        this.unmount();
        this.cb = callbacks;
        this.host = document.createElement("div");
        this.host.style.all = "initial";
        this.root = this.host.attachShadow({ mode: "closed" });
        const style = document.createElement("style");
        style.textContent = cardCss;
        this.root.appendChild(style);

        const card = document.createElement("div");
        card.className = "card";
        const { x, y } = this.computePosition(rect);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;

        const header = document.createElement("div");
        header.className = "header";
        header.innerHTML = '<span>法译查鉴</span><span class="status"></span>';
        const body = document.createElement("div");
        body.className = "body";
        const footer = document.createElement("div");
        footer.className = "footer";

        card.appendChild(header);
        card.appendChild(body);
        card.appendChild(footer);
        this.root.appendChild(card);
        document.body.appendChild(this.host);

        this.headerEl = header;
        this.bodyEl = body;
        this.footerEl = footer;

        this.setLoading();

        document.addEventListener("keydown", this.onKey, true);
        document.addEventListener("mousedown", this.onClickOutside, true);
    }

    setLoading(): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.innerHTML = '<span class="spinner"></span>翻译中…';
        this.footerEl.innerHTML = "";
        const closeBtn = this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        });
        this.footerEl.appendChild(closeBtn);
    }

    requestLongConfirm(charCount: number): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.textContent = `选中内容较长（${charCount} 字符），可能费用较高/响应较慢，是否继续？`;
        this.footerEl.innerHTML = "";
        const ok = this.makeButton("继续", () => {
            this.cb.onConfirmLong?.();
        });
        const cancel = this.makeButton("取消", () => {
            this.cb.onCancelLong?.();
            this.unmount();
        });
        this.footerEl.appendChild(cancel);
        this.footerEl.appendChild(ok);
    }

    appendToken(chunk: string): void {
        if (!this.bodyEl) return;
        if (this.bodyEl.textContent?.startsWith("翻译中") || this.bodyEl.querySelector(".spinner")) {
            this.bodyEl.textContent = "";
        }
        this.bodyEl.textContent = (this.bodyEl.textContent ?? "") + chunk;
    }

    setComplete(full: string): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.textContent = full;
        this.footerEl.innerHTML = "";
        const copy = this.makeButton("复制", () => {
            navigator.clipboard.writeText(full).catch(() => {/* ignore */});
        });
        const close = this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        });
        this.footerEl.appendChild(copy);
        this.footerEl.appendChild(close);
    }

    setError(err: LLMError, partial?: string): void {
        if (!this.bodyEl || !this.footerEl) return;
        this.bodyEl.innerHTML = "";
        const errLine = document.createElement("div");
        errLine.className = "error";
        errLine.textContent = `⚠ ${err.message}`;
        this.bodyEl.appendChild(errLine);

        if (partial && partial.length > 0) {
            const part = document.createElement("div");
            part.style.marginTop = "8px";
            part.style.opacity = "0.8";
            part.textContent = partial;
            this.bodyEl.appendChild(part);
        }

        this.footerEl.innerHTML = "";
        if (err.code === "auth") {
            this.footerEl.appendChild(this.makeButton("打开设置", () => {
                this.cb.onOpenOptions?.();
                this.unmount();
            }));
        }
        if (err.code === "bad_response" || err.code === "unknown") {
            this.footerEl.appendChild(this.makeButton("重试", () => {
                this.cb.onRetry?.();
            }));
        }
        if (partial && partial.length > 0) {
            this.footerEl.appendChild(this.makeButton("复制部分", () => {
                navigator.clipboard.writeText(partial).catch(() => {/* ignore */});
            }));
        }
        this.footerEl.appendChild(this.makeButton("关闭", () => {
            this.cb.onClose?.();
            this.unmount();
        }));
    }

    unmount(): void {
        document.removeEventListener("keydown", this.onKey, true);
        document.removeEventListener("mousedown", this.onClickOutside, true);
        if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
        this.host = null;
        this.root = null;
        this.bodyEl = null;
        this.footerEl = null;
        this.headerEl = null;
    }

    isMounted(): boolean {
        return this.host !== null;
    }

    private makeButton(label: string, onClick: () => void): HTMLButtonElement {
        const b = document.createElement("button");
        b.textContent = label;
        b.addEventListener("click", onClick);
        return b;
    }

    private computePosition(rect: DOMRect | null): { x: number; y: number } {
        const margin = 8;
        if (!rect) return { x: 16, y: 16 };
        const cardW = 420;
        const cardH = 200;
        let x = rect.left;
        let y = rect.bottom + margin;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (x + cardW > vw - margin) x = vw - cardW - margin;
        if (y + cardH > vh - margin) y = Math.max(margin, rect.top - cardH - margin);
        return { x: Math.max(margin, x), y: Math.max(margin, y) };
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && this.host) {
            this.cb.onClose?.();
            this.unmount();
        }
    };

    private onClickOutside = (e: MouseEvent): void => {
        if (!this.host) return;
        const path = e.composedPath();
        if (!path.includes(this.host)) {
            this.cb.onClose?.();
            this.unmount();
        }
    };
}
```

- [ ] **Step 16.3: typecheck**

```bash
npm run typecheck
```

预期：通过。注意 `?inline` 后缀是 Vite 的 CSS 内联导入；测试环境（Vitest）需要在 `vitest.config.ts` 加 `transformMode: { web: [/\.css$/] }` 或简单地通过类型声明绕过。

为确保 Vitest 不报错，添加文件 `src/types/css.d.ts`：

```ts
declare module "*.css?inline" {
    const css: string;
    export default css;
}
```

并在 `tsconfig.json` 的 `include` 增加 `"src/types/**/*"`。

- [ ] **Step 16.4: 提交**

```bash
git add src/content/card.css src/content/floating-card.ts src/types/css.d.ts tsconfig.json
git commit -m "feat(content): floating card with Shadow DOM and states"
```

---

## Task 17：`src/content/index.ts`（content script 编排器）

**Files:**
- Create: `src/content/index.ts`

职责：
1. 监听 `chrome.runtime.onMessage` 收 `showCard` / `requestTranslate`。
2. 读取选区文本 + rect。
3. 判长文，必要时显示确认 UI。
4. 打开 port，订阅 token/done/error，更新卡片。
5. 卡片关闭即 disconnect。

- [ ] **Step 17.1: 写实现**

```ts
import { FloatingCard } from "./floating-card";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings } from "../shared/storage";
import { msgTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
import type { LLMError, RuntimeMessage } from "../shared/types";

const card = new FloatingCard();
let currentPort: chrome.runtime.Port | null = null;
let lastText = "";
let lastRect: DOMRect | null = null;
let partial = "";

function disconnect(): void {
    if (currentPort) {
        try { currentPort.disconnect(); } catch { /* ignore */ }
        currentPort = null;
    }
}

function startTranslation(text: string): void {
    partial = "";
    disconnect();
    const port = chrome.runtime.connect({ name: "translate" });
    currentPort = port;
    port.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            partial += msg.chunk;
            card.appendToken(msg.chunk);
        } else if (isDoneMsg(msg)) {
            card.setComplete(msg.full);
        } else if (isErrorMsg(msg)) {
            card.setError(msg.error as LLMError, partial);
        }
    });
    port.onDisconnect.addListener(() => {
        currentPort = null;
    });
    port.postMessage(msgTranslate(text));
}

async function handleTrigger(): Promise<void> {
    const text = getSelectionText();
    if (!text) return;
    const rect = getSelectionRect();
    lastText = text;
    lastRect = rect;
    const settings = await getPublicSettings();

    card.mount(rect, {
        onClose: () => {
            disconnect();
        },
        onRetry: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onOpenOptions: () => {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
        },
        onConfirmLong: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onCancelLong: () => {
            disconnect();
        },
    });

    if (text.length > settings.longTextThreshold) {
        card.requestLongConfirm(text.length);
    } else {
        startTranslation(text);
    }
}

chrome.runtime.onMessage.addListener((msg: RuntimeMessage) => {
    if (msg.type === "showCard" || msg.type === "requestTranslate") {
        void handleTrigger();
    }
});
```

- [ ] **Step 17.2: typecheck**

```bash
npm run typecheck
```

- [ ] **Step 17.3: 提交**

```bash
git add src/content/index.ts
git commit -m "feat(content): orchestrator wiring port lifecycle and card states"
```

---

## Task 18：`src/sidepanel/`（历史视图）

**Files:**
- Create: `src/sidepanel/index.html`
- Create: `src/sidepanel/sidepanel.css`
- Create: `src/sidepanel/index.ts`

- [ ] **Step 18.1: 写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>法译查鉴 - 历史</title>
    <link rel="stylesheet" href="./sidepanel.css" />
</head>
<body>
    <header>
        <h1>翻译历史</h1>
        <button id="clear">清空</button>
    </header>
    <main id="list"></main>
    <template id="item-tpl">
        <article class="item">
            <div class="meta">
                <span class="time"></span>
                <span class="model"></span>
                <button class="del" title="删除">×</button>
            </div>
            <div class="src"></div>
            <div class="dst"></div>
            <div class="actions">
                <button class="copy">复制译文</button>
            </div>
        </article>
    </template>
    <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 18.2: 写 `sidepanel.css`**

```css
* { box-sizing: border-box; }
body {
    margin: 0;
    font: 14px/1.55 -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    color: #1a1a1a;
    background: #fff;
}
@media (prefers-color-scheme: dark) {
    body { background: #1f1f1f; color: #e6e6e6; }
}
header {
    position: sticky;
    top: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    border-bottom: 1px solid rgba(0,0,0,0.1);
    background: inherit;
}
h1 { margin: 0; font-size: 15px; }
button {
    cursor: pointer;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 3px 10px;
    color: inherit;
    font: inherit;
}
main { padding: 8px 12px; }
.item {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 10px 12px;
    margin-bottom: 10px;
}
.meta {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    opacity: 0.7;
    margin-bottom: 6px;
}
.meta .del {
    margin-left: auto;
    border: none;
    font-size: 16px;
    line-height: 1;
    padding: 0 6px;
}
.src { opacity: 0.7; white-space: pre-wrap; margin-bottom: 6px; }
.dst { white-space: pre-wrap; }
.actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.empty {
    text-align: center;
    padding: 40px 16px;
    opacity: 0.6;
}
```

- [ ] **Step 18.3: 写 `index.ts`**

```ts
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
```

- [ ] **Step 18.4: 提交**

```bash
git add src/sidepanel/index.html src/sidepanel/sidepanel.css src/sidepanel/index.ts
git commit -m "feat(sidepanel): history list with delete/clear/copy"
```

---

## Task 19：`src/options/`（设置页）

**Files:**
- Create: `src/options/index.html`
- Create: `src/options/options.css`
- Create: `src/options/index.ts`

- [ ] **Step 19.1: 写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>法译查鉴 - 设置</title>
    <link rel="stylesheet" href="./options.css" />
</head>
<body>
    <main>
        <h1>法译查鉴 设置</h1>

        <section>
            <h2>LLM 接口</h2>
            <label>Base URL <input id="baseUrl" placeholder="https://api.openai.com/v1" /></label>
            <label>API Key <input id="apiKey" type="password" /></label>
            <label>Model <input id="model" placeholder="gpt-4o-mini" /></label>
            <label>Temperature <input id="temperature" type="number" step="0.1" min="0" max="2" /></label>
            <label>System Prompt
                <textarea id="systemPrompt" rows="6"></textarea>
            </label>
            <label>自定义请求头（JSON 对象）
                <textarea id="customHeaders" rows="3" placeholder='{"X-Custom": "value"}'></textarea>
            </label>
            <button id="testConn">测试连接</button>
            <span id="testResult" class="muted"></span>
        </section>

        <section>
            <h2>翻译方向</h2>
            <label>主要目标语言 <input id="primaryTarget" placeholder="中文" /></label>
            <label>第二语言（用于反向） <input id="secondaryTarget" placeholder="English" /></label>
        </section>

        <section>
            <h2>行为</h2>
            <label>长文软提示阈值（字符）<input id="longTextThreshold" type="number" min="100" /></label>
            <label>历史保留上限<input id="historyLimit" type="number" min="10" /></label>
            <p class="muted">
                快捷键在 <code>edge://extensions/shortcuts</code> 处修改。
                当前默认：<span id="shortcut">Alt+T</span>。
            </p>
        </section>

        <div class="bar">
            <button id="save">保存</button>
            <span id="saveResult" class="muted"></span>
        </div>
    </main>
    <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 19.2: 写 `options.css`**

```css
* { box-sizing: border-box; }
body {
    margin: 0;
    font: 14px/1.55 -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    color: #1a1a1a;
    background: #f7f7f7;
}
@media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #e6e6e6; }
    section, .bar { background: #232323; }
}
main { max-width: 720px; margin: 0 auto; padding: 24px; }
h1 { font-size: 20px; }
h2 { font-size: 15px; margin: 0 0 12px; }
section, .bar {
    background: #fff;
    border-radius: 10px;
    padding: 16px 18px;
    margin-bottom: 16px;
}
label {
    display: block;
    margin-bottom: 12px;
    font-size: 13px;
    color: inherit;
    opacity: 0.9;
}
input, textarea {
    display: block;
    width: 100%;
    margin-top: 4px;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 6px;
    padding: 6px 8px;
}
@media (prefers-color-scheme: dark) {
    input, textarea { border-color: rgba(255,255,255,0.15); }
}
button {
    cursor: pointer;
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 6px 14px;
}
.muted { opacity: 0.7; font-size: 12px; margin-left: 8px; }
.bar { display: flex; align-items: center; }
code { font-family: ui-monospace, Menlo, monospace; }
```

- [ ] **Step 19.3: 写 `index.ts`**

```ts
import { getSettings, setSettings } from "../shared/storage";
import { stream } from "../background/llm-client";
import type { Settings } from "../shared/types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const inputs = {
    baseUrl: $<HTMLInputElement>("baseUrl"),
    apiKey: $<HTMLInputElement>("apiKey"),
    model: $<HTMLInputElement>("model"),
    temperature: $<HTMLInputElement>("temperature"),
    systemPrompt: $<HTMLTextAreaElement>("systemPrompt"),
    customHeaders: $<HTMLTextAreaElement>("customHeaders"),
    primaryTarget: $<HTMLInputElement>("primaryTarget"),
    secondaryTarget: $<HTMLInputElement>("secondaryTarget"),
    longTextThreshold: $<HTMLInputElement>("longTextThreshold"),
    historyLimit: $<HTMLInputElement>("historyLimit"),
};

function fillForm(s: Settings): void {
    inputs.baseUrl.value = s.baseUrl;
    inputs.apiKey.value = s.apiKey;
    inputs.model.value = s.model;
    inputs.temperature.value = String(s.temperature);
    inputs.systemPrompt.value = s.systemPrompt;
    inputs.customHeaders.value = JSON.stringify(s.customHeaders, null, 2);
    inputs.primaryTarget.value = s.primaryTarget;
    inputs.secondaryTarget.value = s.secondaryTarget;
    inputs.longTextThreshold.value = String(s.longTextThreshold);
    inputs.historyLimit.value = String(s.historyLimit);
}

function readForm(): Partial<Settings> {
    let headers: Record<string, string> = {};
    try {
        const v = inputs.customHeaders.value.trim();
        headers = v ? JSON.parse(v) : {};
    } catch {
        throw new Error("自定义请求头不是合法 JSON");
    }
    return {
        baseUrl: inputs.baseUrl.value.trim(),
        apiKey: inputs.apiKey.value,
        model: inputs.model.value.trim(),
        temperature: Number(inputs.temperature.value) || 0.2,
        systemPrompt: inputs.systemPrompt.value,
        customHeaders: headers,
        primaryTarget: inputs.primaryTarget.value.trim(),
        secondaryTarget: inputs.secondaryTarget.value.trim(),
        longTextThreshold: Math.max(100, Number(inputs.longTextThreshold.value) || 5000),
        historyLimit: Math.max(10, Number(inputs.historyLimit.value) || 200),
    };
}

$<HTMLButtonElement>("save").addEventListener("click", async () => {
    const result = $<HTMLSpanElement>("saveResult");
    try {
        const patch = readForm();
        await setSettings(patch);
        result.textContent = "已保存";
    } catch (e) {
        result.textContent = (e as Error).message;
    }
});

$<HTMLButtonElement>("testConn").addEventListener("click", async () => {
    const result = $<HTMLSpanElement>("testResult");
    result.textContent = "测试中…";
    try {
        const patch = readForm();
        const settings: Settings = { ...(await getSettings()), ...patch };
        const t0 = performance.now();
        const ctrl = new AbortController();
        let token = "";
        for await (const t of stream("hi", "中文", settings, ctrl.signal)) {
            token += t;
            if (token.length > 4) ctrl.abort();
        }
        const dt = Math.round(performance.now() - t0);
        result.textContent = `✅ ${settings.model} 响应正常 (${dt}ms)`;
    } catch (e) {
        const err = e as { code?: string; message?: string };
        result.textContent = `❌ ${err.message ?? "未知错误"}`;
    }
});

void (async () => {
    fillForm(await getSettings());
})();
```

注意：在 options 页直接 import `../background/llm-client` 在 CRXJS 下会因为 ts 模块共享被打包到 options chunk 里——这正是设计意图（"测试连接复用同一份代码"，§5.5）。

- [ ] **Step 19.4: 提交**

```bash
git add src/options/index.html src/options/options.css src/options/index.ts
git commit -m "feat(options): settings form with save and test connection"
```

---

## Task 20：图标占位 + 首次构建

**Files:**
- Create: `public/icons/16.png`
- Create: `public/icons/32.png`
- Create: `public/icons/48.png`
- Create: `public/icons/128.png`

- [ ] **Step 20.1: 生成纯色占位 PNG**

任意取四张 16/32/48/128 的纯色 PNG（橙色 #ff7a3d）。Windows 下用 PowerShell：

```powershell
Add-Type -AssemblyName System.Drawing
$sizes = 16,32,48,128
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::FromArgb(255, 122, 61))
    $bmp.Save("public/icons/$s.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
}
```

或用任意图像工具手动放四张同名 PNG 到 `public/icons/`。

- [ ] **Step 20.2: 首次构建**

```bash
npm run build
```

预期：`dist/` 下产出 `manifest.json`、`background.*.js`、`content-scripts/`、`src/sidepanel/index.html`、`src/options/index.html` 等。

- [ ] **Step 20.3: 在 Edge 中加载验证**

打开 `edge://extensions` → 启用"开发者模式" → "加载解压缩的扩展" → 选 `dist/`。

预期：扩展出现在工具栏，没有红色错误提示。如果 console 有错，回到 Task 14/17 检查 service worker 注册和 content script 注入。

- [ ] **Step 20.4: 提交**

```bash
git add public/icons
git commit -m "feat: add placeholder icons and verify first build"
```

---

## Task 21：手动验收 · 端到端冒烟

无代码改动，跑一遍设计文档 §7.4 中的清单，记录问题。

- [ ] **Step 21.1: 配置真实 API**

在 Edge 工具栏点扩展图标 → 右键 → 选项；填入：
- Base URL: 你的 OpenAI 兼容端点
- API Key
- Model

点【测试连接】，预期 ✅。

- [ ] **Step 21.2: 主路径**

打开 https://en.wikipedia.org/wiki/Hello_World ；选中一段文字 → 右键 → "翻译选中内容"。

预期：浮动卡片在选区附近出现 → "翻译中…" → 流式逐字出现 → 显示【复制】【关闭】按钮。

- [ ] **Step 21.3: 智能反向**

选中页面上的"中文"文字（找一段中文页面，如 https://zh.wikipedia.org/wiki/你好世界）→ 翻译。

预期：译文为英文（验证 prompt 反向规则）。

- [ ] **Step 21.4: 缓存命中**

对同一段文字再次翻译。

预期：瞬间显示完整译文，DevTools Network 不再有 `/chat/completions` 请求。

- [ ] **Step 21.5: 取消**

选一段长文（数千字符）→ 翻译 → 在流式中途点【关闭】。

预期：卡片消失，DevTools Network 中该请求 `(canceled)`；侧边栏没有这条记录。

- [ ] **Step 21.6: 长文软提示**

选超过 5000 字符 → 翻译。

预期：卡片先显示"内容较长，是否继续？" + 【继续】【取消】。

- [ ] **Step 21.7: 受限页面**

打开 `edge://settings/` → 选中文字 → 右键翻译。

预期：系统通知"无法在此页面翻译（受限页面）"。

- [ ] **Step 21.8: 快捷键**

任意页面选中 → `Alt+T`。

预期：与右键菜单同效果。

- [ ] **Step 21.9: 侧边栏**

点扩展图标打开侧边栏。

预期：上面操作的所有翻译条目按时间倒序展示，可删除单条、可清空。

- [ ] **Step 21.10: 错误**

故意把 API Key 改错 → 翻译。

预期：卡片显示"API Key 无效或权限不足，请检查设置" + 【打开设置】按钮。点击会跳到选项页。

- [ ] **Step 21.11: 跨网站样式**

依次访问 GitHub / 知乎 / Twitter / Notion / Gmail ，各试一次翻译。

预期：浮动卡片样式不被宿主页面破坏（Shadow DOM 隔离生效）。

- [ ] **Step 21.12: 提交"通过"标记**

如果所有项通过，提交一个空的标记 commit：

```bash
git commit --allow-empty -m "test: manual smoke-test passed for v0.1.0"
```

如有 bug 修一个建一个 commit，循环直到通过。

---

## Task 22：可选 · 集成测试（Playwright）

仅在你想自动化集成测试时执行；与 Task 21 的手动测试是替代关系（且更脆弱）。**v1 推荐先跳过本 task**，等出现回归再加。

如要做：

- [ ] **Step 22.1: 安装 Playwright**

```bash
npm install --save-dev @playwright/test
npx playwright install chromium
```

- [ ] **Step 22.2: 写 `playwright.config.ts`、`tests/e2e/fixtures/mock-llm-server.ts`、`tests/e2e/basic-flow.spec.ts`**

(此处略——单独成 v1.1 的 task 推进，不阻塞 v1)

- [ ] **Step 22.3: 提交**

---

## Task 23：发布前最终化

- [ ] **Step 23.1: 跑完整测试与 typecheck**

```bash
npm run typecheck
npm run test
npm run build
```

三者都必须通过。

- [ ] **Step 23.2: 写 README 完整版**

更新 `README.md` 增加：
- 功能特性截图（可后补）
- 安装步骤
- 配置说明（每项配置含义）
- 已知限制（PDF、iframe、受限页面）
- 开发指南
- 许可证

- [ ] **Step 23.3: 打 v0.1.0 tag**

```bash
git add README.md
git commit -m "docs: README for v0.1.0"
git tag v0.1.0
```

---

## 执行总结

| 阶段 | Task | 产出 |
|---|---|---|
| 脚手架 | 1-2 | git / npm / TS / Vite / Vitest 配置 |
| 共享层 | 3-7 | types / lang / messages / storage / cache |
| LLM 客户端 | 8-10 | 错误归一化 / SSE 解析 / stream + 重试 |
| 后台编排 | 11 | translator |
| 构建配置 | 12-13 | manifest + Vite plugin |
| 入口 & UI | 14-19 | service worker / content / sidepanel / options |
| 收尾 | 20-23 | 图标 / 手动验收 / 发版 |

**TDD 原则**：每个有逻辑的 .ts 文件先写测试再写实现；UI 模块（floating-card、index.html、HTML 入口的 .ts）通过手动验收覆盖。

**频繁提交**：23 个 task 各自至少 1 个 commit，预计总计 30+ commits。

**何时停下来对齐**：
- Task 10 完成后（LLM 客户端可用），可以单独跑测试链，确认核心稳定。
- Task 19 完成后（UI 三件套完工），先做 Task 20 加载到 Edge 看一眼，再继续 Task 21 验收。

---
