# 翻译插件 v0.4.0 实施计划：划词问答 + 工具栏化浮标

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.3.0 基础上把单按钮浮标升级为可扩展的工具栏（[翻] [问]），并新增划词问答能力——选中文本 → 点 [问] → 弹出多轮对话卡片 → 答案流式输出 → 会话保存到侧边栏「问答」Tab，可重新打开继续追问。

**Architecture:** 工具栏 / QACard / qa.ts 三个新模块，Port 协议从 `"translate"` 升级为 `"task"`（discriminated payload），后端 router 派发到 translator / qa。会话状态归属内容脚本，每轮整批推给后端，后端无状态。会话存档到 `chrome.storage.local.qa_sessions`。

**Tech Stack:** 同 v0.3.0（TypeScript 严格模式 + Vite + CRXJS + Vitest + jsdom + Shadow DOM），无新依赖。

**Spec:** `docs/superpowers/specs/2026-05-07-qa-feature-design.md`

**基线：** 从 `main` (v0.3.0) 切出新分支 `feat/qa-feature`。

---

## 文件结构（最终态）

```
src/
├── shared/
│   ├── types.ts                # 修改：新增 ChatMessage / QASession / TaskPortMessage / Settings 三字段
│   ├── messages.ts             # 修改：task port 构造器 + qaSessionUpdated / openQA 运行时消息
│   ├── storage.ts              # 修改：getQASessions / upsertQASession / deleteQASession / clearQASessions
│   └── qa-render.ts            # 新增：消息泡泡 + 复制按钮的 DOM 纯函数（卡片/侧边栏共用）
├── content/
│   ├── dom-utils.ts            # 新增：isInEditable（从 hover-button.ts 搬过来）
│   ├── toolbar.ts              # 新增：Toolbar 类，数据驱动的工具栏
│   ├── toolbar.css             # 新增
│   ├── qa-card.ts              # 新增：QACard 类，多轮问答 Shadow DOM 卡片
│   ├── qa-card.css             # 新增
│   ├── floating-card.ts        # 修改：title 参数化（一行改动）
│   └── index.ts                # 修改：编排 toolbar + qaCard + qa runtime 消息
├── background/
│   ├── llm-client.ts           # 修改：stream() 改为 StreamInput discriminated union
│   ├── translator.ts           # 修改：调用 stream() 用新签名
│   ├── qa.ts                   # 新增：answerQA() + 截断 + upsertQASession + 广播
│   └── service-worker.ts       # 修改：port name "task" + 路由 + 右键「问答」菜单 + qa 命令
├── sidepanel/
│   ├── index.html              # 修改：Tab 结构 + QA 列表模板 + Session 详情容器
│   ├── index.ts                # 修改：Tab 切换 + QA 列表 + Session 详情视图 + 追问 + 广播监听
│   └── sidepanel.css           # 修改
├── options/
│   ├── index.html              # 修改：「问答」区段三字段
│   └── index.ts                # 修改：表单读写
└── manifest.ts                 # 修改：commands.qa（默认未绑定）

tests/unit/
├── toolbar.test.ts             # 新增（替代 hover-button.test.ts）
├── qa-render.test.ts           # 新增
├── qa-card.test.ts             # 新增
├── qa.test.ts                  # 新增
├── qa-storage.test.ts          # 新增（QA session 部分）
├── messages.test.ts            # 修改：新增类型测试
├── llm-client.test.ts          # 修改：StreamInput 适配
└── hover-button.test.ts        # 删除
```

---

## 里程碑划分

- **M1 — Foundation（任务 1–9）**：types / messages / storage / llm-client 基建。完成后既有翻译流仍跑通，未引入任何 UI。
- **M2 — Toolbar（任务 10–13）**：取代 HoverButton。完成后划词出现工具栏，[翻] 按钮触发翻译。
- **M3 — Single-turn QA（任务 14–19）**：QACard + qa.ts + 路由。完成后点 [问] 能输入问题并看到一轮回答。
- **M4 — Multi-turn + 错误处理（任务 20–22）**：追问、截断、错误状态、abort 回滚。
- **M5 — Sidepanel Tab（任务 23–26）**：双 Tab + 会话列表 + 详情视图 + 侧边栏继续追问。
- **M6 — Options 设置（任务 27）**：「问答」区段三字段。
- **M7 — 右键 / 快捷键（任务 28–29）**：「问答选中内容」菜单 + Alt+Q。
- **M8 — 收尾（任务 30–32）**：手测清单、README/CHANGELOG、打 v0.4.0 标签。

每完成一个里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一个。

---

## Task 0：建分支

**Files:** none.

- [ ] **Step 0.1: 切到 main 并拉最新**

```bash
git checkout main
git pull --ff-only origin main
```

- [ ] **Step 0.2: 切新分支**

```bash
git checkout -b feat/qa-feature
```

- [ ] **Step 0.3: 验证基线全绿**

```bash
npm run typecheck && npm run test && npm run build
```

预期：typecheck 通过，81 个测试全部通过，build 成功。如有失败先修复再开工。

---

# 里程碑 1：Foundation

## Task 1：扩展 types.ts —— ChatMessage / QASession

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1.1: 在文件末尾追加新类型**

打开 `src/shared/types.ts`，在 `DEFAULT_SETTINGS` 前面、`CacheEntry` 类型之后追加：

```ts
export type ChatMessage = {
    role: "user" | "assistant";
    content: string;
};

export type QASession = {
    id: string;
    sourceText: string;
    pageOrigin?: string;
    model: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
};
```

- [ ] **Step 1.2: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 1.3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add ChatMessage and QASession types"
```

---

## Task 2：扩展 Settings 三字段

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 2.1: 修改 Settings 类型**

在 `Settings` 类型最后一行 `enableHoverButton: boolean;` 之后追加三个字段，使其变成：

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
    enableHoverButton: boolean;
    enableQA: boolean;
    qaSystemPrompt: string;
    qaMaxTurns: number;
};
```

- [ ] **Step 2.2: 在 DEFAULT_SETTINGS 之前定义 DEFAULT_QA_SYSTEM_PROMPT**

在 `DEFAULT_SYSTEM_PROMPT` 常量之后追加：

```ts
export const DEFAULT_QA_SYSTEM_PROMPT =
    "You are a helpful assistant. The user has selected a passage of text from a webpage and will ask questions about it.\n" +
    "The selected text is provided as context. Answer the user's questions concisely and accurately, in the same language the user uses.\n" +
    "If the user's question is unrelated to the text, still try to be helpful.\n" +
    "Output plain text. Do not use markdown unless asked.";
```

- [ ] **Step 2.3: 在 DEFAULT_SETTINGS 末尾追加默认值**

在 `enableHoverButton: true,` 之后追加：

```ts
    enableQA: true,
    qaSystemPrompt: DEFAULT_QA_SYSTEM_PROMPT,
    qaMaxTurns: 6,
```

- [ ] **Step 2.4: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 2.5: 跑测试**

```bash
npm run test
```

预期：全绿。`storage.test.ts` 中比较 `DEFAULT_SETTINGS` 的用例两边同时变化，自动通过。

- [ ] **Step 2.6: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add QA settings (enableQA, qaSystemPrompt, qaMaxTurns)"
```

---

## Task 3：升级 Port 协议为 task discriminated union

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 3.1: 替换 PortMessage 类型定义**

把 `src/shared/types.ts` 中既有的 `PortMessage` 类型：

```ts
export type PortMessage =
    | { type: "translate"; text: string }
    | { type: "token"; chunk: string }
    | { type: "done"; full: string }
    | { type: "error"; error: LLMError };
```

替换为：

```ts
export type TaskRequest =
    | { task: "translate"; text: string }
    | { task: "qa"; sessionId: string; sourceText: string; messages: ChatMessage[] };

export type PortMessage =
    | { type: "task"; payload: TaskRequest }
    | { type: "token"; chunk: string }
    | { type: "done"; full: string }
    | { type: "error"; error: LLMError };
```

- [ ] **Step 3.2: typecheck**

```bash
npm run typecheck
```

预期：会有多处 TS 报错（messages.ts、translator.ts、service-worker.ts、content/index.ts、tests/unit/messages.test.ts、tests/unit/translator.test.ts）—— 这些都会在后续任务里逐个修复。本步骤**只**保留 types.ts 的修改作为基础。

- [ ] **Step 3.3: 提交（带 WIP 标记）**

```bash
git add src/shared/types.ts
git commit -m "refactor(types): port protocol → task discriminated payload (WIP, callers next)"
```

---

## Task 4：扩展 RuntimeMessage 类型

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 4.1: 修改 RuntimeMessage**

把 `src/shared/types.ts` 中：

```ts
export type RuntimeMessage =
    | { type: "showCard"; text?: string }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "openOptions" };
```

替换为：

```ts
export type RuntimeMessage =
    | { type: "showCard"; text?: string }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "qaSessionUpdated"; sessionId: string }
    | { type: "openQA"; text?: string }
    | { type: "openOptions" };
```

- [ ] **Step 4.2: typecheck**

```bash
npm run typecheck
```

预期：types 内部一致；其他文件错误延续 Task 3。

- [ ] **Step 4.3: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add qaSessionUpdated / openQA runtime messages"
```

---

## Task 5：更新 messages.ts 构造器与守卫

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `tests/unit/messages.test.ts`

- [ ] **Step 5.1: 写新测试（先失败）**

打开 `tests/unit/messages.test.ts`，把整个文件替换为：

```ts
import { describe, it, expect } from "vitest";
import {
    msgTaskTranslate, msgTaskQA, msgToken, msgDone, msgError,
    isTaskMsg, isTokenMsg, isDoneMsg, isErrorMsg,
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenOptions,
    rtQASessionUpdated, rtOpenQA,
    isRuntimeMessage,
} from "../../src/shared/messages";

describe("port message constructors", () => {
    it("msgTaskTranslate", () => {
        expect(msgTaskTranslate("hi")).toEqual({
            type: "task",
            payload: { task: "translate", text: "hi" },
        });
    });
    it("msgTaskQA", () => {
        const msgs = [{ role: "user" as const, content: "Q" }];
        expect(msgTaskQA("sid", "src", msgs)).toEqual({
            type: "task",
            payload: { task: "qa", sessionId: "sid", sourceText: "src", messages: msgs },
        });
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
    it("isTaskMsg accepts translate", () => {
        expect(isTaskMsg({ type: "task", payload: { task: "translate", text: "x" } })).toBe(true);
    });
    it("isTaskMsg accepts qa", () => {
        expect(isTaskMsg({
            type: "task",
            payload: { task: "qa", sessionId: "s", sourceText: "x", messages: [] },
        })).toBe(true);
    });
    it("isTaskMsg rejects malformed", () => {
        expect(isTaskMsg({ type: "task" })).toBe(false);
        expect(isTaskMsg({ type: "task", payload: { task: "other" } })).toBe(false);
        expect(isTaskMsg(null)).toBe(false);
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
        expect(rtShowCard("hi")).toEqual({ type: "showCard", text: "hi" });
        expect(rtRequestTranslate()).toEqual({ type: "requestTranslate" });
        expect(rtHistoryUpdated()).toEqual({ type: "historyUpdated" });
        expect(rtOpenOptions()).toEqual({ type: "openOptions" });
        expect(rtQASessionUpdated("sid-1")).toEqual({ type: "qaSessionUpdated", sessionId: "sid-1" });
        expect(rtOpenQA()).toEqual({ type: "openQA" });
        expect(rtOpenQA("text")).toEqual({ type: "openQA", text: "text" });
    });
    it("isRuntimeMessage accepts all known types", () => {
        expect(isRuntimeMessage({ type: "showCard" })).toBe(true);
        expect(isRuntimeMessage({ type: "qaSessionUpdated", sessionId: "x" })).toBe(true);
        expect(isRuntimeMessage({ type: "openQA" })).toBe(true);
        expect(isRuntimeMessage({ type: "unknown" })).toBe(false);
        expect(isRuntimeMessage(null)).toBe(false);
    });
});
```

- [ ] **Step 5.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/messages.test.ts
```

预期：失败，因为新 API 还没实现。

- [ ] **Step 5.3: 实现新 messages.ts**

把 `src/shared/messages.ts` 整个文件替换为：

```ts
import type { ChatMessage, LLMError, PortMessage, RuntimeMessage } from "./types";

export const msgTaskTranslate = (text: string): PortMessage => ({
    type: "task",
    payload: { task: "translate", text },
});

export const msgTaskQA = (
    sessionId: string,
    sourceText: string,
    messages: ChatMessage[]
): PortMessage => ({
    type: "task",
    payload: { task: "qa", sessionId, sourceText, messages },
});

export const msgToken = (chunk: string): PortMessage => ({ type: "token", chunk });
export const msgDone = (full: string): PortMessage => ({ type: "done", full });
export const msgError = (error: LLMError): PortMessage => ({ type: "error", error });

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null;

export const isTaskMsg = (
    v: unknown
): v is { type: "task"; payload: { task: "translate"; text: string } |
                                  { task: "qa"; sessionId: string; sourceText: string; messages: ChatMessage[] } } => {
    if (!isObj(v) || v.type !== "task" || !isObj(v.payload)) return false;
    const p = v.payload;
    if (p.task === "translate") return typeof p.text === "string";
    if (p.task === "qa") {
        return typeof p.sessionId === "string"
            && typeof p.sourceText === "string"
            && Array.isArray(p.messages);
    }
    return false;
};

export const isTokenMsg = (v: unknown): v is { type: "token"; chunk: string } =>
    isObj(v) && v.type === "token" && typeof v.chunk === "string";

export const isDoneMsg = (v: unknown): v is { type: "done"; full: string } =>
    isObj(v) && v.type === "done" && typeof v.full === "string";

export const isErrorMsg = (v: unknown): v is { type: "error"; error: LLMError } =>
    isObj(v) && v.type === "error" && isObj(v.error);

export const rtShowCard = (text?: string): RuntimeMessage =>
    text !== undefined ? { type: "showCard", text } : { type: "showCard" };
export const rtRequestTranslate = (): RuntimeMessage => ({ type: "requestTranslate" });
export const rtHistoryUpdated = (): RuntimeMessage => ({ type: "historyUpdated" });
export const rtOpenOptions = (): RuntimeMessage => ({ type: "openOptions" });
export const rtQASessionUpdated = (sessionId: string): RuntimeMessage => ({
    type: "qaSessionUpdated",
    sessionId,
});
export const rtOpenQA = (text?: string): RuntimeMessage =>
    text !== undefined ? { type: "openQA", text } : { type: "openQA" };

const KNOWN_RT_TYPES = [
    "showCard", "requestTranslate", "historyUpdated",
    "qaSessionUpdated", "openQA", "openOptions",
] as const;

export const isRuntimeMessage = (v: unknown): v is RuntimeMessage =>
    isObj(v)
    && typeof v.type === "string"
    && (KNOWN_RT_TYPES as readonly string[]).includes(v.type);
```

- [ ] **Step 5.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/messages.test.ts
```

预期：全部通过。

- [ ] **Step 5.5: 提交**

```bash
git add src/shared/messages.ts tests/unit/messages.test.ts
git commit -m "feat(messages): task port + qaSessionUpdated/openQA runtime messages"
```

---

## Task 6：扩展 storage.ts —— QA Session API

**Files:**
- Modify: `src/shared/storage.ts`
- Create: `tests/unit/qa-storage.test.ts`

- [ ] **Step 6.1: 写测试（先失败）**

新建 `tests/unit/qa-storage.test.ts`：

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
    getQASessions, upsertQASession, deleteQASession, clearQASessions,
} from "../../src/shared/storage";
import type { QASession } from "../../src/shared/types";

const mkSession = (id: string, updatedAt: number, messages: { role: "user" | "assistant"; content: string }[] = []): QASession => ({
    id,
    sourceText: `src-${id}`,
    model: "deepseek-chat",
    createdAt: updatedAt,
    updatedAt,
    messages,
});

describe("getQASessions", () => {
    it("empty by default", async () => {
        const sessions = await getQASessions();
        expect(sessions).toEqual([]);
    });

    it("returns sessions sorted by updatedAt desc", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 300));
        await upsertQASession(mkSession("c", 200));
        const list = await getQASessions();
        expect(list.map(s => s.id)).toEqual(["b", "c", "a"]);
    });
});

describe("upsertQASession", () => {
    it("inserts a new session", async () => {
        await upsertQASession(mkSession("a", 100));
        const list = await getQASessions();
        expect(list).toHaveLength(1);
        expect(list[0].id).toBe("a");
    });

    it("updates existing session by id", async () => {
        await upsertQASession(mkSession("a", 100, [{ role: "user", content: "Q1" }]));
        await upsertQASession(mkSession("a", 200, [
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
        ]));
        const list = await getQASessions();
        expect(list).toHaveLength(1);
        expect(list[0].messages).toHaveLength(2);
        expect(list[0].updatedAt).toBe(200);
    });

    it("respects historyLimit when inserting", async () => {
        const { setSettings } = await import("../../src/shared/storage");
        await setSettings({ historyLimit: 2 });
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await upsertQASession(mkSession("c", 300));
        const list = await getQASessions();
        expect(list).toHaveLength(2);
        expect(list.map(s => s.id)).toEqual(["c", "b"]);
    });
});

describe("deleteQASession", () => {
    it("removes the session by id", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await deleteQASession("a");
        const list = await getQASessions();
        expect(list.map(s => s.id)).toEqual(["b"]);
    });
});

describe("clearQASessions", () => {
    it("empties the store", async () => {
        await upsertQASession(mkSession("a", 100));
        await upsertQASession(mkSession("b", 200));
        await clearQASessions();
        const list = await getQASessions();
        expect(list).toEqual([]);
    });
});
```

- [ ] **Step 6.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-storage.test.ts
```

预期：失败，新函数未实现。

- [ ] **Step 6.3: 实现 storage.ts 增量**

打开 `src/shared/storage.ts`，在文件末尾追加：

```ts
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
```

- [ ] **Step 6.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa-storage.test.ts
```

预期：全部通过。

- [ ] **Step 6.5: 跑全量测试，确保未影响其他模块**

```bash
npm run test
```

预期：messages.test.ts 已通过，qa-storage 通过；其他与 Port 重构相关的测试可能仍红（translator/llm-client），后续任务修。

- [ ] **Step 6.6: 提交**

```bash
git add src/shared/storage.ts tests/unit/qa-storage.test.ts
git commit -m "feat(storage): QA session API (get/upsert/delete/clear)"
```

---

## Task 7：重构 llm-client.ts —— StreamInput 联合类型

**Files:**
- Modify: `src/background/llm-client.ts`
- Modify: `tests/unit/llm-client.test.ts`

- [ ] **Step 7.1: 检查现有测试**

```bash
npm run test -- tests/unit/llm-client.test.ts
```

预期：失败（因为 Task 3 改了 PortMessage，但 llm-client.ts 与 PortMessage 无关 —— 测试失败应当来自后续修改；如果当前还能跑通就先继续）。先记下当前测试形态，下面会按 StreamInput 重写测试。

- [ ] **Step 7.2: 重写 llm-client.test.ts**

把 `tests/unit/llm-client.test.ts` 中所有调用 `stream("text", "中文", settings, signal, fetchFn)` 的形式，改为：

```ts
stream(
    { kind: "translate", text: "text", target: "中文" },
    settings,
    signal,
    fetchFn
)
```

并新增至少一个 `kind: "chat"` 路径用例：

```ts
it("stream({kind:'chat'}) sends system + messages array", async () => {
    const settings = makeSettings();
    const fetchFn = vi.fn().mockResolvedValue(makeSSEResponse(["A", "B"]));
    const ctrl = new AbortController();
    const out: string[] = [];
    for await (const t of stream(
        { kind: "chat", system: "SYS", messages: [{ role: "user", content: "Q" }] },
        settings,
        ctrl.signal,
        fetchFn
    )) {
        out.push(t);
    }
    expect(out.join("")).toBe("AB");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.messages).toEqual([
        { role: "system", content: "SYS" },
        { role: "user", content: "Q" },
    ]);
});
```

打开 `tests/unit/llm-client.test.ts` 把每一个 `stream(text, target, settings, ...)` 调用都改为 `stream({ kind: "translate", text, target }, settings, ...)`。新增上面的 chat 测试。

- [ ] **Step 7.3: 跑测试，确认失败**

```bash
npm run test -- tests/unit/llm-client.test.ts
```

预期：失败（签名不匹配 + kind:"chat" 未实现）。

- [ ] **Step 7.4: 重构 llm-client.ts**

打开 `src/background/llm-client.ts`：

把：
```ts
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
```

替换为：

```ts
import type { ChatMessage } from "../shared/types";

export type StreamInput =
    | { kind: "translate"; text: string; target: string }
    | { kind: "chat"; system: string; messages: ChatMessage[] };

const buildBodyFromInput = (input: StreamInput, secondary: string, settings: Settings): string => {
    let messages: { role: "system" | "user" | "assistant"; content: string }[];
    if (input.kind === "translate") {
        const system = settings.systemPrompt
            .replaceAll("{{TARGET_LANG}}", input.target)
            .replaceAll("{{SECONDARY_LANG}}", secondary);
        messages = [
            { role: "system", content: system },
            { role: "user", content: input.text },
        ];
    } else {
        messages = [{ role: "system", content: input.system }, ...input.messages];
    }
    return JSON.stringify({
        model: settings.model,
        stream: true,
        temperature: settings.temperature,
        messages,
    });
};
```

把 `attempt` 函数签名从：
```ts
async function attempt(
    text: string, target: string, secondary: string,
    settings: Settings, signal: AbortSignal, fetchFn: FetchFn
): Promise<Response>
```

改为：
```ts
async function attempt(
    input: StreamInput, secondary: string,
    settings: Settings, signal: AbortSignal, fetchFn: FetchFn
): Promise<Response>
```

并把 `body: buildBody(text, target, secondary, settings)` 改为 `body: buildBodyFromInput(input, secondary, settings)`。

把导出的 `stream` 函数签名从：
```ts
export async function* stream(
    text: string, target: string,
    settings: Settings, signal: AbortSignal, fetchFn: FetchFn = fetch
): AsyncGenerator<string>
```

改为：
```ts
export async function* stream(
    input: StreamInput,
    settings: Settings, signal: AbortSignal, fetchFn: FetchFn = fetch
): AsyncGenerator<string>
```

并把 `response = await attempt(text, target, settings.secondaryTarget, settings, signal, fetchFn);` 改为 `response = await attempt(input, settings.secondaryTarget, settings, signal, fetchFn);`。

旧的 `buildBody` 函数删除。

- [ ] **Step 7.5: 跑测试，确认通过**

```bash
npm run test -- tests/unit/llm-client.test.ts
```

预期：全部通过。

- [ ] **Step 7.6: 提交**

```bash
git add src/background/llm-client.ts tests/unit/llm-client.test.ts
git commit -m "refactor(llm-client): StreamInput discriminated union (translate | chat)"
```

---

## Task 8：更新 translator.ts 调用新 stream 签名

**Files:**
- Modify: `src/background/translator.ts`
- Modify: `tests/unit/translator.test.ts`

- [ ] **Step 8.1: 修改 translator.ts**

打开 `src/background/translator.ts`，在文件顶部 import 行后追加 `StreamInput`：

```ts
import { stream as defaultStream, type StreamInput } from "./llm-client";
```

把 `StreamFn` 类型从：
```ts
type StreamFn = (
    text: string,
    target: string,
    settings: Settings,
    signal: AbortSignal
) => AsyncGenerator<string>;
```

改为：
```ts
type StreamFn = (
    input: StreamInput,
    settings: Settings,
    signal: AbortSignal
) => AsyncGenerator<string>;
```

把第 47 行附近的 stream 调用：
```ts
for await (const chunk of streamFn(text, target, settings, signal)) {
```

改为：
```ts
for await (const chunk of streamFn({ kind: "translate", text, target }, settings, signal)) {
```

- [ ] **Step 8.2: 修改 translator.test.ts**

打开 `tests/unit/translator.test.ts`。所有 `streamFn` mock 的签名都需要从 `(text, target, settings, signal)` 变为 `(input, settings, signal)`，并通过 `input.text` / `input.target` 取值。

例如，把：
```ts
const streamFn = async function* (text: string, target: string) { ... };
```

改为：
```ts
const streamFn = async function* (input: { kind: "translate"; text: string; target: string }) { ... };
```

并把测试中调用 `translate(text, port, signal, streamFn, ...)` 的地方保持原样（`translate` 函数本身签名没变）。

如果有断言 `streamFn` 调用参数的，更新为：
```ts
expect(streamFn).toHaveBeenCalledWith(
    { kind: "translate", text: "hi", target: "中文" },
    expect.any(Object),
    expect.any(Object)
);
```

- [ ] **Step 8.3: 跑测试**

```bash
npm run test -- tests/unit/translator.test.ts
```

预期：全部通过。

- [ ] **Step 8.4: 提交**

```bash
git add src/background/translator.ts tests/unit/translator.test.ts
git commit -m "refactor(translator): use StreamInput in stream() call"
```

---

## Task 9：service-worker.ts 与 content/index.ts —— Port name 改为 "task"

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 9.1: 修改 service-worker.ts**

打开 `src/background/service-worker.ts`：

把：
```ts
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated,
    isTranslateMsg, isRuntimeMessage,
} from "../shared/messages";
```

改为：
```ts
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated,
    isTaskMsg, isRuntimeMessage,
} from "../shared/messages";
```

把 `chrome.runtime.onConnect.addListener` 整段：

```ts
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
```

替换为：

```ts
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
        }
        // qa branch added in Task 17
    });

    port.onDisconnect.addListener(() => {
        ctrl.abort();
    });
});
```

- [ ] **Step 9.2: 修改 content/index.ts**

打开 `src/content/index.ts`：

把：
```ts
import { msgTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
```

改为：
```ts
import { msgTaskTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
```

把：
```ts
const port = chrome.runtime.connect({ name: "translate" });
```

改为：
```ts
const port = chrome.runtime.connect({ name: "task" });
```

把：
```ts
port.postMessage(msgTranslate(text));
```

改为：
```ts
port.postMessage(msgTaskTranslate(text));
```

- [ ] **Step 9.3: 跑全量测试 + typecheck + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：typecheck 通过，82+ 个测试全绿（messages 增加了用例），build 成功。

- [ ] **Step 9.4: 手测翻译流程**

加载 `dist/` 目录到 Edge：
1. `edge://extensions/` → 启用开发人员模式 → 加载已解压扩展 → 选 `dist/`
2. 任意网页选中一段英文 → 看到工具栏前的 v0.3.0 单浮标
3. 点击浮标 → 应正常弹出翻译卡片 + 流式翻译

如果翻译失败：检查 `chrome://extensions/` 错误日志（应无 `port.name` 不匹配错误）。

- [ ] **Step 9.5: 提交**

```bash
git add src/background/service-worker.ts src/content/index.ts
git commit -m "refactor: port name 'translate' → 'task' (translate path still works)"
```

**🏁 里程碑 1 (Foundation) 完成。**

---

# 里程碑 2：Toolbar

## Task 10：抽离 isInEditable 到 dom-utils.ts

**Files:**
- Create: `src/content/dom-utils.ts`
- Modify: `src/content/hover-button.ts`

> 注：本任务不删 `hover-button.ts`，只把 `isInEditable` 抽出来，让 toolbar.ts 也能用。`hover-button.ts` 在 Task 13 删除。

- [ ] **Step 10.1: 创建 dom-utils.ts**

新建 `src/content/dom-utils.ts`，内容：

```ts
export function isInEditable(node: Node | null): boolean {
    let n: Node | null = node;
    while (n) {
        if (n instanceof HTMLElement) {
            if (n.isContentEditable) return true;
            const ce = n.getAttribute("contenteditable");
            if (ce === "" || ce === "true" || ce === "plaintext-only") return true;
            const tag = n.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
        }
        n = n.parentNode;
    }
    return false;
}
```

- [ ] **Step 10.2: 让 hover-button.ts 重新导出 isInEditable**

打开 `src/content/hover-button.ts`，把开头的：

```ts
import buttonCss from "./hover-button.css?inline";

export function isInEditable(node: Node | null): boolean {
    // ...原实现...
}
```

替换为：

```ts
import buttonCss from "./hover-button.css?inline";
export { isInEditable } from "./dom-utils";
```

- [ ] **Step 10.3: typecheck + 测试**

```bash
npm run typecheck && npm run test
```

预期：全绿。`hover-button.test.ts` 中 `import { HoverButton, isInEditable }` 仍可用。

- [ ] **Step 10.4: 提交**

```bash
git add src/content/dom-utils.ts src/content/hover-button.ts
git commit -m "refactor(content): extract isInEditable to dom-utils.ts"
```

---

## Task 11：toolbar.css

**Files:**
- Create: `src/content/toolbar.css`

- [ ] **Step 11.1: 创建文件**

新建 `src/content/toolbar.css`：

```css
:host {
    all: initial;
    color-scheme: light dark;
}
.bar {
    position: fixed;
    z-index: 2147483647;
    display: inline-flex;
    align-items: stretch;
    height: 28px;
    background: linear-gradient(135deg, #4f8cff 0%, #2563eb 100%);
    border: 1.5px solid #ffffff;
    border-radius: 14px;
    box-shadow: 0 2px 10px rgba(37, 99, 235, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.05);
    overflow: hidden;
    font-family: "PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", -apple-system, sans-serif;
}
.btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 0;
    padding: 0;
    cursor: pointer;
    transition: background 0.12s;
    position: relative;
}
.btn + .btn {
    border-left: 1px solid rgba(255, 255, 255, 0.3);
}
.btn:hover {
    background: rgba(255, 255, 255, 0.18);
}
.btn:active {
    background: rgba(0, 0, 0, 0.12);
}
.char {
    font-size: 15px;
    font-weight: 700;
    color: #ffffff;
    line-height: 1;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
    pointer-events: none;
    user-select: none;
}
@media (prefers-color-scheme: dark) {
    .bar {
        background: linear-gradient(135deg, #5b94ff 0%, #2563eb 100%);
        border-color: #1a1f29;
        box-shadow: 0 2px 10px rgba(37, 99, 235, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
}
```

- [ ] **Step 11.2: 提交**

```bash
git add src/content/toolbar.css
git commit -m "feat(content): toolbar.css (horizontal bar, blue gradient)"
```

---

## Task 12：Toolbar 类 + 测试

**Files:**
- Create: `src/content/toolbar.ts`
- Create: `tests/unit/toolbar.test.ts`

- [ ] **Step 12.1: 写测试（先失败）**

新建 `tests/unit/toolbar.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Toolbar } from "../../src/content/toolbar";

beforeEach(() => {
    document.body.innerHTML = "";
});

const mkRect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left, top, right, bottom,
    x: left, y: top,
    width: right - left,
    height: bottom - top,
    toJSON() { return this; },
} as DOMRect);

const mkActions = () => [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];

describe("Toolbar.show / hide", () => {
    it("starts not shown", () => {
        const t = new Toolbar();
        expect(t.isShown()).toBe(false);
    });

    it("show appends a host with N buttons", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        expect(root.querySelectorAll(".btn").length).toBe(2);
        expect(t.isShown()).toBe(true);
    });

    it("hide removes the host", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        t.hide();
        expect(document.body.children.length).toBe(0);
        expect(t.isShown()).toBe(false);
    });

    it("repeated show does not stack hosts", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        t.show(mkRect(20, 20, 200, 40), mkActions(), () => {});
        expect(document.body.children.length).toBe(1);
    });

    it("hide when not shown is a no-op", () => {
        const t = new Toolbar();
        expect(() => t.hide()).not.toThrow();
    });
});

describe("Toolbar click", () => {
    it("clicking a button invokes onPick with id", () => {
        const t = new Toolbar();
        const cb = vi.fn();
        t.show(mkRect(10, 10, 100, 30), mkActions(), cb);
        const root = (t as any).root as ShadowRoot;
        const btns = root.querySelectorAll<HTMLButtonElement>(".btn");
        btns[1].click();
        expect(cb).toHaveBeenCalledWith("qa");
    });

    it("clicking a button hides the toolbar", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const btn = root.querySelector<HTMLButtonElement>(".btn")!;
        btn.click();
        expect(t.isShown()).toBe(false);
    });
});

describe("Toolbar position", () => {
    const winW = 1000;
    const winH = 800;
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: winW, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: winH, configurable: true });
    });

    it("default places at bottom-right edge of selection rect", () => {
        const t = new Toolbar();
        t.show(mkRect(100, 100, 200, 130), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        const expectedWidth = 28 * 2;
        expect(bar.style.left).toBe(`${200 - expectedWidth}px`);
        expect(bar.style.top).toBe(`${130 + 4}px`);
    });

    it("right-edge overflow → pull back inside viewport", () => {
        const t = new Toolbar();
        t.show(mkRect(900, 100, winW + 50, 130), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        const left = parseInt(bar.style.left, 10);
        expect(left + 28 * 2).toBeLessThanOrEqual(winW - 4);
    });

    it("bottom-edge overflow → place above selection", () => {
        const t = new Toolbar();
        t.show(mkRect(100, winH - 10, 200, winH + 20), mkActions(), () => {});
        const root = (t as any).root as ShadowRoot;
        const bar = root.querySelector<HTMLElement>(".bar")!;
        expect(parseInt(bar.style.top, 10)).toBeLessThan(winH - 10);
    });
});

describe("Toolbar.contains", () => {
    it("returns false when not shown", () => {
        const t = new Toolbar();
        expect(t.contains(document.body)).toBe(false);
    });

    it("returns true for host", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const host = document.body.firstElementChild;
        expect(t.contains(host)).toBe(true);
    });

    it("returns false for foreign nodes", () => {
        const t = new Toolbar();
        t.show(mkRect(10, 10, 100, 30), mkActions(), () => {});
        const other = document.createElement("div");
        document.body.appendChild(other);
        expect(t.contains(other)).toBe(false);
    });
});
```

- [ ] **Step 12.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/toolbar.test.ts
```

预期：模块不存在导致全部失败。

- [ ] **Step 12.3: 实现 Toolbar 类**

新建 `src/content/toolbar.ts`：

```ts
import toolbarCss from "./toolbar.css?inline";

export type ToolbarAction = { id: string; char: string; label: string };

const BTN_SIZE = 28;
const MARGIN = 4;

export class Toolbar {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;

    show(rect: DOMRect, actions: ToolbarAction[], onPick: (id: string) => void): void {
        this.hide();
        try {
            this.host = document.createElement("div");
            this.host.style.all = "initial";
            this.root = this.host.attachShadow({ mode: "closed" });

            const style = document.createElement("style");
            style.textContent = toolbarCss;
            this.root.appendChild(style);

            const bar = document.createElement("div");
            bar.className = "bar";
            for (const a of actions) {
                const btn = document.createElement("button");
                btn.className = "btn";
                btn.type = "button";
                btn.title = a.label;
                btn.dataset.id = a.id;
                const ch = document.createElement("span");
                ch.className = "char";
                ch.textContent = a.char;
                btn.appendChild(ch);
                btn.addEventListener("mousedown", (e) => e.stopPropagation());
                btn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    onPick(a.id);
                    this.hide();
                });
                bar.appendChild(btn);
            }

            const totalWidth = BTN_SIZE * actions.length;
            const { x, y } = this.computePosition(rect, totalWidth);
            bar.style.left = `${x}px`;
            bar.style.top = `${y}px`;

            this.root.appendChild(bar);
            document.body.appendChild(this.host);
        } catch {
            this.host = null;
            this.root = null;
        }
    }

    hide(): void {
        if (this.host?.parentNode) {
            this.host.parentNode.removeChild(this.host);
        }
        this.host = null;
        this.root = null;
    }

    isShown(): boolean {
        return this.host !== null;
    }

    contains(target: EventTarget | null): boolean {
        if (!this.host || !target) return false;
        if (target instanceof Node) {
            return this.host.contains(target) || this.host === target;
        }
        return false;
    }

    private computePosition(rect: DOMRect, totalWidth: number): { x: number; y: number } {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.right - totalWidth;
        let y = rect.bottom + MARGIN;
        if (x + totalWidth > vw - MARGIN) x = vw - totalWidth - MARGIN;
        if (x < MARGIN) x = MARGIN;
        if (y + BTN_SIZE > vh - MARGIN) y = rect.top - BTN_SIZE - MARGIN;
        if (y < MARGIN) y = MARGIN;
        return { x, y };
    }
}
```

- [ ] **Step 12.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/toolbar.test.ts
```

预期：13 个用例全部通过。

- [ ] **Step 12.5: 提交**

```bash
git add src/content/toolbar.ts src/content/toolbar.css tests/unit/toolbar.test.ts
git commit -m "feat(content): Toolbar component (data-driven, replaces single hover button)"
```

---

## Task 13：把 content/index.ts 切到 Toolbar，删除 HoverButton

**Files:**
- Modify: `src/content/index.ts`
- Delete: `src/content/hover-button.ts`
- Delete: `src/content/hover-button.css`
- Delete: `tests/unit/hover-button.test.ts`

- [ ] **Step 13.1: 修改 content/index.ts**

打开 `src/content/index.ts`：

把：
```ts
import { HoverButton, isInEditable } from "./hover-button";
```

改为：
```ts
import { Toolbar } from "./toolbar";
import { isInEditable } from "./dom-utils";
```

把：
```ts
const hoverButton = new HoverButton();
```

改为：
```ts
const toolbar = new Toolbar();

const TOOLBAR_ACTIONS = [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];
```

把 `maybeShowHoverButton` 函数整体替换为：

```ts
async function maybeShowToolbar(): Promise<void> {
    const text = getSelectionText();
    if (!text || text.length < 2) {
        toolbar.hide();
        return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        toolbar.hide();
        return;
    }
    if (isInEditable(sel.anchorNode)) {
        toolbar.hide();
        return;
    }
    const settings = await getPublicSettings();
    if (settings.enableHoverButton === false) {
        toolbar.hide();
        return;
    }
    const rect = getSelectionRect();
    if (!rect) {
        toolbar.hide();
        return;
    }
    const actions = TOOLBAR_ACTIONS.filter(a => a.id !== "qa" || settings.enableQA);
    toolbar.show(rect, actions, (id) => {
        if (id === "translate") {
            void handleTrigger(text);
        } else if (id === "qa") {
            // wired in Task 18
            console.log("[翻译插件] QA 入口（暂未实现）", text);
        }
    });
}
```

把所有 `hoverButton.` 替换为 `toolbar.`，把所有 `maybeShowHoverButton()` 替换为 `maybeShowToolbar()`。`handleTrigger` 函数内部 `hoverButton.hide()` 也改为 `toolbar.hide()`。

- [ ] **Step 13.2: 删除旧文件**

```bash
git rm src/content/hover-button.ts src/content/hover-button.css tests/unit/hover-button.test.ts
```

- [ ] **Step 13.3: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。`hover-button` 相关引用全部消失。

- [ ] **Step 13.4: 手测翻译流程**

加载 `dist/`，划词应看到一个**双按钮**工具栏（翻 / 问）。点 [翻] → 翻译卡片正常弹出。点 [问] → 控制台打印 log（暂未实现 UI）。

- [ ] **Step 13.5: 提交**

```bash
git add src/content/index.ts
git commit -m "feat(content): replace HoverButton with Toolbar (translate path works, QA stub)"
```

**🏁 里程碑 2 (Toolbar) 完成。**

---

# 里程碑 3：Single-turn QA

## Task 14：qa-render.ts 共享渲染纯函数

**Files:**
- Create: `src/shared/qa-render.ts`
- Create: `tests/unit/qa-render.test.ts`

- [ ] **Step 14.1: 写测试（先失败）**

新建 `tests/unit/qa-render.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble,
    setBubbleError,
} from "../../src/shared/qa-render";

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("createMessageBubble", () => {
    it("creates a user bubble with role+content", () => {
        const el = createMessageBubble("user", "hello");
        expect(el.classList.contains("msg")).toBe(true);
        expect(el.classList.contains("user")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toBe("hello");
    });

    it("creates an assistant bubble with empty content", () => {
        const el = createMessageBubble("assistant", "");
        expect(el.classList.contains("assistant")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toBe("");
    });
});

describe("appendTokenToBubble", () => {
    it("appends to .content text", () => {
        const el = createMessageBubble("assistant", "");
        appendTokenToBubble(el, "Hello ");
        appendTokenToBubble(el, "world");
        expect(el.querySelector(".content")?.textContent).toBe("Hello world");
    });
});

describe("finalizeBubble", () => {
    it("appends [复制] button and wires clipboard", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "answer");
        finalizeBubble(el, "answer");
        const btn = el.querySelector<HTMLButtonElement>(".copy")!;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toBe("复制");
        btn.click();
        expect(writeText).toHaveBeenCalledWith("answer");
    });
});

describe("setBubbleError", () => {
    it("marks bubble as error and shows message", () => {
        const el = createMessageBubble("assistant", "");
        setBubbleError(el, "API Key 无效");
        expect(el.classList.contains("error")).toBe(true);
        expect(el.querySelector(".content")?.textContent).toContain("API Key 无效");
    });
});
```

- [ ] **Step 14.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-render.test.ts
```

预期：模块不存在，全部失败。

- [ ] **Step 14.3: 实现 qa-render.ts**

新建 `src/shared/qa-render.ts`：

```ts
export function createMessageBubble(role: "user" | "assistant", content: string): HTMLElement {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    const c = document.createElement("div");
    c.className = "content";
    c.textContent = content;
    el.appendChild(c);
    return el;
}

export function appendTokenToBubble(bubble: HTMLElement, chunk: string): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (!c) return;
    c.textContent = (c.textContent ?? "") + chunk;
}

export function finalizeBubble(bubble: HTMLElement, fullContent: string): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) c.textContent = fullContent;
    if (bubble.querySelector(".copy")) return;
    const btn = document.createElement("button");
    btn.className = "copy";
    btn.type = "button";
    btn.textContent = "复制";
    btn.addEventListener("click", () => {
        navigator.clipboard.writeText(fullContent).catch(() => {/* ignore */});
    });
    bubble.appendChild(btn);
}

export function setBubbleError(bubble: HTMLElement, message: string): void {
    bubble.classList.add("error");
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) {
        const cur = c.textContent ?? "";
        c.textContent = (cur ? cur + "\n\n" : "") + `⚠ ${message}`;
    }
}
```

- [ ] **Step 14.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa-render.test.ts
```

预期：全部通过。

- [ ] **Step 14.5: 提交**

```bash
git add src/shared/qa-render.ts tests/unit/qa-render.test.ts
git commit -m "feat(shared): qa-render — bubble DOM helpers (card+sidepanel共用)"
```

---

## Task 15：qa-card.css

**Files:**
- Create: `src/content/qa-card.css`

- [ ] **Step 15.1: 创建文件**

新建 `src/content/qa-card.css`：

```css
:host {
    all: initial;
    color-scheme: light dark;
}
.card {
    position: fixed;
    z-index: 2147483647;
    width: 420px;
    max-height: 540px;
    display: flex;
    flex-direction: column;
    background: #fff;
    color: #1a1a1a;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    font-size: 14px;
    line-height: 1.55;
}
@media (prefers-color-scheme: dark) {
    .card { background: #1f1f1f; color: #e6e6e6; border-color: rgba(255, 255, 255, 0.1); }
}
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 12px;
    opacity: 0.85;
}
@media (prefers-color-scheme: dark) {
    .header { border-bottom-color: rgba(255, 255, 255, 0.08); }
}
.close {
    background: transparent; border: 0; cursor: pointer;
    color: inherit; font-size: 16px; padding: 0 4px; line-height: 1;
}
.source {
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 12px;
    color: #555;
    cursor: pointer;
}
@media (prefers-color-scheme: dark) {
    .source { border-bottom-color: rgba(255, 255, 255, 0.08); color: #9ba2ad; }
}
.source.collapsed .source-text {
    display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical;
    overflow: hidden;
}
.source-text { white-space: pre-wrap; word-break: break-word; }
.messages {
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.msg {
    max-width: 100%;
    word-wrap: break-word;
    overflow-wrap: break-word;
}
.msg.user { align-self: flex-end; }
.msg.user .content {
    background: #2563eb; color: #fff;
    padding: 8px 12px; border-radius: 12px 12px 2px 12px;
    white-space: pre-wrap;
}
.msg.assistant .content {
    background: #f3f5f8; color: #1a1a1a;
    padding: 8px 12px; border-radius: 12px 12px 12px 2px;
    white-space: pre-wrap;
}
@media (prefers-color-scheme: dark) {
    .msg.assistant .content { background: #2a2f36; color: #e6e6e6; }
}
.msg.error .content { background: #fef2f2; color: #c0392b; border: 1px solid #fecaca; }
.copy {
    margin-top: 4px; font: inherit; font-size: 11px;
    background: transparent; border: 1px solid currentColor; opacity: 0.6;
    border-radius: 4px; padding: 2px 6px; cursor: pointer; color: inherit;
}
.copy:hover { opacity: 1; }
.notice {
    font-size: 11px; opacity: 0.6; padding: 2px 12px; text-align: center;
}
.input-row {
    display: flex; gap: 6px; align-items: flex-end;
    padding: 8px 10px; border-top: 1px solid rgba(0, 0, 0, 0.06);
}
@media (prefers-color-scheme: dark) {
    .input-row { border-top-color: rgba(255, 255, 255, 0.08); }
}
textarea {
    flex: 1; resize: none; font: inherit; color: inherit;
    background: #f8f9fb; border: 1px solid #d0d4da;
    border-radius: 8px; padding: 6px 10px; min-height: 32px; max-height: 120px;
    line-height: 1.4;
}
@media (prefers-color-scheme: dark) {
    textarea { background: #2a2f36; border-color: #4a5160; }
}
textarea:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }
textarea:disabled { opacity: 0.5; cursor: not-allowed; }
.send {
    height: 32px; min-width: 36px; font: inherit;
    background: #2563eb; color: #fff; border: 0; border-radius: 8px;
    cursor: pointer; padding: 0 10px;
}
.send:hover { background: #1d4ed8; }
.send:disabled { opacity: 0.5; cursor: not-allowed; background: #94a3b8; }
.spinner {
    display: inline-block; width: 8px; height: 8px;
    border: 2px solid currentColor; border-right-color: transparent;
    border-radius: 50%; animation: spin 0.7s linear infinite;
    margin-right: 4px; vertical-align: middle;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 15.2: 提交**

```bash
git add src/content/qa-card.css
git commit -m "feat(content): qa-card.css (chat bubble + input layout)"
```

---

## Task 16：QACard 类 + 测试

**Files:**
- Create: `src/content/qa-card.ts`
- Create: `tests/unit/qa-card.test.ts`

- [ ] **Step 16.1: 写测试（先失败）**

新建 `tests/unit/qa-card.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { QACard } from "../../src/content/qa-card";

beforeEach(() => {
    document.body.innerHTML = "";
});

const mkRect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left, top, right, bottom,
    x: left, y: top,
    width: right - left,
    height: bottom - top,
    toJSON() { return this; },
} as DOMRect);

const makeCb = () => ({
    onSend: vi.fn(),
    onClose: vi.fn(),
    onOpenOptions: vi.fn(),
    onRetry: vi.fn(),
});

const innerRoot = (c: QACard): ShadowRoot => (c as any).root as ShadowRoot;

describe("QACard mount/unmount", () => {
    it("mount appends host", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "source", makeCb());
        expect(document.body.children.length).toBe(1);
    });

    it("unmount removes host", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "source", makeCb());
        c.unmount();
        expect(document.body.children.length).toBe(0);
    });

    it("renders source text in collapsed source row", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "the source", makeCb());
        const root = innerRoot(c);
        expect(root.querySelector(".source-text")?.textContent).toBe("the source");
    });

    it("textarea is initially focused and enabled", () => {
        const c = new QACard();
        c.mount(mkRect(10, 10, 100, 30), "src", makeCb());
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        expect(ta.disabled).toBe(false);
    });
});

describe("QACard input → onSend", () => {
    it("Enter triggers onSend with messages array containing user msg", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "请解释";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(cb.onSend).toHaveBeenCalledOnce();
        const msgs = cb.onSend.mock.calls[0][0];
        expect(msgs).toEqual([{ role: "user", content: "请解释" }]);
    });

    it("Shift+Enter does NOT trigger onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "请解释";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
        expect(cb.onSend).not.toHaveBeenCalled();
    });

    it("send button click triggers onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q?";
        const send = root.querySelector<HTMLButtonElement>(".send")!;
        send.click();
        expect(cb.onSend).toHaveBeenCalledOnce();
    });

    it("empty input does not call onSend", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "   ";
        const send = root.querySelector<HTMLButtonElement>(".send")!;
        send.click();
        expect(cb.onSend).not.toHaveBeenCalled();
    });

    it("subsequent send accumulates history", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;

        // 第一轮
        ta.value = "Q1";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.endAssistant("A1");

        // 第二轮
        ta.value = "Q2";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        const lastCall = cb.onSend.mock.calls[1][0];
        expect(lastCall).toEqual([
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
        ]);
    });
});

describe("QACard streaming lifecycle", () => {
    it("beginAssistant disables textarea + adds empty assistant bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        expect(ta.disabled).toBe(true);
        const bubbles = root.querySelectorAll(".msg");
        expect(bubbles.length).toBe(2); // user + assistant
        expect(bubbles[1].classList.contains("assistant")).toBe(true);
    });

    it("appendToken writes into the last assistant bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.appendToken("Hel");
        c.appendToken("lo");
        const last = root.querySelectorAll(".msg.assistant .content");
        expect(last[last.length - 1].textContent).toBe("Hello");
    });

    it("endAssistant re-enables textarea and adds copy button", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.appendToken("Answer");
        c.endAssistant("Answer");
        expect(ta.disabled).toBe(false);
        expect(ta.value).toBe("");
        const lastBubble = root.querySelectorAll(".msg.assistant");
        expect(lastBubble[lastBubble.length - 1].querySelector(".copy")).toBeTruthy();
    });

    it("failAssistant marks bubble error and re-enables textarea", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "auth", message: "bad key", retryable: false });
        expect(ta.disabled).toBe(false);
        const last = root.querySelectorAll(".msg.assistant");
        expect(last[last.length - 1].classList.contains("error")).toBe(true);
    });
});

describe("QACard close", () => {
    it("close button calls onClose and unmounts", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const close = root.querySelector<HTMLButtonElement>(".close")!;
        close.click();
        expect(cb.onClose).toHaveBeenCalledOnce();
        expect(document.body.children.length).toBe(0);
    });

    it("Escape key calls onClose", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(cb.onClose).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 16.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：模块不存在，全部失败。

- [ ] **Step 16.3: 实现 QACard**

新建 `src/content/qa-card.ts`：

```ts
import qaCardCss from "./qa-card.css?inline";
import type { ChatMessage, LLMError } from "../shared/types";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";

type QACardCallbacks = {
    onSend: (messages: ChatMessage[]) => void;
    onClose: () => void;
    onOpenOptions: () => void;
    onRetry: () => void;
};

export class QACard {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
    private cardEl: HTMLElement | null = null;
    private messagesEl: HTMLElement | null = null;
    private textareaEl: HTMLTextAreaElement | null = null;
    private sendBtn: HTMLButtonElement | null = null;
    private cb: QACardCallbacks | null = null;
    private messages: ChatMessage[] = [];
    private streaming = false;
    private currentAssistantBubble: HTMLElement | null = null;

    mount(rect: DOMRect | null, sourceText: string, callbacks: QACardCallbacks): void {
        this.unmount();
        if (!sourceText) {
            console.warn("[翻译插件] QACard.mount called with empty sourceText");
            return;
        }
        this.cb = callbacks;
        this.messages = [];

        this.host = document.createElement("div");
        this.host.style.all = "initial";
        this.root = this.host.attachShadow({ mode: "closed" });

        const style = document.createElement("style");
        style.textContent = qaCardCss;
        this.root.appendChild(style);

        const card = document.createElement("div");
        card.className = "card";
        const { x, y } = this.computePosition(rect);
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;

        // header
        const header = document.createElement("div");
        header.className = "header";
        const title = document.createElement("span");
        title.textContent = "问答";
        const close = document.createElement("button");
        close.className = "close";
        close.type = "button";
        close.textContent = "×";
        close.title = "关闭";
        close.addEventListener("click", () => {
            this.cb?.onClose();
            this.unmount();
        });
        header.appendChild(title);
        header.appendChild(close);
        card.appendChild(header);

        // source row
        const sourceRow = document.createElement("div");
        sourceRow.className = "source collapsed";
        const sourceTextEl = document.createElement("div");
        sourceTextEl.className = "source-text";
        sourceTextEl.textContent = sourceText;
        sourceRow.appendChild(sourceTextEl);
        sourceRow.addEventListener("click", () => {
            sourceRow.classList.toggle("collapsed");
        });
        card.appendChild(sourceRow);

        // messages container
        const messages = document.createElement("div");
        messages.className = "messages";
        this.messagesEl = messages;
        card.appendChild(messages);

        // input row
        const inputRow = document.createElement("div");
        inputRow.className = "input-row";
        const ta = document.createElement("textarea");
        ta.placeholder = "请输入问题…";
        ta.rows = 1;
        ta.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                this.handleSend();
            }
        });
        const send = document.createElement("button");
        send.className = "send";
        send.type = "button";
        send.textContent = "↑";
        send.title = "发送";
        send.addEventListener("click", () => this.handleSend());
        inputRow.appendChild(ta);
        inputRow.appendChild(send);
        card.appendChild(inputRow);

        this.textareaEl = ta;
        this.sendBtn = send;

        this.root.appendChild(card);
        this.cardEl = card;
        document.body.appendChild(this.host);

        document.addEventListener("keydown", this.onKey, true);
        document.addEventListener("mousedown", this.onClickOutside, true);

        ta.focus();
    }

    private handleSend(): void {
        if (this.streaming) return;
        if (!this.textareaEl) return;
        const text = this.textareaEl.value.trim();
        if (!text) return;
        const userMsg: ChatMessage = { role: "user", content: text };
        this.messages = [...this.messages, userMsg];
        if (this.messagesEl) {
            const bubble = createMessageBubble("user", text);
            this.messagesEl.appendChild(bubble);
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
        this.cb?.onSend(this.messages);
    }

    beginAssistant(): void {
        this.streaming = true;
        if (this.textareaEl) this.textareaEl.disabled = true;
        if (this.sendBtn) this.sendBtn.disabled = true;
        if (this.messagesEl) {
            const bubble = createMessageBubble("assistant", "");
            const spinner = document.createElement("span");
            spinner.className = "spinner";
            bubble.querySelector(".content")?.prepend(spinner);
            this.messagesEl.appendChild(bubble);
            this.currentAssistantBubble = bubble;
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    appendToken(chunk: string): void {
        if (!this.currentAssistantBubble) return;
        const sp = this.currentAssistantBubble.querySelector(".spinner");
        if (sp) sp.remove();
        appendTokenToBubble(this.currentAssistantBubble, chunk);
        if (this.messagesEl) {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        }
    }

    endAssistant(full: string): void {
        if (this.currentAssistantBubble) {
            const sp = this.currentAssistantBubble.querySelector(".spinner");
            if (sp) sp.remove();
            finalizeBubble(this.currentAssistantBubble, full);
        }
        this.messages = [...this.messages, { role: "assistant", content: full }];
        this.currentAssistantBubble = null;
        this.streaming = false;
        if (this.textareaEl) {
            this.textareaEl.disabled = false;
            this.textareaEl.value = "";
            this.textareaEl.focus();
        }
        if (this.sendBtn) this.sendBtn.disabled = false;
    }

    failAssistant(err: LLMError, partial?: string): void {
        if (this.currentAssistantBubble) {
            const sp = this.currentAssistantBubble.querySelector(".spinner");
            if (sp) sp.remove();
            const c = this.currentAssistantBubble.querySelector<HTMLElement>(".content");
            if (c && partial) c.textContent = partial;
            setBubbleError(this.currentAssistantBubble, err.message);
        }
        // failed turn: don't add assistant to messages
        this.currentAssistantBubble = null;
        this.streaming = false;
        if (this.textareaEl) this.textareaEl.disabled = false;
        if (this.sendBtn) this.sendBtn.disabled = false;
    }

    getMessages(): ChatMessage[] {
        return [...this.messages];
    }

    isMounted(): boolean {
        return this.host !== null;
    }

    unmount(): void {
        document.removeEventListener("keydown", this.onKey, true);
        document.removeEventListener("mousedown", this.onClickOutside, true);
        if (this.host?.parentNode) this.host.parentNode.removeChild(this.host);
        this.host = null;
        this.root = null;
        this.cardEl = null;
        this.messagesEl = null;
        this.textareaEl = null;
        this.sendBtn = null;
        this.cb = null;
        this.messages = [];
        this.streaming = false;
        this.currentAssistantBubble = null;
    }

    private computePosition(rect: DOMRect | null): { x: number; y: number } {
        const margin = 8;
        const cardW = 420;
        const cardH = 540;
        if (!rect) return { x: margin, y: margin };
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.left;
        let y = rect.bottom + margin;
        if (x + cardW > vw - margin) x = vw - cardW - margin;
        if (y + cardH > vh - margin) y = Math.max(margin, rect.top - cardH - margin);
        return { x: Math.max(margin, x), y: Math.max(margin, y) };
    }

    private onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape" && this.host) {
            this.cb?.onClose();
            this.unmount();
        }
    };

    private onClickOutside = (e: MouseEvent): void => {
        if (!this.host) return;
        const path = e.composedPath();
        if (!path.includes(this.host)) {
            this.cb?.onClose();
            this.unmount();
        }
    };
}
```

- [ ] **Step 16.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：全部通过。

- [ ] **Step 16.5: 提交**

```bash
git add src/content/qa-card.ts tests/unit/qa-card.test.ts
git commit -m "feat(content): QACard component (multi-turn dialog with sourceText)"
```

---

## Task 17：qa.ts 后端任务执行器

**Files:**
- Create: `src/background/qa.ts`
- Create: `tests/unit/qa.test.ts`
- Modify: `src/background/service-worker.ts`

- [ ] **Step 17.1: 写 qa.test.ts（先失败）**

新建 `tests/unit/qa.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { answerQA } from "../../src/background/qa";
import { setSettings, getQASessions, upsertQASession } from "../../src/shared/storage";
import type { ChatMessage } from "../../src/shared/types";

const makePort = () => ({
    posted: [] as unknown[],
    postMessage(msg: unknown) { this.posted.push(msg); },
});

const mkStreamFn = (chunks: string[]) =>
    vi.fn(async function* () {
        for (const c of chunks) yield c;
    });

beforeEach(async () => {
    await setSettings({
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "k",
        model: "deepseek-chat",
        qaSystemPrompt: "PROMPT",
        qaMaxTurns: 6,
    });
});

describe("answerQA basic flow", () => {
    it("posts tokens then done", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A", "B", "C"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid", "src", msgs, port, ctrl.signal, undefined, streamFn);

        expect(port.posted).toEqual([
            { type: "token", chunk: "A" },
            { type: "token", chunk: "B" },
            { type: "token", chunk: "C" },
            { type: "done", full: "ABC" },
        ]);
    });

    it("calls streamFn with chat input containing system + sourceText + messages", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q1" }];
        await answerQA("sid", "the-source", msgs, port, ctrl.signal, undefined, streamFn);

        const callArg = (streamFn.mock.calls[0] as any)[0];
        expect(callArg.kind).toBe("chat");
        expect(callArg.system).toContain("PROMPT");
        expect(callArg.system).toContain("the-source");
        expect(callArg.messages).toEqual([{ role: "user", content: "Q1" }]);
    });
});

describe("answerQA truncation", () => {
    it("truncates messages array to qaMaxTurns*2", async () => {
        await setSettings({ qaMaxTurns: 2 });
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();

        const msgs: ChatMessage[] = [];
        for (let i = 0; i < 5; i++) {
            msgs.push({ role: "user", content: `Q${i}` });
            msgs.push({ role: "assistant", content: `A${i}` });
        }
        msgs.push({ role: "user", content: "QNew" });

        await answerQA("sid", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const callArg = (streamFn.mock.calls[0] as any)[0];
        expect(callArg.messages.length).toBe(2 * 2); // 4 last items, no need + new since msgs already includes it
    });
});

describe("answerQA persistence", () => {
    it("upserts session on done", async () => {
        const port = makePort();
        const streamFn = mkStreamFn(["A"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-1", "src", msgs, port, ctrl.signal, "https://x.example", streamFn);
        const sessions = await getQASessions();
        expect(sessions).toHaveLength(1);
        expect(sessions[0].id).toBe("sid-1");
        expect(sessions[0].sourceText).toBe("src");
        expect(sessions[0].pageOrigin).toBe("https://x.example");
        expect(sessions[0].messages).toEqual([
            { role: "user", content: "Q" },
            { role: "assistant", content: "A" },
        ]);
    });

    it("preserves prior messages when追问", async () => {
        await upsertQASession({
            id: "sid-2", sourceText: "src",
            model: "deepseek-chat",
            createdAt: 100, updatedAt: 100,
            messages: [
                { role: "user", content: "Q1" },
                { role: "assistant", content: "A1" },
            ],
        });
        const port = makePort();
        const streamFn = mkStreamFn(["A2"]);
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
        ];
        await answerQA("sid-2", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const sessions = await getQASessions();
        expect(sessions[0].messages).toEqual([
            { role: "user", content: "Q1" },
            { role: "assistant", content: "A1" },
            { role: "user", content: "Q2" },
            { role: "assistant", content: "A2" },
        ]);
    });
});

describe("answerQA error handling", () => {
    it("posts error msg and does NOT upsert on failure", async () => {
        const port = makePort();
        const streamFn = vi.fn(async function* () {
            throw { code: "auth", message: "bad", retryable: false };
            // eslint-disable-next-line no-unreachable
            yield "x";
        });
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-3", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const errMsg = port.posted.find((m: any) => m.type === "error");
        expect(errMsg).toBeTruthy();
        const sessions = await getQASessions();
        expect(sessions.find(s => s.id === "sid-3")).toBeUndefined();
    });

    it("does NOT post error when aborted", async () => {
        const port = makePort();
        const streamFn = vi.fn(async function* () {
            throw { code: "aborted", message: "已取消", retryable: false };
            // eslint-disable-next-line no-unreachable
            yield "x";
        });
        const ctrl = new AbortController();
        const msgs: ChatMessage[] = [{ role: "user", content: "Q" }];
        await answerQA("sid-4", "src", msgs, port, ctrl.signal, undefined, streamFn);
        const errMsg = port.posted.find((m: any) => m.type === "error");
        expect(errMsg).toBeUndefined();
    });
});
```

- [ ] **Step 17.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa.test.ts
```

预期：模块不存在，全部失败。

- [ ] **Step 17.3: 实现 qa.ts**

新建 `src/background/qa.ts`：

```ts
import type { ChatMessage, LLMError, QASession, Settings } from "../shared/types";
import { msgDone, msgError, msgToken } from "../shared/messages";
import { getSettings, getQASessions, upsertQASession } from "../shared/storage";
import { stream as defaultStream, type StreamInput } from "./llm-client";

type Port = { postMessage(msg: unknown): void };
type StreamFn = (input: StreamInput, settings: Settings, signal: AbortSignal) => AsyncGenerator<string>;

function buildSystem(qaSystemPrompt: string, sourceText: string): string {
    return `${qaSystemPrompt}\n\n---\nSelected text:\n${sourceText}`;
}

function truncateMessages(messages: ChatMessage[], maxTurns: number): ChatMessage[] {
    const cap = maxTurns * 2;
    return messages.length <= cap ? messages : messages.slice(-cap);
}

export async function answerQA(
    sessionId: string,
    sourceText: string,
    messages: ChatMessage[],
    port: Port,
    signal: AbortSignal,
    pageOrigin?: string,
    streamFn: StreamFn = defaultStream as StreamFn
): Promise<void> {
    const settings = await getSettings();
    const truncated = truncateMessages(messages, settings.qaMaxTurns);
    const system = buildSystem(settings.qaSystemPrompt, sourceText);

    let full = "";
    try {
        for await (const chunk of streamFn(
            { kind: "chat", system, messages: truncated },
            settings,
            signal
        )) {
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

    const now = Date.now();
    const newMessages: ChatMessage[] = [...messages, { role: "assistant", content: full }];
    const session: QASession = {
        id: sessionId,
        sourceText,
        pageOrigin,
        model: settings.model,
        createdAt: now,  // upsert preserves existing on update — see fix below
        updatedAt: now,
        messages: newMessages,
    };
    // Preserve original createdAt if the session already exists
    const all = await getQASessions();
    const existing = all.find(s => s.id === sessionId);
    if (existing) session.createdAt = existing.createdAt;

    await upsertQASession(session);
}
```

- [ ] **Step 17.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa.test.ts
```

预期：全部通过。

- [ ] **Step 17.5: 在 service-worker.ts 注册 QA 路由**

打开 `src/background/service-worker.ts`：

把顶部 import：
```ts
import { translate } from "./translator";
```

改为：
```ts
import { translate } from "./translator";
import { answerQA } from "./qa";
import { rtQASessionUpdated } from "../shared/messages";
```

把 `port.onMessage.addListener` 中的 task 路由：

```ts
port.onMessage.addListener(async (msg) => {
    if (!isTaskMsg(msg)) return;
    const p = msg.payload;
    if (p.task === "translate") {
        await translate(p.text, port, ctrl.signal, undefined, pageOrigin);
        chrome.runtime.sendMessage(rtHistoryUpdated()).catch(() => {/* no listener ok */});
    }
    // qa branch added in Task 17
});
```

替换为：

```ts
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
```

- [ ] **Step 17.6: 全量测试 + typecheck + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 17.7: 提交**

```bash
git add src/background/qa.ts src/background/service-worker.ts tests/unit/qa.test.ts
git commit -m "feat(qa): backend executor — answerQA with truncation + persistence"
```

---

## Task 18：编排 QA 入口（content/index.ts）

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 18.1: 在 content/index.ts 接入 QACard**

打开 `src/content/index.ts`：

把 import 段补充：
```ts
import { QACard } from "./qa-card";
import { msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg, msgTaskTranslate, rtOpenOptions } from "../shared/messages";
import type { ChatMessage, LLMError, QASession, RuntimeMessage } from "../shared/types";
```

（确保 `msgTaskQA` 已 import，`ChatMessage` 和 `QASession` 已 import）

在文件顶部既有的 `const card = new FloatingCard();` 后追加：
```ts
const qaCard = new QACard();
let qaSession: QASession | null = null;
let qaPort: chrome.runtime.Port | null = null;
let qaPartial = "";

const uuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

function disconnectQA(): void {
    if (qaPort) {
        try { qaPort.disconnect(); } catch {/* ignore */}
        qaPort = null;
    }
}

function sendQAMessages(messages: ChatMessage[]): void {
    if (!qaSession) return;
    qaPartial = "";
    disconnectQA();
    qaCard.beginAssistant();
    const port = chrome.runtime.connect({ name: "task" });
    qaPort = port;
    port.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            qaPartial += msg.chunk;
            qaCard.appendToken(msg.chunk);
        } else if (isDoneMsg(msg)) {
            qaCard.endAssistant(msg.full);
        } else if (isErrorMsg(msg)) {
            qaCard.failAssistant(msg.error as LLMError, qaPartial);
        }
    });
    port.onDisconnect.addListener(() => { qaPort = null; });
    port.postMessage(msgTaskQA(qaSession.id, qaSession.sourceText, messages));
}

async function openQACard(text: string): Promise<void> {
    if (!text) return;
    toolbar.hide();
    const rect = getSelectionRect();
    qaSession = {
        id: uuid(),
        sourceText: text,
        model: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
    };
    qaCard.mount(rect, text, {
        onSend: (messages: ChatMessage[]) => sendQAMessages(messages),
        onClose: () => {
            disconnectQA();
            qaSession = null;
        },
        onOpenOptions: () => {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
        },
        onRetry: () => {
            if (!qaSession) return;
            sendQAMessages(qaCard.getMessages());
        },
    });
}
```

把 toolbar.show 回调中的 QA 分支：
```ts
} else if (id === "qa") {
    // wired in Task 18
    console.log("[翻译插件] QA 入口（暂未实现）", text);
}
```

替换为：
```ts
} else if (id === "qa") {
    void openQACard(text);
}
```

- [ ] **Step 18.2: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 18.3: 手测单轮问答**

加载 `dist/`。在网页选中一段英文 → 工具栏出现 → 点 [问] → QACard 出现，原文在折叠条里 → 输入「请详细解释」按 Enter → 流式回答。

如果失败：
- 看 SW 日志（`edge://extensions/` → 翻译插件 → service worker）
- 看 content script 日志（页面控制台）
- 检查 API Key 是否填写

- [ ] **Step 18.4: 提交**

```bash
git add src/content/index.ts
git commit -m "feat(content): wire QA flow — toolbar [问] → QACard → port → stream"
```

**🏁 里程碑 3 (Single-turn QA) 完成。**

---

## Task 19：FloatingCard title 参数化

**Files:**
- Modify: `src/content/floating-card.ts`

- [ ] **Step 19.1: 修改 FloatingCard.mount 签名**

打开 `src/content/floating-card.ts`：

把 `mount` 方法签名：
```ts
mount(rect: DOMRect | null, callbacks: CardCallbacks = {}, sourceText = ""): void {
```

改为：
```ts
mount(rect: DOMRect | null, callbacks: CardCallbacks = {}, sourceText = "", title = "翻译"): void {
```

把：
```ts
header.innerHTML = '<span>翻译插件</span><span class="status"></span>';
```

改为：
```ts
header.innerHTML = `<span>${title}</span><span class="status"></span>`;
```

> 注：`title` 是从代码内部传入的常量，不是用户输入，innerHTML 注入不会引入 XSS。如未来要支持用户输入的标题，需切换为 textContent。

- [ ] **Step 19.2: typecheck + 测试**

```bash
npm run typecheck && npm run test
```

预期：全绿（默认值「翻译」与原硬编码一致，行为不变）。

- [ ] **Step 19.3: 提交**

```bash
git add src/content/floating-card.ts
git commit -m "refactor(floating-card): title is now a parameter (default 翻译)"
```

---

# 里程碑 4：Multi-turn 完善 + 错误处理

## Task 20：QACard 上限提示 + abort 回滚

**Files:**
- Modify: `src/content/qa-card.ts`
- Modify: `tests/unit/qa-card.test.ts`

- [ ] **Step 20.1: 写测试（上限提示）**

在 `tests/unit/qa-card.test.ts` 末尾追加：

```ts
describe("QACard turn cap notice", () => {
    it("shows notice when message count >= maxTurns*2", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        // 模拟已经积累 6 轮（12 条）
        for (let i = 0; i < 6; i++) {
            c.setMessages([
                ...c.getMessages(),
                { role: "user", content: `Q${i}` },
                { role: "assistant", content: `A${i}` },
            ]);
        }
        c.showTurnCapNotice(6);
        const root = innerRoot(c);
        const notice = root.querySelector(".notice");
        expect(notice?.textContent).toContain("6");
    });
});

describe("QACard abort rollback", () => {
    it("rollbackUserTurn removes last user msg from messages and bubble", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();

        c.rollbackUserTurn();
        expect(c.getMessages()).toEqual([]);
        const userBubbles = root.querySelectorAll(".msg.user");
        expect(userBubbles.length).toBe(0);
        expect(ta.disabled).toBe(false);
    });
});
```

- [ ] **Step 20.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：新用例失败（`setMessages` / `showTurnCapNotice` / `rollbackUserTurn` 未实现）。

- [ ] **Step 20.3: 在 QACard 中实现新方法**

打开 `src/content/qa-card.ts`，在 `getMessages()` 之后追加：

```ts
setMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
    if (!this.messagesEl) return;
    this.messagesEl.innerHTML = "";
    for (const m of messages) {
        const bubble = createMessageBubble(m.role, m.content);
        if (m.role === "assistant") finalizeBubble(bubble, m.content);
        this.messagesEl.appendChild(bubble);
    }
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
}

showTurnCapNotice(maxTurns: number): void {
    if (!this.cardEl) return;
    let notice = this.cardEl.querySelector<HTMLElement>(".notice");
    if (!notice) {
        notice = document.createElement("div");
        notice.className = "notice";
        const inputRow = this.cardEl.querySelector(".input-row");
        if (inputRow) this.cardEl.insertBefore(notice, inputRow);
        else this.cardEl.appendChild(notice);
    }
    notice.textContent = `为控制费用，仅保留最近 ${maxTurns} 轮对话作为上下文`;
}

rollbackUserTurn(): void {
    if (this.messages.length === 0) return;
    const last = this.messages[this.messages.length - 1];
    if (last.role !== "user") return;
    this.messages = this.messages.slice(0, -1);
    if (this.currentAssistantBubble?.parentElement) {
        this.currentAssistantBubble.parentElement.removeChild(this.currentAssistantBubble);
    }
    this.currentAssistantBubble = null;
    if (this.messagesEl) {
        const userBubbles = this.messagesEl.querySelectorAll(".msg.user");
        const lastUser = userBubbles[userBubbles.length - 1];
        if (lastUser?.parentElement) lastUser.parentElement.removeChild(lastUser);
    }
    if (this.textareaEl) {
        this.textareaEl.disabled = false;
        this.textareaEl.value = last.content;
        this.textareaEl.focus();
    }
    if (this.sendBtn) this.sendBtn.disabled = false;
    this.streaming = false;
}
```

- [ ] **Step 20.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：全部通过。

- [ ] **Step 20.5: 在 content/index.ts 上限提示触发**

打开 `src/content/index.ts`，在 `sendQAMessages` 函数顶部、`disconnectQA()` 之前追加：

```ts
void getPublicSettings().then((s) => {
    if (messages.length >= s.qaMaxTurns * 2) {
        qaCard.showTurnCapNotice(s.qaMaxTurns);
    }
});
```

- [ ] **Step 20.6: 在 onClose 时调用 rollback（如果在流式中）**

打开 `src/content/index.ts`，把 `qaCard.mount` 的 onClose 回调：
```ts
onClose: () => {
    disconnectQA();
    qaSession = null;
},
```

保持不变。但增加一个**新的** abort 路径：在 close 之前如果 streaming，先 rollback。修改为：

```ts
onClose: () => {
    if (qaPort) {
        // streaming in progress → rollback the in-flight user turn
        qaCard.rollbackUserTurn();
    }
    disconnectQA();
    qaSession = null;
},
```

- [ ] **Step 20.7: 全量验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 20.8: 提交**

```bash
git add src/content/qa-card.ts src/content/index.ts tests/unit/qa-card.test.ts
git commit -m "feat(qa-card): turn cap notice + abort rollback for in-flight turn"
```

---

## Task 21：Q&A 错误状态处理（auth → 打开设置；retry）

**Files:**
- Modify: `src/content/qa-card.ts`
- Modify: `tests/unit/qa-card.test.ts`

- [ ] **Step 21.1: 写测试**

在 `tests/unit/qa-card.test.ts` 的 `describe("QACard streaming lifecycle")` 之后追加：

```ts
describe("QACard error actions", () => {
    it("auth error shows '打开设置' button → onOpenOptions", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "auth", message: "API Key 无效", retryable: false });
        const openBtn = root.querySelector<HTMLButtonElement>(".action-options");
        expect(openBtn).toBeTruthy();
        openBtn!.click();
        expect(cb.onOpenOptions).toHaveBeenCalledOnce();
    });

    it("retryable error shows '重试' button → onRetry", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "src", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.failAssistant({ code: "network", message: "网络异常", retryable: true });
        const retryBtn = root.querySelector<HTMLButtonElement>(".action-retry");
        expect(retryBtn).toBeTruthy();
        retryBtn!.click();
        expect(cb.onRetry).toHaveBeenCalledOnce();
    });
});
```

- [ ] **Step 21.2: 跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：新两个用例失败。

- [ ] **Step 21.3: 在 failAssistant 中加入按钮**

打开 `src/content/qa-card.ts`，把 `failAssistant` 整体替换为：

```ts
failAssistant(err: LLMError, partial?: string): void {
    if (this.currentAssistantBubble) {
        const sp = this.currentAssistantBubble.querySelector(".spinner");
        if (sp) sp.remove();
        const c = this.currentAssistantBubble.querySelector<HTMLElement>(".content");
        if (c && partial) c.textContent = partial;
        setBubbleError(this.currentAssistantBubble, err.message);

        const actions = document.createElement("div");
        actions.className = "actions";
        if (err.code === "auth") {
            const btn = document.createElement("button");
            btn.className = "copy action-options";
            btn.type = "button";
            btn.textContent = "打开设置";
            btn.addEventListener("click", () => this.cb?.onOpenOptions());
            actions.appendChild(btn);
        }
        if (err.retryable || err.code === "bad_response" || err.code === "unknown") {
            const btn = document.createElement("button");
            btn.className = "copy action-retry";
            btn.type = "button";
            btn.textContent = "重试";
            btn.addEventListener("click", () => this.cb?.onRetry());
            actions.appendChild(btn);
        }
        if (partial && partial.length > 0) {
            const btn = document.createElement("button");
            btn.className = "copy action-copy-partial";
            btn.type = "button";
            btn.textContent = "复制部分";
            btn.addEventListener("click", () => {
                navigator.clipboard.writeText(partial).catch(() => {/* ignore */});
            });
            actions.appendChild(btn);
        }
        this.currentAssistantBubble.appendChild(actions);
    }
    this.currentAssistantBubble = null;
    this.streaming = false;
    if (this.textareaEl) this.textareaEl.disabled = false;
    if (this.sendBtn) this.sendBtn.disabled = false;
}
```

- [ ] **Step 21.4: 跑测试，确认通过**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：全部通过。

- [ ] **Step 21.5: 提交**

```bash
git add src/content/qa-card.ts tests/unit/qa-card.test.ts
git commit -m "feat(qa-card): error actions — 打开设置 / 重试 / 复制部分"
```

---

## Task 22：里程碑 4 集成回归

- [ ] **Step 22.1: 全量验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 22.2: 手测多轮 + 错误**

加载 `dist/`：
1. 选中一段英文 → [问] → 输入 Q1，看到 A1 → 输入 Q2，看到 A2（含 Q1 上下文）
2. 临时把 API Key 改错 → 重新选中 → [问] → 输入 Q → 看到「打开设置」按钮 → 点击后弹出 options 页
3. 在流式中按 Esc → 卡片关闭 → 重新打开 [问] → 应是空 session（不是续上轮）

**🏁 里程碑 4 (Multi-turn 完善) 完成。**

---

# 里程碑 5：Sidepanel Tab + QA 列表 + Session 详情

## Task 23：sidepanel.html Tab 结构 + QA 模板

**Files:**
- Modify: `src/sidepanel/index.html`

- [ ] **Step 23.1: 替换 sidepanel/index.html**

把 `src/sidepanel/index.html` 整个文件替换为：

```html
<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width" />
    <title>翻译插件 - 历史</title>
    <link rel="stylesheet" href="./sidepanel.css" />
</head>
<body>
    <header>
        <div class="tabs">
            <button class="tab active" data-tab="translate">翻译</button>
            <button class="tab" data-tab="qa">问答</button>
        </div>
        <div class="tools">
            <button id="back" class="back" hidden>← 返回</button>
            <button id="clear">清空</button>
        </div>
    </header>

    <main>
        <section id="list-translate" class="view active"></section>
        <section id="list-qa" class="view"></section>
        <section id="detail-qa" class="view detail"></section>
    </main>

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
                <button class="copy-src">复制原文</button>
                <button class="copy-dst">复制译文</button>
            </div>
        </article>
    </template>

    <template id="qa-item-tpl">
        <article class="item qa-item">
            <div class="meta">
                <span class="time"></span>
                <span class="model"></span>
                <span class="turns"></span>
                <button class="del" title="删除">×</button>
            </div>
            <div class="src"></div>
            <div class="first-q"></div>
        </article>
    </template>

    <template id="qa-detail-tpl">
        <div class="qa-detail">
            <div class="source-row">
                <div class="label">原文</div>
                <div class="source-text"></div>
            </div>
            <div class="messages"></div>
            <div class="input-row">
                <textarea class="input" placeholder="继续追问…" rows="2"></textarea>
                <button class="send">↑</button>
            </div>
        </div>
    </template>

    <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 23.2: 提交**

```bash
git add src/sidepanel/index.html
git commit -m "feat(sidepanel): tab structure (翻译/问答) + QA item & detail templates"
```

---

## Task 24：sidepanel.css 增加 Tab + QA 样式

**Files:**
- Modify: `src/sidepanel/sidepanel.css`

- [ ] **Step 24.1: 在 sidepanel.css 末尾追加**

打开 `src/sidepanel/sidepanel.css`，在文件末尾追加：

```css
.tabs {
    display: flex;
    gap: 6px;
}
.tab {
    border: 1px solid currentColor;
    border-radius: 14px;
    padding: 2px 12px;
    font-size: 12px;
    opacity: 0.6;
}
.tab.active {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
    opacity: 1;
}
.tools {
    display: flex;
    gap: 6px;
    align-items: center;
}
.view { display: none; }
.view.active { display: block; }

.qa-item .first-q {
    font-size: 12px;
    margin-top: 4px;
    opacity: 0.85;
}
.qa-item .turns {
    font-size: 11px;
    opacity: 0.6;
    background: rgba(0,0,0,0.06);
    padding: 1px 6px;
    border-radius: 8px;
}
@media (prefers-color-scheme: dark) {
    .qa-item .turns { background: rgba(255,255,255,0.1); }
}

.qa-detail {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 50px);
}
.source-row {
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    padding: 8px 12px;
    margin-bottom: 10px;
    max-height: 100px;
    overflow-y: auto;
    flex-shrink: 0;
}
.source-row .label {
    font-size: 11px;
    opacity: 0.6;
    margin-bottom: 4px;
}
.source-row .source-text {
    white-space: pre-wrap;
    font-size: 13px;
}
.qa-detail .messages {
    flex: 1;
    overflow-y: auto;
    padding: 0 0 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}
.qa-detail .msg { max-width: 100%; word-wrap: break-word; }
.qa-detail .msg.user { align-self: flex-end; }
.qa-detail .msg.user .content {
    background: #2563eb; color: #fff;
    padding: 8px 12px; border-radius: 12px 12px 2px 12px;
    white-space: pre-wrap;
}
.qa-detail .msg.assistant .content {
    background: #f3f5f8;
    padding: 8px 12px; border-radius: 12px 12px 12px 2px;
    white-space: pre-wrap;
}
@media (prefers-color-scheme: dark) {
    .qa-detail .msg.assistant .content { background: #2a2f36; }
}
.qa-detail .msg.error .content { background: #fef2f2; color: #c0392b; border: 1px solid #fecaca; }
.qa-detail .msg .copy {
    margin-top: 4px; font-size: 11px;
    background: transparent; border: 1px solid currentColor; opacity: 0.6;
    border-radius: 4px; padding: 2px 6px; cursor: pointer; color: inherit;
}
.qa-detail .msg .copy:hover { opacity: 1; }
.qa-detail .input-row {
    display: flex; gap: 6px; align-items: flex-end;
    padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.1);
    flex-shrink: 0;
}
.qa-detail .input-row textarea {
    flex: 1; resize: none; font: inherit; color: inherit;
    background: #fff; border: 1px solid #d0d4da;
    border-radius: 8px; padding: 6px 10px;
    line-height: 1.4;
}
@media (prefers-color-scheme: dark) {
    .qa-detail .input-row textarea { background: #2a2f36; border-color: #4a5160; color: #e6e6e6; }
}
.qa-detail .input-row .send {
    height: 32px; min-width: 36px;
    background: #2563eb; color: #fff; border: 0; border-radius: 8px;
    cursor: pointer; padding: 0 10px;
}
.qa-detail .input-row .send:disabled { opacity: 0.5; cursor: not-allowed; background: #94a3b8; }
.back {
    font-size: 12px;
    padding: 2px 10px;
}
```

- [ ] **Step 24.2: 提交**

```bash
git add src/sidepanel/sidepanel.css
git commit -m "feat(sidepanel): styles for Tab + QA item + Session detail view"
```

---

## Task 25：sidepanel/index.ts —— Tab 切换 + QA 列表 + Session 详情

**Files:**
- Modify: `src/sidepanel/index.ts`

- [ ] **Step 25.1: 替换 sidepanel/index.ts**

把 `src/sidepanel/index.ts` 整个文件替换为：

```ts
import {
    clearHistory, deleteHistoryItem, getHistory,
    clearQASessions, deleteQASession, getQASessions, upsertQASession,
} from "../shared/storage";
import {
    msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg,
} from "../shared/messages";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";
import type { ChatMessage, HistoryItem, LLMError, QASession } from "../shared/types";

// ===== view state =====
type View = "translate" | "qa" | "detail-qa";
let currentView: View = "translate";
let currentDetailSessionId: string | null = null;

// ===== DOM refs =====
const translateListEl = document.getElementById("list-translate") as HTMLElement;
const qaListEl = document.getElementById("list-qa") as HTMLElement;
const qaDetailEl = document.getElementById("detail-qa") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const backBtn = document.getElementById("back") as HTMLButtonElement;
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab");
const itemTpl = document.getElementById("item-tpl") as HTMLTemplateElement;
const qaItemTpl = document.getElementById("qa-item-tpl") as HTMLTemplateElement;
const qaDetailTpl = document.getElementById("qa-detail-tpl") as HTMLTemplateElement;

const fmtTime = (ts: number): string => new Date(ts).toLocaleString();

// ===== view switching =====
function setView(v: View): void {
    currentView = v;
    translateListEl.classList.toggle("active", v === "translate");
    qaListEl.classList.toggle("active", v === "qa");
    qaDetailEl.classList.toggle("active", v === "detail-qa");
    backBtn.hidden = v !== "detail-qa";
    clearBtn.hidden = v === "detail-qa";
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === v));
}

tabBtns.forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab as "translate" | "qa";
    setView(t);
    void refresh();
}));

backBtn.addEventListener("click", () => {
    currentDetailSessionId = null;
    setView("qa");
    void refresh();
});

clearBtn.addEventListener("click", async () => {
    if (currentView === "translate") {
        if (!confirm("确认清空全部翻译历史？")) return;
        await clearHistory();
    } else if (currentView === "qa") {
        if (!confirm("确认清空全部问答会话？")) return;
        await clearQASessions();
    }
    await refresh();
});

// ===== translate list =====
function renderTranslateList(items: HistoryItem[]): void {
    translateListEl.innerHTML = "";
    if (items.length === 0) {
        translateListEl.innerHTML = '<div class="empty">暂无翻译历史</div>';
        return;
    }
    for (const item of items) {
        const node = itemTpl.content.cloneNode(true) as DocumentFragment;
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
        (node.querySelector(".copy-src") as HTMLElement).addEventListener("click", () => {
            navigator.clipboard.writeText(item.sourceText).catch(() => {/* ignore */});
        });
        (node.querySelector(".copy-dst") as HTMLElement).addEventListener("click", () => {
            navigator.clipboard.writeText(item.translatedText).catch(() => {/* ignore */});
        });
        translateListEl.appendChild(node);
    }
}

// ===== qa list =====
function renderQAList(sessions: QASession[]): void {
    qaListEl.innerHTML = "";
    if (sessions.length === 0) {
        qaListEl.innerHTML = '<div class="empty">暂无问答会话</div>';
        return;
    }
    for (const s of sessions) {
        const node = qaItemTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = s.id;
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(s.updatedAt);
        (node.querySelector(".model") as HTMLElement).textContent = s.model || "";
        const turns = Math.floor(s.messages.length / 2) + (s.messages.length % 2);
        (node.querySelector(".turns") as HTMLElement).textContent = `${turns} 轮`;
        (node.querySelector(".src") as HTMLElement).textContent = s.sourceText.slice(0, 120);
        const firstQ = s.messages.find(m => m.role === "user");
        (node.querySelector(".first-q") as HTMLElement).textContent = firstQ ? `问：${firstQ.content}` : "";
        article.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).classList.contains("del")) return;
            currentDetailSessionId = s.id;
            setView("detail-qa");
            void renderDetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteQASession(s.id);
            await refresh();
        });
        qaListEl.appendChild(node);
    }
}

// ===== qa detail (continue chat) =====
let detailSession: QASession | null = null;
let detailMessagesEl: HTMLElement | null = null;
let detailTextarea: HTMLTextAreaElement | null = null;
let detailSendBtn: HTMLButtonElement | null = null;
let detailPort: chrome.runtime.Port | null = null;
let detailPartial = "";
let detailCurrentBubble: HTMLElement | null = null;

async function renderDetail(): Promise<void> {
    qaDetailEl.innerHTML = "";
    if (!currentDetailSessionId) return;
    const sessions = await getQASessions();
    const s = sessions.find(x => x.id === currentDetailSessionId);
    if (!s) {
        qaDetailEl.innerHTML = '<div class="empty">会话不存在</div>';
        return;
    }
    detailSession = s;

    const node = qaDetailTpl.content.cloneNode(true) as DocumentFragment;
    (node.querySelector(".source-text") as HTMLElement).textContent = s.sourceText;
    detailMessagesEl = node.querySelector(".messages") as HTMLElement;
    for (const m of s.messages) {
        const bubble = createMessageBubble(m.role, m.content);
        if (m.role === "assistant") finalizeBubble(bubble, m.content);
        detailMessagesEl.appendChild(bubble);
    }
    detailTextarea = node.querySelector(".input") as HTMLTextAreaElement;
    detailSendBtn = node.querySelector(".send") as HTMLButtonElement;
    detailTextarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            void detailSend();
        }
    });
    detailSendBtn.addEventListener("click", () => void detailSend());

    qaDetailEl.appendChild(node);
    if (detailMessagesEl) detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;
}

async function detailSend(): Promise<void> {
    if (!detailSession || !detailTextarea || !detailMessagesEl || !detailSendBtn) return;
    const text = detailTextarea.value.trim();
    if (!text) return;
    if (detailPort) return; // already streaming

    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...detailSession.messages, userMsg];
    detailSession = { ...detailSession, messages: newMessages, updatedAt: Date.now() };
    detailMessagesEl.appendChild(createMessageBubble("user", text));
    detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;

    detailCurrentBubble = createMessageBubble("assistant", "");
    detailMessagesEl.appendChild(detailCurrentBubble);
    detailTextarea.disabled = true;
    detailSendBtn.disabled = true;
    detailTextarea.value = "";
    detailPartial = "";

    detailPort = chrome.runtime.connect({ name: "task" });
    detailPort.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            detailPartial += msg.chunk;
            if (detailCurrentBubble) appendTokenToBubble(detailCurrentBubble, msg.chunk);
            if (detailMessagesEl) detailMessagesEl.scrollTop = detailMessagesEl.scrollHeight;
        } else if (isDoneMsg(msg)) {
            if (detailCurrentBubble) finalizeBubble(detailCurrentBubble, msg.full);
            if (detailSession) {
                detailSession = {
                    ...detailSession,
                    messages: [...detailSession.messages, { role: "assistant", content: msg.full }],
                    updatedAt: Date.now(),
                };
                void upsertQASession(detailSession);
            }
            cleanupDetailPort();
        } else if (isErrorMsg(msg)) {
            if (detailCurrentBubble) setBubbleError(detailCurrentBubble, (msg.error as LLMError).message);
            cleanupDetailPort();
        }
    });
    detailPort.onDisconnect.addListener(() => { cleanupDetailPort(); });
    detailPort.postMessage(msgTaskQA(detailSession.id, detailSession.sourceText, newMessages));
}

function cleanupDetailPort(): void {
    if (detailPort) {
        try { detailPort.disconnect(); } catch {/* ignore */}
        detailPort = null;
    }
    detailCurrentBubble = null;
    if (detailTextarea) detailTextarea.disabled = false;
    if (detailSendBtn) detailSendBtn.disabled = false;
    if (detailTextarea) detailTextarea.focus();
}

// ===== refresh =====
async function refresh(): Promise<void> {
    if (currentView === "translate") {
        const items = await getHistory();
        renderTranslateList(items);
    } else if (currentView === "qa") {
        const sessions = await getQASessions();
        renderQAList(sessions);
    } else if (currentView === "detail-qa") {
        await renderDetail();
    }
}

chrome.runtime.onMessage.addListener((msg) => {
    const t = (msg as { type?: string })?.type;
    if (t === "historyUpdated" && currentView === "translate") {
        void refresh();
    }
    if (t === "qaSessionUpdated") {
        if (currentView === "qa") void refresh();
        if (currentView === "detail-qa"
            && (msg as { sessionId?: string }).sessionId === currentDetailSessionId
            && !detailPort  // 仅在非自身发起的更新时刷新
        ) {
            void refresh();
        }
    }
});

setView("translate");
void refresh();
```

- [ ] **Step 25.2: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 25.3: 手测**

加载 `dist/`：
1. 翻译几段文字 → 侧边栏「翻译」Tab 列表正常
2. 划词问答几次 → 侧边栏切到「问答」Tab → 看到 session 列表
3. 点击某个 session → 进入详情视图，看到完整对话
4. 在详情底部输入框继续追问 → 流式显示新回答 → 列表更新时间

- [ ] **Step 25.4: 提交**

```bash
git add src/sidepanel/index.ts
git commit -m "feat(sidepanel): tabs + QA list + Session detail view + continue chat"
```

---

## Task 26：里程碑 5 集成回归

- [ ] **Step 26.1: 全量验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿，91+ 个测试通过。

- [ ] **Step 26.2: 手测多视图同步**

1. 划词 [问] → 在卡片中追问 → 不关卡片，打开侧边栏看「问答」Tab → 该 session 出现在列表，且每轮 done 后实时更新时间
2. 关闭卡片 → 在侧边栏点该 session 进详情 → 完整记录可见 → 输入框继续追问 → 列表回到顶部并更新

**🏁 里程碑 5 (Sidepanel) 完成。**

---

# 里程碑 6：Options 设置

## Task 27：options 页面「问答」区段

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/index.ts`

- [ ] **Step 27.1: 修改 options/index.html**

打开 `src/options/index.html`，在「行为」section 之后、`<div class="bar">` 之前插入：

```html
<section>
    <h2>问答</h2>
    <label class="checkbox-label">
        <input id="enableQA" type="checkbox" />
        在工具栏中显示「问答」按钮
    </label>
    <label>问答系统提示词
        <textarea id="qaSystemPrompt" rows="6"></textarea>
    </label>
    <label>多轮上限（轮数，超出后自动丢弃最早一对）
        <input id="qaMaxTurns" type="number" min="1" max="20" />
    </label>
</section>
```

- [ ] **Step 27.2: 修改 options/index.ts**

打开 `src/options/index.ts`：

把 `inputs` 对象追加三项：

```ts
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
    enableHoverButton: $<HTMLInputElement>("enableHoverButton"),
    enableQA: $<HTMLInputElement>("enableQA"),
    qaSystemPrompt: $<HTMLTextAreaElement>("qaSystemPrompt"),
    qaMaxTurns: $<HTMLInputElement>("qaMaxTurns"),
};
```

在 `fillForm` 函数末尾追加：

```ts
    inputs.enableQA.checked = s.enableQA;
    inputs.qaSystemPrompt.value = s.qaSystemPrompt;
    inputs.qaMaxTurns.value = String(s.qaMaxTurns);
```

在 `readForm` 函数返回对象末尾追加：

```ts
        enableQA: inputs.enableQA.checked,
        qaSystemPrompt: inputs.qaSystemPrompt.value,
        qaMaxTurns: Math.min(20, Math.max(1, Number(inputs.qaMaxTurns.value) || 6)),
```

把 `stream("hi", "中文", settings, ctrl.signal)` 改为新签名：

```ts
for await (const t of stream({ kind: "translate", text: "hi", target: "中文" }, settings, ctrl.signal)) {
```

- [ ] **Step 27.3: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 27.4: 手测**

加载 `dist/`，打开 options 页：
1. 「问答」section 出现，三个字段渲染正常
2. 改 `qaMaxTurns = 2`，保存 → 划词问答 → 第 3 轮时 QACard 出现「为控制费用…」提示
3. 把 `enableQA` 取消勾选 → 划词工具栏不再显示 [问] 按钮

- [ ] **Step 27.5: 提交**

```bash
git add src/options/index.html src/options/index.ts
git commit -m "feat(options): QA section (enableQA / qaSystemPrompt / qaMaxTurns)"
```

**🏁 里程碑 6 (Options) 完成。**

---

# 里程碑 7：右键 + 快捷键

## Task 28：右键菜单「问答选中内容」

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 28.1: 在 service-worker.ts 注册新菜单**

打开 `src/background/service-worker.ts`：

在文件顶部 `const MENU_ID = "fayichajian-translate-selection";` 之后追加：

```ts
const MENU_QA_ID = "fayichajian-qa-selection";
```

把 `registerContextMenu` 函数体内 `removeAll` 回调中的：

```ts
chrome.contextMenus.create({
    id: MENU_ID,
    title: "翻译选中内容",
    contexts: ["selection"],
}, () => {
    const err = chrome.runtime.lastError;
    if (err) console.error("[翻译插件] 注册右键菜单失败:", err.message);
    else console.log("[翻译插件] 右键菜单已注册");
});
```

替换为：

```ts
chrome.contextMenus.create({
    id: MENU_ID,
    title: "翻译选中内容",
    contexts: ["selection"],
}, () => {
    const err = chrome.runtime.lastError;
    if (err) console.error("[翻译插件] 注册翻译菜单失败:", err.message);
});
chrome.contextMenus.create({
    id: MENU_QA_ID,
    title: "问答选中内容",
    contexts: ["selection"],
}, () => {
    const err = chrome.runtime.lastError;
    if (err) console.error("[翻译插件] 注册问答菜单失败:", err.message);
});
```

把 `chrome.contextMenus.onClicked.addListener` 整段：

```ts
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID) return;
    console.log("[翻译插件] 右键点击，selectionText=", info.selectionText?.slice(0, 50));
    if (!tab?.id || isRestrictedUrl(tab.url)) {
        notifyRestricted();
        return;
    }
    void dispatchToTab(tab.id, rtShowCard(info.selectionText));
});
```

替换为：

```ts
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id || isRestrictedUrl(tab.url)) {
        notifyRestricted();
        return;
    }
    if (info.menuItemId === MENU_ID) {
        void dispatchToTab(tab.id, rtShowCard(info.selectionText));
    } else if (info.menuItemId === MENU_QA_ID) {
        void dispatchToTab(tab.id, rtOpenQA(info.selectionText));
    }
});
```

把顶部 `import {...} from "../shared/messages";` 行加入 `rtOpenQA`：

```ts
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenQA,
    isTaskMsg, isRuntimeMessage, rtQASessionUpdated,
} from "../shared/messages";
```

- [ ] **Step 28.2: 在 content/index.ts 处理 openQA 消息**

打开 `src/content/index.ts`，在 `chrome.runtime.onMessage.addListener` 中：

把：
```ts
chrome.runtime.onMessage.addListener((msg: RuntimeMessage | { type: string }) => {
    if ((msg as { type: string }).type === "__ping__") return;
    const m = msg as RuntimeMessage;
    if (m.type === "showCard") {
        void handleTrigger(m.text);
    } else if (m.type === "requestTranslate") {
        void handleTrigger();
    }
});
```

替换为：

```ts
chrome.runtime.onMessage.addListener((msg: RuntimeMessage | { type: string }) => {
    if ((msg as { type: string }).type === "__ping__") return;
    const m = msg as RuntimeMessage;
    if (m.type === "showCard") {
        void handleTrigger(m.text);
    } else if (m.type === "requestTranslate") {
        void handleTrigger();
    } else if (m.type === "openQA") {
        const text = (m.text || getSelectionText()).trim();
        if (text) void openQACard(text);
    }
});
```

- [ ] **Step 28.3: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 28.4: 手测**

加载 `dist/`：
1. 选中文字 → 右键 → 看到「翻译选中内容」+「问答选中内容」两项
2. 点「问答选中内容」→ QACard 弹出

- [ ] **Step 28.5: 提交**

```bash
git add src/background/service-worker.ts src/content/index.ts
git commit -m "feat(qa): right-click menu '问答选中内容'"
```

---

## Task 29：Alt+Q 快捷键

**Files:**
- Modify: `src/manifest.ts`
- Modify: `src/background/service-worker.ts`

- [ ] **Step 29.1: 修改 manifest.ts 添加 qa 命令**

打开 `src/manifest.ts`，把 `commands` 块：

```ts
commands: {
    translate: {
        suggested_key: { default: "Alt+T" },
        description: "翻译当前选中文本",
    },
},
```

替换为：

```ts
commands: {
    translate: {
        suggested_key: { default: "Alt+T" },
        description: "翻译当前选中文本",
    },
    qa: {
        description: "问答当前选中文本（在 edge://extensions/shortcuts 设置快捷键）",
    },
},
```

> 注：`qa` 默认不绑定 suggested_key（避免与系统快捷键冲突），用户在 `edge://extensions/shortcuts` 自行设置。

- [ ] **Step 29.2: 在 service-worker.ts 注册命令处理**

打开 `src/background/service-worker.ts`：

把 `chrome.commands.onCommand.addListener` 整段：

```ts
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
```

替换为：

```ts
chrome.commands.onCommand.addListener((command) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (!tab?.id || isRestrictedUrl(tab.url)) {
            notifyRestricted();
            return;
        }
        if (command === "translate") {
            void dispatchToTab(tab.id, rtRequestTranslate());
        } else if (command === "qa") {
            void dispatchToTab(tab.id, rtOpenQA());
        }
    });
});
```

- [ ] **Step 29.3: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 29.4: 手测**

加载 `dist/`：
1. 打开 `edge://extensions/shortcuts` → 找到「翻译插件」→ 给 qa 命令绑定 `Alt+Q`
2. 在网页选中文字 → 按 Alt+Q → QACard 弹出

- [ ] **Step 29.5: 提交**

```bash
git add src/manifest.ts src/background/service-worker.ts
git commit -m "feat(qa): qa command (default unbound, configurable in edge://extensions/shortcuts)"
```

**🏁 里程碑 7 (右键 + 快捷键) 完成。**

---

# 里程碑 8：收尾

## Task 30：手测清单

**Files:** 无（仅手测）。

按下面清单逐项验证 `dist/` 加载到 Edge 的行为，每项打勾：

- [ ] **Step 30.1: 工具栏基本**

- [ ] 选中两个字符以上 → 工具栏在选区右下角出现，显示 [翻] [问] 两个按钮，蓝色渐变
- [ ] 在选区右边缘附近选择 → 工具栏被拉回视口内
- [ ] 在视口底部附近选择 → 工具栏跑到选区上方
- [ ] 在 `<input>` 或 `<textarea>` 中选中 → 工具栏不出现
- [ ] 在 `contenteditable=true` div 中选中 → 工具栏不出现
- [ ] 滚动页面 → 工具栏立即消失
- [ ] 设置中关闭「启用划词浮标」→ 重新加载页面 → 划词不出现工具栏
- [ ] 设置中关闭「在工具栏中显示问答按钮」→ 划词只见 [翻] 一个按钮

- [ ] **Step 30.2: 翻译路径回归**

- [ ] 工具栏 [翻] → 翻译卡片正常弹出 → 流式翻译 → 完成显示「复制原文/复制译文/关闭」
- [ ] 右键「翻译选中内容」→ 同上
- [ ] Alt+T → 同上

- [ ] **Step 30.3: Q&A 单轮**

- [ ] 工具栏 [问] → QACard 弹出，原文行（折叠态）+ 输入框聚焦
- [ ] 点击原文行 → 展开/折叠
- [ ] 输入「请详细解释」按 Enter → 出现 user 泡泡 + 旋转点 → 流式 AI 回答 → 完成显示「复制」按钮
- [ ] Shift+Enter 在输入框换行而非发送
- [ ] 输入空白 → 发送按钮无反应

- [ ] **Step 30.4: Q&A 多轮**

- [ ] 单轮完成后输入框自动聚焦 → 输入追问 → 看到 AI 回答（包含上下文）
- [ ] 设置 `qaMaxTurns = 2`，第 3 轮时输入框上方出现「为控制费用…」提示
- [ ] 流式中按 Esc → 卡片关闭 → 重新打开 [问] → 是空 session

- [ ] **Step 30.5: Q&A 错误处理**

- [ ] API Key 改错 → [问] → 输入 Q → AI 泡泡显示红框 + ⚠ + 「打开设置」按钮 → 点击后 options 页打开
- [ ] 关网络 → [问] → 输入 Q → 显示「⚠ 网络异常」+「重试」按钮（自动重试链路结束后）

- [ ] **Step 30.6: 侧边栏**

- [ ] 打开侧边栏 → 默认在「翻译」Tab → 历史正常
- [ ] 切到「问答」Tab → 列表展示所有 session（最新在上）
- [ ] 点击某个 session → 进入详情视图 → 完整记录可见 → 顶部「← 返回」按钮显示
- [ ] 在详情视图底部输入框继续追问 → 实时流式 → 完成后回到列表会看到时间更新
- [ ] 「← 返回」回到列表

- [ ] **Step 30.7: 多视图同步**

- [ ] 同时打开 QACard 和侧边栏「问答」Tab → 在卡片中完成一轮 → 侧边栏列表立即更新
- [ ] 在侧边栏详情中追问完成 → 关闭侧边栏，重新选词 [问] → 是新 session（不影响旧 session）

- [ ] **Step 30.8: 受限页**

- [ ] 在 `edge://extensions/` 上选中文字 → 工具栏不出现（content script 不注入）
- [ ] 在 `edge://extensions/` 右键时不出现「翻译/问答选中内容」（受限）

如有任一项失败，回到对应 Task 修补。

---

## Task 31：README + CHANGELOG 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 31.1: 更新 README 主介绍**

打开 `README.md`，在功能列表中增加问答；在版本历史区段（如有）追加 v0.4.0 条目，描述：
- 工具栏取代单按钮浮标，加入 [问] 入口
- 划词问答多轮对话，会话持久化
- 侧边栏增加「问答」Tab 与会话详情视图
- 设置页新增 enableQA / qaSystemPrompt / qaMaxTurns
- 右键菜单 + Alt+Q 快捷键

具体改动按现 README 的章节风格融入。

- [ ] **Step 31.2: typecheck + 测试 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 31.3: 提交**

```bash
git add README.md
git commit -m "docs: update README for v0.4.0 (toolbar + Q&A)"
```

---

## Task 32：合并 + 打 v0.4.0 标签

**Files:** 无。

- [ ] **Step 32.1: 切回 main 并合并**

```bash
git checkout main
git merge --no-ff feat/qa-feature -m "merge: v0.4.0 — toolbar + Q&A feature"
```

- [ ] **Step 32.2: 升级 package.json 版本**

打开 `package.json`，把 `"version": "0.3.0"` 改为 `"version": "0.4.0"`。然后：

```bash
git add package.json
git commit -m "chore: bump version to 0.4.0"
```

- [ ] **Step 32.3: 全量验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 32.4: 打标签**

```bash
git tag v0.4.0
```

- [ ] **Step 32.5: 推送（可选——用户决定）**

征求用户同意后执行：

```bash
git push origin main
git push origin v0.4.0
```

push tag 会触发 `.github/workflows/release.yml` 自动构建并打包发布到 GitHub Releases。

**🏁 里程碑 8 (收尾) 完成。v0.4.0 发布。**

---

## 自检（writing-plans skill self-review）

对照 spec 检查覆盖：

| Spec 节 | 任务 |
|---|---|
| §1.1 架构 / §1.2 关键设计点 | M1 (Tasks 1–9) 完整覆盖 Port 协议升级、状态归属、轮数硬上限默认 |
| §1.3 类型增量 | Tasks 1–4 |
| §2.1 内容脚本组件（Toolbar/FloatingCard/QACard/编排） | Tasks 12, 16, 18, 19 |
| §2.2 后端组件（qa.ts/llm-client/service-worker/storage） | Tasks 6–9, 17 |
| §2.3 侧边栏组件 | Tasks 23–25 |
| §2.4 设置页 | Task 27 |
| §3 数据流 | Tasks 17, 18, 25 |
| §4 错误处理 | Task 21 |
| §5 测试 | 每个 Task 含 TDD 步骤；新增 5 个测试文件 + 3 个更新 |
| §7 里程碑 | M1–M8 与 Spec 7 节里程碑划分一一对应 |
| §8 兼容性 | Task 2 用 DEFAULT_SETTINGS merge；Task 6 新 storage key；Task 9 单步 Port 重命名 |

**类型一致性**：`QACard.beginAssistant/appendToken/endAssistant/failAssistant/setMessages/showTurnCapNotice/rollbackUserTurn/getMessages/isMounted/unmount` 在 Tasks 16, 20, 21 中保持一致；`Toolbar.show/hide/isShown/contains` 在 Tasks 12, 13 一致；`StreamInput` 在 Tasks 7, 8, 17 一致。

**Placeholder 扫描**：未发现 TBD / TODO / "implement later" 等占位。每个 Step 都有具体代码或具体命令。
