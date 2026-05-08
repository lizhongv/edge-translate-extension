# 翻译插件 v0.5.0 实施计划：备忘录 + 工具栏第四档

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.4.0 基础上加入「备忘录」能力——划词工具栏 [存] / QA AI 答案「保存到备忘录」/ 右键菜单「保存选中到备忘录」三条路径写入 `chrome.storage.local.memos`，侧边栏新增第三 Tab「备忘录」（搜索 + 列表 + 详情编辑/删除）。同时给工具栏加第四档 [设]（跳设置页快捷入口），QA AI 气泡对齐翻译卡片，加 `[复制原文][复制答案][保存到备忘录]` 三按钮。

**Architecture:** 复用 v0.4 已建好的 Shadow DOM / 数据驱动 Toolbar / 侧边栏 Tab 模式。新增一个共享 `Toast` 组件（Shadow DOM，单例，右上角浮窗），新增一组 Memo storage API（与 history/qa_sessions 平行），扩展 `qa-render.finalizeBubble` 接口让两种 QA 入口（卡片 + 侧边栏详情）一行代码就能复用三按钮渲染。

**Tech Stack:** 同 v0.4.0（TypeScript 严格模式 + Vite + CRXJS + Vitest + jsdom + Shadow DOM），无新依赖。

**Spec:** `docs/superpowers/specs/2026-05-08-memo-feature-design.md`

**基线：** 从 `main` (v0.4.0) 切出新分支 `feat/memo-feature`。

---

## 文件结构（最终态）

```
src/
├── shared/
│   ├── types.ts             # 修改：Memo / MemoSource / Settings 两字段 / RuntimeMessage 三变体
│   ├── messages.ts          # 修改：rtSaveMemo / rtMemoUpdated / rtOpenSidepanel + isRuntimeMessage
│   ├── storage.ts           # 修改：getMemos / addMemo / updateMemo / deleteMemo / clearMemos
│   ├── qa-render.ts         # 修改：finalizeBubble 接受 sourceText + extraActions
│   ├── toast.ts             # 新增：showToast 单例
│   └── toast.css            # 新增
├── content/
│   ├── index.ts             # 修改：4 按钮 toolbar，save handlers，saveMemo 消息分支
│   └── qa-card.ts           # 修改：endAssistant 调用扩展版 finalizeBubble
├── background/
│   └── service-worker.ts    # 修改：第 3 个右键菜单，openSidepanel 处理
├── sidepanel/
│   ├── index.html           # 修改：第 3 Tab，备忘录列表/详情容器，搜索框，2 个模板
│   ├── index.ts             # 修改：View "memo"/"detail-memo"，renderMemoList，renderMemoDetail，last_sidepanel_tab，QA 详情三按钮
│   └── sidepanel.css        # 修改：备忘录卡片/详情/搜索框样式
└── options/
    ├── index.html           # 修改：备忘录区段
    └── index.ts             # 修改：enableMemo / enableSettingsButton

tests/unit/
├── memo-storage.test.ts     # 新增
├── toast.test.ts            # 新增
├── messages.test.ts         # 修改
├── qa-render.test.ts        # 修改
├── qa-card.test.ts          # 修改
└── toolbar.test.ts          # 修改
```

---

## 里程碑划分

- **M1 — Foundation（T1–T4）**：types / messages / storage / Settings。完成后既有翻译/问答仍跑通。
- **M2 — Toast（T5）**：通用组件 + 单测。
- **M3 — 工具栏 4 按钮（T6）**：[存] + [设] 加入 + 单测更新。
- **M4 — 划词保存路径（T7–T8）**：toolbar [存] + 右键菜单 + toast。
- **M5 — QA 卡片三按钮（T9–T10）**：finalizeBubble 接口扩展 + QACard 调用更新。
- **M6 — 侧边栏备忘录 Tab（T11–T13）**：HTML + CSS + JS（列表 / 搜索 / 详情 / 编辑）。
- **M7 — 侧边栏 QA 详情三按钮（T14）**：sidepanel saveQAAnswerAsMemo。
- **M8 — toast 跳侧边栏（T15）**：rtOpenSidepanel + last_sidepanel_tab。
- **M9 — 设置页备忘录区段（T16）**：两 checkbox。
- **M10 — 收尾（T17–T19）**：手测 / README / 合并 + 打 v0.5.0 标签。

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## Task 0：建分支

**Files:** none.

- [ ] **Step 0.1: 切到 main 并验证 v0.4.0 标签存在**

```bash
git checkout main
git pull --ff-only origin main
git tag --list "v0.4.0"
```

预期：`v0.4.0` 出现。

- [ ] **Step 0.2: 切新分支**

```bash
git checkout -b feat/memo-feature
```

- [ ] **Step 0.3: 验证基线全绿**

```bash
npm run typecheck && npm run test && npm run build
```

预期：typecheck 通过，120 tests pass，build 成功。

---

# 里程碑 1：Foundation

## Task 1：扩展 types.ts —— Memo + Settings + RuntimeMessage

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1.1：在文件末尾追加 Memo 类型**

打开 `src/shared/types.ts`，在 `QASession` 类型之后追加：

```ts
export type MemoSource = "selection" | "qa";

export type Memo = {
    id: string;
    title: string;
    content: string;
    source: MemoSource;
    sourceContext?: string;
    pageUrl?: string;
    pageTitle?: string;
    createdAt: number;
    updatedAt: number;
};
```

- [ ] **Step 1.2：扩展 Settings 类型**

在 `Settings` 类型最后一行 `qaMaxTurns: number;` 之后追加：

```ts
    enableMemo: boolean;
    enableSettingsButton: boolean;
```

- [ ] **Step 1.3：扩展 DEFAULT_SETTINGS**

在 `DEFAULT_SETTINGS` 末尾的 `qaMaxTurns: 6,` 之后追加：

```ts
    enableMemo: true,
    enableSettingsButton: true,
```

- [ ] **Step 1.4：扩展 RuntimeMessage 类型**

把：
```ts
export type RuntimeMessage =
    | { type: "showCard"; text?: string }
    | { type: "requestTranslate" }
    | { type: "historyUpdated" }
    | { type: "qaSessionUpdated"; sessionId: string }
    | { type: "openQA"; text?: string }
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
    | { type: "openOptions" }
    | { type: "saveMemo"; text: string; pageUrl?: string; pageTitle?: string }
    | { type: "memoUpdated" }
    | { type: "openSidepanel"; tab?: "translate" | "qa" | "memo" };
```

- [ ] **Step 1.5：typecheck**

```bash
npm run typecheck
```

预期：types.ts 内部一致；调用方（messages.ts、SW 等）会有错误，那是预期的，下个 Task 修。本任务允许调用方暂时红。

- [ ] **Step 1.6：跑既有测试，确保 Memo/Settings 扩展不破现有逻辑**

```bash
npm run test
```

预期：120 tests 全过（types 增量字段不影响既有断言；messages.test 因 Step 1.4 新增类型需要在 Task 2 更新但目前还未引用未失败）。

如有失败，先停下来报告；否则继续。

- [ ] **Step 1.7：提交**

```bash
git add src/shared/types.ts
git commit -m "feat(types): add Memo + Settings(enableMemo/enableSettingsButton) + 3 runtime msgs"
```

---

## Task 2：messages.ts 三个新构造器 + 守卫

**Files:**
- Modify: `src/shared/messages.ts`
- Modify: `tests/unit/messages.test.ts`

- [ ] **Step 2.1：先扩展测试（TDD）**

打开 `tests/unit/messages.test.ts`。在「runtime message constructors」describe 块中的 `it("constants", ...)` 内追加：

```ts
        expect(rtSaveMemo("hi")).toEqual({ type: "saveMemo", text: "hi" });
        expect(rtSaveMemo("hi", "https://x", "Title")).toEqual({
            type: "saveMemo", text: "hi", pageUrl: "https://x", pageTitle: "Title",
        });
        expect(rtMemoUpdated()).toEqual({ type: "memoUpdated" });
        expect(rtOpenSidepanel()).toEqual({ type: "openSidepanel" });
        expect(rtOpenSidepanel("memo")).toEqual({ type: "openSidepanel", tab: "memo" });
```

并在 `it("isRuntimeMessage accepts all known types", ...)` 中追加：

```ts
        expect(isRuntimeMessage({ type: "saveMemo", text: "x" })).toBe(true);
        expect(isRuntimeMessage({ type: "memoUpdated" })).toBe(true);
        expect(isRuntimeMessage({ type: "openSidepanel" })).toBe(true);
```

文件顶部 import 加上：

```ts
import {
    msgTaskTranslate, msgTaskQA, msgToken, msgDone, msgError,
    isTaskMsg, isTokenMsg, isDoneMsg, isErrorMsg,
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenOptions,
    rtQASessionUpdated, rtOpenQA,
    rtSaveMemo, rtMemoUpdated, rtOpenSidepanel,
    isRuntimeMessage,
} from "../../src/shared/messages";
```

- [ ] **Step 2.2：跑测试，确认失败**

```bash
npm run test -- tests/unit/messages.test.ts
```

预期：失败，新构造器未实现。

- [ ] **Step 2.3：在 messages.ts 追加三个构造器并扩展 KNOWN_RT_TYPES**

打开 `src/shared/messages.ts`。在 `rtOpenQA` 之后追加：

```ts
export const rtSaveMemo = (
    text: string,
    pageUrl?: string,
    pageTitle?: string
): RuntimeMessage => ({
    type: "saveMemo",
    text,
    ...(pageUrl !== undefined ? { pageUrl } : {}),
    ...(pageTitle !== undefined ? { pageTitle } : {}),
});

export const rtMemoUpdated = (): RuntimeMessage => ({ type: "memoUpdated" });

export const rtOpenSidepanel = (
    tab?: "translate" | "qa" | "memo"
): RuntimeMessage =>
    tab !== undefined ? { type: "openSidepanel", tab } : { type: "openSidepanel" };
```

把 `KNOWN_RT_TYPES` 数组：

```ts
const KNOWN_RT_TYPES = [
    "showCard", "requestTranslate", "historyUpdated",
    "qaSessionUpdated", "openQA", "openOptions",
] as const;
```

替换为：

```ts
const KNOWN_RT_TYPES = [
    "showCard", "requestTranslate", "historyUpdated",
    "qaSessionUpdated", "openQA", "openOptions",
    "saveMemo", "memoUpdated", "openSidepanel",
] as const;
```

- [ ] **Step 2.4：跑测试**

```bash
npm run test -- tests/unit/messages.test.ts
```

预期：通过。

- [ ] **Step 2.5：跑全量**

```bash
npm run typecheck && npm run test
```

预期：typecheck 0 错误，全部测试通过。

- [ ] **Step 2.6：提交**

```bash
git add src/shared/messages.ts tests/unit/messages.test.ts
git commit -m "feat(messages): rtSaveMemo / rtMemoUpdated / rtOpenSidepanel constructors"
```

---

## Task 3：storage.ts 新增 Memo API

**Files:**
- Modify: `src/shared/storage.ts`
- Create: `tests/unit/memo-storage.test.ts`

- [ ] **Step 3.1：写测试（先失败）**

新建 `tests/unit/memo-storage.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import {
    getMemos, addMemo, updateMemo, deleteMemo, clearMemos, setSettings,
} from "../../src/shared/storage";
import type { Memo } from "../../src/shared/types";

const baseInput = (overrides: Partial<Omit<Memo, "id" | "createdAt" | "updatedAt">> = {}) => ({
    title: "",
    content: "hello world",
    source: "selection" as const,
    ...overrides,
});

describe("getMemos", () => {
    it("empty by default", async () => {
        const memos = await getMemos();
        expect(memos).toEqual([]);
    });
});

describe("addMemo", () => {
    it("auto-generates id and timestamps", async () => {
        const m = await addMemo(baseInput());
        expect(m.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(m.createdAt).toBeGreaterThan(0);
        expect(m.updatedAt).toBe(m.createdAt);
    });

    it("auto-fills title from first 30 chars when title is empty", async () => {
        const m = await addMemo(baseInput({ content: "abcdefghij".repeat(5) }));
        expect(m.title).toBe("abcdefghij".repeat(3));
        expect(m.title.length).toBe(30);
    });

    it("replaces newlines with spaces in auto title", async () => {
        const m = await addMemo(baseInput({ content: "line1\nline2\nline3" }));
        expect(m.title).toBe("line1 line2 line3");
    });

    it("preserves explicit title", async () => {
        const m = await addMemo(baseInput({ title: "Custom", content: "long body" }));
        expect(m.title).toBe("Custom");
    });

    it("respects historyLimit", async () => {
        await setSettings({ historyLimit: 2 });
        await addMemo(baseInput({ content: "a" }));
        await new Promise(r => setTimeout(r, 2));
        await addMemo(baseInput({ content: "b" }));
        await new Promise(r => setTimeout(r, 2));
        await addMemo(baseInput({ content: "c" }));
        const list = await getMemos();
        expect(list).toHaveLength(2);
        expect(list[0].content).toBe("c");
        expect(list[1].content).toBe("b");
    });
});

describe("getMemos sort", () => {
    it("returns memos sorted by updatedAt desc", async () => {
        const a = await addMemo(baseInput({ content: "a" }));
        await new Promise(r => setTimeout(r, 5));
        const b = await addMemo(baseInput({ content: "b" }));
        await new Promise(r => setTimeout(r, 5));
        await updateMemo(a.id, { content: "a-updated" });
        const list = await getMemos();
        expect(list[0].id).toBe(a.id);
        expect(list[1].id).toBe(b.id);
    });
});

describe("updateMemo", () => {
    it("updates title and content + bumps updatedAt", async () => {
        const m = await addMemo(baseInput());
        const oldUpdated = m.updatedAt;
        await new Promise(r => setTimeout(r, 5));
        await updateMemo(m.id, { title: "new", content: "new body" });
        const list = await getMemos();
        const updated = list.find(x => x.id === m.id)!;
        expect(updated.title).toBe("new");
        expect(updated.content).toBe("new body");
        expect(updated.updatedAt).toBeGreaterThan(oldUpdated);
    });

    it("falls back to first 30 chars when title is cleared", async () => {
        const m = await addMemo(baseInput({ title: "T", content: "body abc 12345 67890" }));
        await updateMemo(m.id, { title: "", content: "new body abc 12345" });
        const list = await getMemos();
        expect(list[0].title).toBe("new body abc 12345");
    });

    it("ignores unknown ids silently", async () => {
        await expect(updateMemo("nonexistent", { title: "x" })).resolves.not.toThrow();
    });
});

describe("deleteMemo / clearMemos", () => {
    it("deleteMemo removes by id", async () => {
        const a = await addMemo(baseInput({ content: "a" }));
        await addMemo(baseInput({ content: "b" }));
        await deleteMemo(a.id);
        const list = await getMemos();
        expect(list.map(m => m.content)).toEqual(["b"]);
    });

    it("clearMemos empties store", async () => {
        await addMemo(baseInput({ content: "a" }));
        await addMemo(baseInput({ content: "b" }));
        await clearMemos();
        const list = await getMemos();
        expect(list).toEqual([]);
    });
});
```

- [ ] **Step 3.2：跑测试，确认失败**

```bash
npm run test -- tests/unit/memo-storage.test.ts
```

预期：API 不存在，全部失败。

- [ ] **Step 3.3：在 storage.ts 末尾追加实现**

打开 `src/shared/storage.ts`，在文件末尾追加：

```ts
const MEMOS_KEY = "memos";

const memoUuid = (): string =>
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

const autoTitle = (content: string): string =>
    content.replace(/\n/g, " ").trim().slice(0, 30);

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
```

- [ ] **Step 3.4：跑测试**

```bash
npm run test -- tests/unit/memo-storage.test.ts
```

预期：全部通过。

- [ ] **Step 3.5：跑全量**

```bash
npm run typecheck && npm run test
```

预期：全绿。

- [ ] **Step 3.6：提交**

```bash
git add src/shared/storage.ts tests/unit/memo-storage.test.ts
git commit -m "feat(storage): memo API (get/add/update/delete/clear) + auto-title"
```

---

## Task 4：options/index.ts 适配 Settings 新字段（保持构建绿）

**Files:**
- Modify: `src/options/index.ts`

> 仅做最小适配——options 表单填充时不缺字段。完整 UI 在 Task 16 加。

- [ ] **Step 4.1：在 inputs 对象兜底**

`src/options/index.ts` 当前 `fillForm` 会读 `s.enableMemo / s.enableSettingsButton`，但 inputs 中没有对应元素 → 报 cannot set property of undefined。Task 16 才加 HTML 元素，此前我们要么先不读、要么用 optional chaining。

打开 `src/options/index.ts`，**不**改 `inputs` 对象。Settings 已合 `enableMemo / enableSettingsButton` 默认值（Task 1 已加），现有 `fillForm` 没引用它们，所以无需改动。`readForm` 同理。

无操作。但务必确认现状：

```bash
npm run typecheck
```

预期：通过（Settings 增量字段是 optional 在 readForm 返回类型 `Partial<Settings>` 中，缺省合并时取 DEFAULT_SETTINGS 的 true）。

如果 typecheck 失败，停下来报告。本步骤期望无修改。

- [ ] **Step 4.2：把里程碑 1 的累计验证记录下来**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿，120 + N 测试通过（N = 新增 memo-storage 的 11 + messages 新增 5 ≈ 11+5=16，故总数应是 ≥ 136 左右）。

🏁 **里程碑 1 (Foundation) 完成。**

---

# 里程碑 2：Toast

## Task 5：Toast 组件 + 单测

**Files:**
- Create: `src/shared/toast.css`
- Create: `src/shared/toast.ts`
- Create: `tests/unit/toast.test.ts`

- [ ] **Step 5.1：创建 toast.css**

新建 `src/shared/toast.css`，内容：

```css
:host {
    all: initial;
    color-scheme: light dark;
}
.toast {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 2147483647;
    background: rgba(30, 41, 59, 0.95);
    color: #fff;
    border-radius: 8px;
    padding: 10px 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    font-family: -apple-system, "Segoe UI", "PingFang SC", sans-serif;
    font-size: 13px;
    line-height: 1.4;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    opacity: 0;
    transform: translateY(-8px);
    transition: opacity 0.18s, transform 0.18s;
    pointer-events: auto;
}
.toast.shown {
    opacity: 1;
    transform: translateY(0);
}
.toast .msg { white-space: pre; }
.toast .action {
    background: transparent;
    border: 1px solid rgba(255, 255, 255, 0.4);
    color: inherit;
    font: inherit;
    border-radius: 6px;
    padding: 2px 8px;
    cursor: pointer;
}
.toast .action:hover { border-color: #fff; }
@media (prefers-color-scheme: light) {
    .toast {
        background: rgba(30, 41, 59, 0.92);
        color: #fff;
    }
}
```

- [ ] **Step 5.2：写测试（先失败）**

新建 `tests/unit/toast.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { showToast, _hideToastForTest } from "../../src/shared/toast";

beforeEach(() => {
    document.body.innerHTML = "";
    vi.useFakeTimers();
});
afterEach(() => {
    vi.useRealTimers();
    _hideToastForTest();
});

describe("showToast", () => {
    it("creates a host with the message", () => {
        showToast("hello");
        const host = document.body.firstElementChild as HTMLElement;
        expect(host).toBeTruthy();
        const root = (host as any).shadowRoot ?? null;
        // closed shadow → fall back to host.innerText not available; check via querySelector
        // since we can't peek closed shadow from outside in jsdom either, use an export hatch.
        // Instead verify via document.body.children.length.
        expect(document.body.children.length).toBe(1);
    });

    it("auto-hides after default 2000ms", () => {
        showToast("hi");
        expect(document.body.children.length).toBe(1);
        vi.advanceTimersByTime(2100);
        expect(document.body.children.length).toBe(0);
    });

    it("custom durationMs", () => {
        showToast("hi", { durationMs: 500 });
        vi.advanceTimersByTime(600);
        expect(document.body.children.length).toBe(0);
    });

    it("subsequent call replaces previous toast", () => {
        showToast("first");
        showToast("second");
        expect(document.body.children.length).toBe(1);
    });

    it("actionLabel click invokes onAction and closes immediately", () => {
        const onAction = vi.fn();
        showToast("saved", { actionLabel: "open", onAction });
        // peek into shadow via export hatch
        const root = (window as any).__lastToastRoot as ShadowRoot | undefined;
        expect(root).toBeTruthy();
        const btn = root!.querySelector<HTMLButtonElement>(".action")!;
        btn.click();
        expect(onAction).toHaveBeenCalledOnce();
        expect(document.body.children.length).toBe(0);
    });

    it("no action button when actionLabel omitted", () => {
        showToast("plain");
        const root = (window as any).__lastToastRoot as ShadowRoot | undefined;
        expect(root).toBeTruthy();
        expect(root!.querySelector(".action")).toBeNull();
    });
});
```

- [ ] **Step 5.3：跑测试，确认失败**

```bash
npm run test -- tests/unit/toast.test.ts
```

预期：模块不存在，全部失败。

- [ ] **Step 5.4：实现 toast.ts**

新建 `src/shared/toast.ts`：

```ts
import toastCss from "./toast.css?inline";

type ToastOptions = {
    actionLabel?: string;
    onAction?: () => void;
    durationMs?: number;
};

let currentHost: HTMLDivElement | null = null;
let currentTimer: ReturnType<typeof setTimeout> | null = null;

function _clear(): void {
    if (currentTimer !== null) {
        clearTimeout(currentTimer);
        currentTimer = null;
    }
    if (currentHost?.parentNode) {
        currentHost.parentNode.removeChild(currentHost);
    }
    currentHost = null;
    (window as unknown as { __lastToastRoot?: ShadowRoot | undefined }).__lastToastRoot = undefined;
}

export function showToast(message: string, options: ToastOptions = {}): void {
    _clear();

    const host = document.createElement("div");
    host.style.all = "initial";
    const root = host.attachShadow({ mode: "closed" });
    (window as unknown as { __lastToastRoot?: ShadowRoot }).__lastToastRoot = root;

    const style = document.createElement("style");
    style.textContent = toastCss;
    root.appendChild(style);

    const toast = document.createElement("div");
    toast.className = "toast";

    const msgEl = document.createElement("span");
    msgEl.className = "msg";
    msgEl.textContent = message;
    toast.appendChild(msgEl);

    if (options.actionLabel) {
        const btn = document.createElement("button");
        btn.className = "action";
        btn.type = "button";
        btn.textContent = options.actionLabel;
        btn.addEventListener("click", () => {
            options.onAction?.();
            _clear();
        });
        toast.appendChild(btn);
    }

    root.appendChild(toast);
    document.body.appendChild(host);
    currentHost = host;

    requestAnimationFrame(() => toast.classList.add("shown"));

    const duration = options.durationMs ?? 2000;
    currentTimer = setTimeout(() => _clear(), duration);
}

// Test-only: force-clear without timer
export function _hideToastForTest(): void {
    _clear();
}
```

- [ ] **Step 5.5：跑测试**

```bash
npm run test -- tests/unit/toast.test.ts
```

预期：6 测试通过。

- [ ] **Step 5.6：跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 5.7：提交**

```bash
git add src/shared/toast.ts src/shared/toast.css tests/unit/toast.test.ts
git commit -m "feat(shared): Toast — singleton Shadow DOM popup with auto-hide + action"
```

🏁 **里程碑 2 (Toast) 完成。**

---

# 里程碑 3：工具栏 4 按钮

## Task 6：扩展 TOOLBAR_ACTIONS + 测试更新

**Files:**
- Modify: `src/content/index.ts`
- Modify: `tests/unit/toolbar.test.ts`

> Toolbar 类本身已数据驱动，无需改。仅 `content/index.ts` 增加 actions + 处理 onPick 的两个新分支；测试更新为 4 按钮。

- [ ] **Step 6.1：更新 toolbar.test.ts 的 mkActions**

打开 `tests/unit/toolbar.test.ts`。把：

```ts
const mkActions = () => [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];
```

替换为：

```ts
const mkActions = () => [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
    { id: "memo", char: "存", label: "保存到备忘录" },
    { id: "settings", char: "设", label: "打开设置" },
];
```

把测试 `it("show appends a host with N buttons", ...)` 中的：

```ts
expect(root.querySelectorAll(".btn").length).toBe(2);
```

改为：

```ts
expect(root.querySelectorAll(".btn").length).toBe(4);
```

把 `it("clicking a button invokes onPick with id", ...)` 中：

```ts
btns[1].click();
expect(cb).toHaveBeenCalledWith("qa");
```

可保留（点第 2 个按钮还是 qa）。

把 `it("default places at bottom-right edge of selection rect", ...)` 中：

```ts
const expectedWidth = 28 * 2;
expect(bar.style.left).toBe(`${200 - expectedWidth}px`);
```

改为：

```ts
const expectedWidth = 28 * 4;
expect(bar.style.left).toBe(`${200 - expectedWidth}px`);
```

把 `it("right-edge overflow → pull back inside viewport", ...)` 中：

```ts
expect(left + 28 * 2).toBeLessThanOrEqual(winW - 4);
```

改为：

```ts
expect(left + 28 * 4).toBeLessThanOrEqual(winW - 4);
```

- [ ] **Step 6.2：跑测试，确认失败**

```bash
npm run test -- tests/unit/toolbar.test.ts
```

预期：失败（content/index.ts 还是给 toolbar 传 2 个 actions，而 toolbar 类本身不知道这件事——其实 toolbar.test.ts 直接给 toolbar 传 mkActions()，所以 toolbar 测试不依赖 index.ts）。Task 12 的 toolbar 测试是独立的。

实际上：toolbar.test.ts 自己给 toolbar 传 mkActions（4 项），toolbar 类被动接收。所以更新 mkActions 即可，不需要 index.ts 同时改。重新确认上面 Step 6.1 修改的预期：toolbar 测试应该通过，因为 toolbar 类已数据驱动。

```bash
npm run test -- tests/unit/toolbar.test.ts
```

如果直接通过，跳到 Step 6.4。如果失败，仔细看错误信息修。

- [ ] **Step 6.3：更新 src/content/index.ts**

打开 `src/content/index.ts`。

把：

```ts
const TOOLBAR_ACTIONS = [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
];
```

替换为：

```ts
const TOOLBAR_ACTIONS = [
    { id: "translate", char: "翻", label: "翻译" },
    { id: "qa", char: "问", label: "问答" },
    { id: "memo", char: "存", label: "保存到备忘录" },
    { id: "settings", char: "设", label: "打开设置" },
];
```

找到 `maybeShowToolbar` 中的 actions 过滤行：

```ts
const actions = TOOLBAR_ACTIONS.filter(a => a.id !== "qa" || settings.enableQA);
```

替换为：

```ts
const actions = TOOLBAR_ACTIONS.filter(a => {
    if (a.id === "qa") return settings.enableQA;
    if (a.id === "memo") return settings.enableMemo;
    if (a.id === "settings") return settings.enableSettingsButton;
    return true;
});
```

找到 `toolbar.show(rect, actions, (id) => { ... })` 回调：

```ts
toolbar.show(rect, actions, (id) => {
    if (id === "translate") {
        void handleTrigger(text);
    } else if (id === "qa") {
        void openQACard(text);
    }
});
```

替换为：

```ts
toolbar.show(rect, actions, (id) => {
    if (id === "translate") {
        void handleTrigger(text);
    } else if (id === "qa") {
        void openQACard(text);
    } else if (id === "memo") {
        void saveSelectionAsMemo(text);
    } else if (id === "settings") {
        chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
    }
});
```

`saveSelectionAsMemo` 还没定义——下一个 Task 加。这一步先让 typecheck 失败。

- [ ] **Step 6.4：临时定义 stub（让 typecheck 过）**

在 `src/content/index.ts` 任意函数前追加：

```ts
async function saveSelectionAsMemo(_text: string, _pageUrl?: string, _pageTitle?: string): Promise<void> {
    // implemented in Task 7
    console.warn("[翻译插件] saveSelectionAsMemo stub");
}
```

- [ ] **Step 6.5：typecheck + 跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。toolbar 测试 13 个全过。

- [ ] **Step 6.6：提交**

```bash
git add src/content/index.ts tests/unit/toolbar.test.ts
git commit -m "feat(content): toolbar 4 buttons (翻/问/存/设) + filter by settings (memo stub)"
```

🏁 **里程碑 3 完成。**

---

# 里程碑 4：划词保存路径

## Task 7：实现 saveSelectionAsMemo + toast 反馈

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 7.1：替换 stub 为完整实现**

打开 `src/content/index.ts`。

在文件顶 imports 段加：

```ts
import { addMemo } from "../shared/storage";
import { showToast } from "../shared/toast";
import { rtMemoUpdated, rtOpenSidepanel } from "../shared/messages";
```

（`rtOpenOptions` 应已存在，`msgTaskTranslate / msgTaskQA / isTokenMsg / ...` 等也都已 import）

把 Task 6 的 stub：

```ts
async function saveSelectionAsMemo(_text: string, _pageUrl?: string, _pageTitle?: string): Promise<void> {
    console.warn("[翻译插件] saveSelectionAsMemo stub");
}
```

替换为：

```ts
async function saveSelectionAsMemo(
    text: string,
    pageUrl?: string,
    pageTitle?: string
): Promise<void> {
    if (!text || !text.trim()) return;
    try {
        await addMemo({
            title: "",
            content: text,
            source: "selection",
            pageUrl: pageUrl ?? location.href,
            pageTitle: pageTitle ?? document.title,
        });
        chrome.runtime.sendMessage(rtMemoUpdated()).catch(() => {/* ignore */});
        showToast("已保存 ✓", {
            actionLabel: "打开",
            onAction: () => {
                chrome.runtime.sendMessage(rtOpenSidepanel("memo")).catch(() => {/* ignore */});
            },
        });
    } catch (e) {
        console.error("[翻译插件] saveSelectionAsMemo failed:", e);
        showToast("保存失败：存储空间不足，请清理旧条目");
    }
}
```

- [ ] **Step 7.2：跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 7.3：提交**

```bash
git add src/content/index.ts
git commit -m "feat(content): saveSelectionAsMemo with toast feedback"
```

---

## Task 8：右键菜单「保存选中到备忘录」

**Files:**
- Modify: `src/background/service-worker.ts`
- Modify: `src/content/index.ts`

- [ ] **Step 8.1：在 service-worker.ts 加第三菜单**

打开 `src/background/service-worker.ts`。

在文件顶部 menu IDs 处：

```ts
const MENU_ID = "fayichajian-translate-selection";
const MENU_QA_ID = "fayichajian-qa-selection";
```

之后追加：

```ts
const MENU_MEMO_ID = "fayichajian-memo-selection";
```

更新 imports（确保有 `rtSaveMemo`）：

```ts
import {
    rtShowCard, rtRequestTranslate, rtHistoryUpdated, rtOpenQA, rtSaveMemo,
    rtQASessionUpdated, isTaskMsg, isRuntimeMessage,
} from "../shared/messages";
```

在 `registerContextMenu` 函数体中既有的两条 `chrome.contextMenus.create(...)` 之后追加第三条：

```ts
chrome.contextMenus.create({
    id: MENU_MEMO_ID,
    title: "保存选中到备忘录",
    contexts: ["selection"],
}, () => {
    const err = chrome.runtime.lastError;
    if (err) console.error("[翻译插件] 注册备忘录菜单失败:", err.message);
});
```

把 `chrome.contextMenus.onClicked.addListener` 整段：

```ts
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) {
        if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("翻译"); return; }
        void dispatchToTab(tab.id, rtShowCard(info.selectionText));
    } else if (info.menuItemId === MENU_QA_ID) {
        if (!tab?.id || isRestrictedUrl(tab.url)) { notifyRestricted("问答"); return; }
        void dispatchToTab(tab.id, rtOpenQA(info.selectionText));
    }
});
```

替换为：

```ts
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
```

- [ ] **Step 8.2：在 content/index.ts 处理 saveMemo 消息**

打开 `src/content/index.ts`。找到 `chrome.runtime.onMessage.addListener` 块中的 `else if (m.type === "openQA")` 之后追加：

```ts
    } else if (m.type === "saveMemo") {
        const text = (m.text || getSelectionText()).trim();
        if (text) void saveSelectionAsMemo(text, m.pageUrl, m.pageTitle);
    }
```

确保 `getSelectionText` 已 import 自 `./selection`（应该已 import）。

- [ ] **Step 8.3：typecheck + test + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 8.4：提交**

```bash
git add src/background/service-worker.ts src/content/index.ts
git commit -m "feat(memo): right-click menu '保存选中到备忘录' + content handler"
```

🏁 **里程碑 4 完成。**

---

# 里程碑 5：QA 卡片三按钮

## Task 9：finalizeBubble 接口扩展 + 测试更新

**Files:**
- Modify: `src/shared/qa-render.ts`
- Modify: `tests/unit/qa-render.test.ts`

- [ ] **Step 9.1：更新 qa-render.test.ts**

打开 `tests/unit/qa-render.test.ts`。

把 `describe("finalizeBubble", ...)` 块整体替换为：

```ts
describe("finalizeBubble", () => {
    it("appends [复制答案] button and wires clipboard", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "answer");
        finalizeBubble(el, "answer");
        const btn = el.querySelector<HTMLButtonElement>(".copy")!;
        expect(btn).toBeTruthy();
        expect(btn.textContent).toBe("复制答案");
        btn.click();
        expect(writeText).toHaveBeenCalledWith("answer");
    });

    it("renders [复制原文] when sourceText provided", () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            value: { writeText }, configurable: true,
        });
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", { sourceText: "the source" });
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        const copySrc = Array.from(buttons).find(b => b.textContent === "复制原文");
        expect(copySrc).toBeTruthy();
        copySrc!.click();
        expect(writeText).toHaveBeenCalledWith("the source");
    });

    it("does NOT render [复制原文] when sourceText omitted", () => {
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans");
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        const copySrc = Array.from(buttons).find(b => b.textContent === "复制原文");
        expect(copySrc).toBeUndefined();
    });

    it("renders extraActions and triggers onClick", () => {
        const onSave = vi.fn();
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", {
            extraActions: [{ label: "保存到备忘录", onClick: onSave }],
        });
        const btns = Array.from(el.querySelectorAll<HTMLButtonElement>("button"));
        const saveBtn = btns.find(b => b.textContent === "保存到备忘录");
        expect(saveBtn).toBeTruthy();
        saveBtn!.click();
        expect(onSave).toHaveBeenCalledOnce();
    });

    it("idempotent: repeated finalizeBubble does not duplicate buttons", () => {
        const el = createMessageBubble("assistant", "ans");
        finalizeBubble(el, "ans", { sourceText: "src" });
        finalizeBubble(el, "ans", { sourceText: "src" });
        const buttons = el.querySelectorAll<HTMLButtonElement>("button");
        // 复制答案 + 复制原文 = 2 buttons total
        expect(buttons.length).toBe(2);
    });
});
```

- [ ] **Step 9.2：跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-render.test.ts
```

预期：失败（按钮文字旧版还是「复制」+ 没有 sourceText/extraActions 处理）。

- [ ] **Step 9.3：更新 src/shared/qa-render.ts**

把 `finalizeBubble` 函数整体替换为：

```ts
export function finalizeBubble(
    bubble: HTMLElement,
    fullContent: string,
    options?: {
        sourceText?: string;
        extraActions?: { label: string; onClick: () => void }[];
    }
): void {
    const c = bubble.querySelector<HTMLElement>(".content");
    if (c) c.textContent = fullContent;
    if (bubble.querySelector(".copy")) return;

    const btnAns = document.createElement("button");
    btnAns.className = "copy";
    btnAns.type = "button";
    btnAns.textContent = "复制答案";
    btnAns.addEventListener("click", () => {
        navigator.clipboard.writeText(fullContent).catch(() => {/* ignore */});
    });
    bubble.appendChild(btnAns);

    if (options?.sourceText) {
        const btnSrc = document.createElement("button");
        btnSrc.className = "copy";
        btnSrc.type = "button";
        btnSrc.textContent = "复制原文";
        const srcText = options.sourceText;
        btnSrc.addEventListener("click", () => {
            navigator.clipboard.writeText(srcText).catch(() => {/* ignore */});
        });
        bubble.appendChild(btnSrc);
    }

    if (options?.extraActions) {
        for (const a of options.extraActions) {
            const btn = document.createElement("button");
            btn.className = "copy";
            btn.type = "button";
            btn.textContent = a.label;
            btn.addEventListener("click", a.onClick);
            bubble.appendChild(btn);
        }
    }
}
```

- [ ] **Step 9.4：跑测试**

```bash
npm run test -- tests/unit/qa-render.test.ts
```

预期：5 测试通过。

- [ ] **Step 9.5：跑全量**

```bash
npm run typecheck && npm run test
```

预期：全绿。

- [ ] **Step 9.6：提交**

```bash
git add src/shared/qa-render.ts tests/unit/qa-render.test.ts
git commit -m "feat(qa-render): finalizeBubble accepts sourceText + extraActions"
```

---

## Task 10：QACard 调用扩展 finalizeBubble + 保存到备忘录

**Files:**
- Modify: `src/content/qa-card.ts`
- Modify: `tests/unit/qa-card.test.ts`

- [ ] **Step 10.1：更新 qa-card.test.ts**

打开 `tests/unit/qa-card.test.ts`。在「QACard streaming lifecycle」describe 块的 `it("endAssistant re-enables textarea and adds copy button", ...)` 之后追加：

```ts
    it("endAssistant renders 复制原文 + 复制答案 + 保存到备忘录", () => {
        const c = new QACard();
        const cb = makeCb();
        c.mount(mkRect(10, 10, 100, 30), "the-source", cb);
        const root = innerRoot(c);
        const ta = root.querySelector<HTMLTextAreaElement>("textarea")!;
        ta.value = "Q";
        ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        c.beginAssistant();
        c.endAssistant("Answer");
        const lastBubble = Array.from(root.querySelectorAll(".msg.assistant")).pop()!;
        const btns = Array.from(lastBubble.querySelectorAll<HTMLButtonElement>("button"));
        const labels = btns.map(b => b.textContent);
        expect(labels).toContain("复制答案");
        expect(labels).toContain("复制原文");
        expect(labels).toContain("保存到备忘录");
    });
```

- [ ] **Step 10.2：跑测试，确认失败**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：新用例失败（finalizeBubble 调用没传 sourceText / extraActions）。

- [ ] **Step 10.3：修改 src/content/qa-card.ts**

添加 import：

```ts
import { addMemo } from "../shared/storage";
import { showToast } from "../shared/toast";
import { rtMemoUpdated, rtOpenSidepanel } from "../shared/messages";
```

> 类已有 `private sourceText` 在 mount 时记录吗？检查现有源码：QACard.mount 接受 `sourceText` 参数但没存为字段。需要存。

在类字段声明部分（与 host/root/cardEl 等并列）添加：

```ts
    private sourceText = "";
```

在 `mount` 方法体最开始（在 `if (!sourceText) return;` 之前或之后均可，但建议在 `this.cb = callbacks; this.messages = [];` 同位置）追加：

```ts
        this.sourceText = sourceText;
```

在 `unmount` 方法的字段清理部分加：

```ts
        this.sourceText = "";
```

把 `endAssistant` 中调用 `finalizeBubble(this.currentAssistantBubble, full)` 那一行替换为：

```ts
        if (this.currentAssistantBubble) {
            const sp = this.currentAssistantBubble.querySelector(".spinner");
            if (sp) sp.remove();
            const sourceText = this.sourceText;
            finalizeBubble(this.currentAssistantBubble, full, {
                sourceText,
                extraActions: [{
                    label: "保存到备忘录",
                    onClick: () => { void saveQAAnswerToMemo(full, sourceText); },
                }],
            });
        }
```

> 注：`endAssistant` 之前可能是：
> ```ts
> if (this.currentAssistantBubble) {
>     const sp = this.currentAssistantBubble.querySelector(".spinner");
>     if (sp) sp.remove();
>     finalizeBubble(this.currentAssistantBubble, full);
> }
> ```
> 替换 `finalizeBubble(...)` 单行为上面的扩展调用即可。

在文件末尾（类外）加辅助函数：

```ts
async function saveQAAnswerToMemo(answer: string, sourceContext: string): Promise<void> {
    try {
        await addMemo({
            title: "",
            content: answer,
            source: "qa",
            sourceContext,
            pageUrl: location.href,
            pageTitle: document.title,
        });
        chrome.runtime.sendMessage(rtMemoUpdated()).catch(() => {/* ignore */});
        showToast("已保存 ✓", {
            actionLabel: "打开",
            onAction: () => {
                chrome.runtime.sendMessage(rtOpenSidepanel("memo")).catch(() => {/* ignore */});
            },
        });
    } catch (e) {
        console.error("[翻译插件] saveQAAnswerToMemo failed:", e);
        showToast("保存失败：存储空间不足");
    }
}
```

- [ ] **Step 10.4：跑测试**

```bash
npm run test -- tests/unit/qa-card.test.ts
```

预期：所有用例通过（旧的 + 新增的「三按钮」）。

- [ ] **Step 10.5：跑全量 + build**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 10.6：提交**

```bash
git add src/content/qa-card.ts tests/unit/qa-card.test.ts
git commit -m "feat(qa-card): three buttons (复制原文/复制答案/保存到备忘录) on AI bubble"
```

🏁 **里程碑 5 完成。**

---

# 里程碑 6：侧边栏备忘录 Tab

## Task 11：sidepanel/index.html 新增第 3 Tab + 模板

**Files:**
- Modify: `src/sidepanel/index.html`

- [ ] **Step 11.1：替换 sidepanel/index.html**

打开 `src/sidepanel/index.html`，把整个文件替换为：

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
            <button class="tab" data-tab="memo">备忘录</button>
        </div>
        <div class="tools">
            <button id="back" class="back" hidden>← 返回</button>
            <input id="memo-search" class="memo-search" type="search" placeholder="搜索备忘录..." hidden />
            <button id="clear">清空</button>
        </div>
    </header>

    <main>
        <section id="list-translate" class="view active"></section>
        <section id="list-qa" class="view"></section>
        <section id="detail-qa" class="view detail"></section>
        <section id="list-memo" class="view"></section>
        <section id="detail-memo" class="view detail"></section>
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

    <template id="memo-item-tpl">
        <article class="item memo-item">
            <div class="meta">
                <span class="icon"></span>
                <span class="time"></span>
                <button class="del" title="删除">×</button>
            </div>
            <div class="title"></div>
            <div class="preview"></div>
            <div class="source"></div>
        </article>
    </template>

    <template id="memo-detail-tpl">
        <div class="memo-detail">
            <label class="memo-title-label">标题
                <input type="text" class="memo-title-input" maxlength="100" />
            </label>
            <div class="memo-source-row">
                <span class="label">来源：</span>
                <a class="memo-source-link" target="_blank" rel="noopener"></a>
            </div>
            <label class="memo-content-label">正文
                <textarea class="memo-content-input" rows="14"></textarea>
            </label>
            <div class="memo-error" hidden></div>
            <div class="memo-buttons">
                <button class="memo-cancel">取消</button>
                <button class="memo-save">保存</button>
            </div>
        </div>
    </template>

    <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 11.2：提交**

```bash
git add src/sidepanel/index.html
git commit -m "feat(sidepanel): 3rd Tab 备忘录 + memo item/detail templates + search box"
```

---

## Task 12：sidepanel.css 新增备忘录样式

**Files:**
- Modify: `src/sidepanel/sidepanel.css`

- [ ] **Step 12.1：在文件末尾追加**

打开 `src/sidepanel/sidepanel.css`，在文件末尾追加：

```css
.tabs { /* keep existing */ }
/* memo-search input */
.memo-search {
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #d0d4da;
    border-radius: 6px;
    padding: 3px 8px;
    width: 160px;
}
@media (prefers-color-scheme: dark) {
    .memo-search { background: #2a2f36; border-color: #4a5160; color: #e6e6e6; }
}
.memo-search:focus { outline: none; border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15); }

/* memo list cards */
.memo-item .icon {
    font-size: 14px;
}
.memo-item .title {
    font-weight: 600;
    font-size: 14px;
    margin: 4px 0;
}
.memo-item .preview {
    font-size: 12px;
    opacity: 0.75;
    white-space: pre-wrap;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    margin-bottom: 4px;
}
.memo-item .source {
    font-size: 11px;
    opacity: 0.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.memo-item { cursor: pointer; }

/* memo detail page */
.memo-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 0;
}
.memo-detail label {
    display: block;
    font-size: 12px;
    font-weight: 500;
    color: #4b5563;
}
@media (prefers-color-scheme: dark) {
    .memo-detail label { color: #9ba2ad; }
}
.memo-detail input[type="text"], .memo-detail textarea {
    display: block;
    width: 100%;
    margin-top: 4px;
    font: inherit;
    color: inherit;
    background: #fff;
    border: 1px solid #d0d4da;
    border-radius: 6px;
    padding: 6px 10px;
}
@media (prefers-color-scheme: dark) {
    .memo-detail input[type="text"], .memo-detail textarea {
        background: #2a2f36; border-color: #4a5160; color: #e6e6e6;
    }
}
.memo-detail textarea { resize: vertical; min-height: 200px; line-height: 1.5; }
.memo-detail input[type="text"]:focus, .memo-detail textarea:focus {
    outline: none; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.memo-source-row {
    font-size: 12px;
    opacity: 0.7;
}
.memo-source-link {
    color: #2563eb;
    text-decoration: none;
    word-break: break-all;
}
.memo-source-link:hover { text-decoration: underline; }
.memo-error {
    color: #c0392b;
    font-size: 12px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 6px;
    padding: 6px 10px;
}
.memo-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
.memo-buttons .memo-save {
    background: #2563eb;
    color: #fff;
    border-color: #2563eb;
}
.memo-buttons .memo-save:hover { background: #1d4ed8; border-color: #1d4ed8; }
```

- [ ] **Step 12.2：提交**

```bash
git add src/sidepanel/sidepanel.css
git commit -m "feat(sidepanel): styles for memo list + detail + search"
```

---

## Task 13：sidepanel/index.ts 加备忘录视图逻辑

**Files:**
- Modify: `src/sidepanel/index.ts`

- [ ] **Step 13.1：替换 sidepanel/index.ts**

打开 `src/sidepanel/index.ts`，把整个文件替换为：

```ts
import {
    clearHistory, deleteHistoryItem, getHistory,
    clearQASessions, deleteQASession, getQASessions,
    getMemos, addMemo, updateMemo, deleteMemo, clearMemos,
} from "../shared/storage";
import {
    msgTaskQA, isTokenMsg, isDoneMsg, isErrorMsg,
    rtMemoUpdated,
} from "../shared/messages";
import {
    createMessageBubble, appendTokenToBubble, finalizeBubble, setBubbleError,
} from "../shared/qa-render";
import { showToast } from "../shared/toast";
import type { ChatMessage, HistoryItem, LLMError, Memo, QASession } from "../shared/types";

// ===== view state =====
type View = "translate" | "qa" | "detail-qa" | "memo" | "detail-memo";
let currentView: View = "translate";
let currentDetailSessionId: string | null = null;
let currentDetailMemoId: string | null = null;
let memoQuery = "";

// ===== DOM refs =====
const translateListEl = document.getElementById("list-translate") as HTMLElement;
const qaListEl = document.getElementById("list-qa") as HTMLElement;
const qaDetailEl = document.getElementById("detail-qa") as HTMLElement;
const memoListEl = document.getElementById("list-memo") as HTMLElement;
const memoDetailEl = document.getElementById("detail-memo") as HTMLElement;
const clearBtn = document.getElementById("clear") as HTMLButtonElement;
const backBtn = document.getElementById("back") as HTMLButtonElement;
const memoSearchInput = document.getElementById("memo-search") as HTMLInputElement;
const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab");
const itemTpl = document.getElementById("item-tpl") as HTMLTemplateElement;
const qaItemTpl = document.getElementById("qa-item-tpl") as HTMLTemplateElement;
const qaDetailTpl = document.getElementById("qa-detail-tpl") as HTMLTemplateElement;
const memoItemTpl = document.getElementById("memo-item-tpl") as HTMLTemplateElement;
const memoDetailTpl = document.getElementById("memo-detail-tpl") as HTMLTemplateElement;

const fmtTime = (ts: number): string => new Date(ts).toLocaleString();

// ===== view switching =====
function setView(v: View): void {
    currentView = v;
    translateListEl.classList.toggle("active", v === "translate");
    qaListEl.classList.toggle("active", v === "qa");
    qaDetailEl.classList.toggle("active", v === "detail-qa");
    memoListEl.classList.toggle("active", v === "memo");
    memoDetailEl.classList.toggle("active", v === "detail-memo");
    backBtn.hidden = v !== "detail-qa" && v !== "detail-memo";
    clearBtn.hidden = v === "detail-qa" || v === "detail-memo";
    memoSearchInput.hidden = v !== "memo";
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === v
        || (b.dataset.tab === "qa" && v === "detail-qa")
        || (b.dataset.tab === "memo" && v === "detail-memo")));
}

tabBtns.forEach(b => b.addEventListener("click", () => {
    const t = b.dataset.tab as "translate" | "qa" | "memo";
    setView(t);
    void refresh();
}));

backBtn.addEventListener("click", () => {
    if (currentView === "detail-qa") {
        currentDetailSessionId = null;
        setView("qa");
    } else if (currentView === "detail-memo") {
        currentDetailMemoId = null;
        setView("memo");
    }
    void refresh();
});

clearBtn.addEventListener("click", async () => {
    if (currentView === "translate") {
        if (!confirm("确认清空全部翻译历史？")) return;
        await clearHistory();
    } else if (currentView === "qa") {
        if (!confirm("确认清空全部问答会话？")) return;
        await clearQASessions();
    } else if (currentView === "memo") {
        if (!confirm("确认清空全部备忘录？")) return;
        await clearMemos();
    }
    await refresh();
});

memoSearchInput.addEventListener("input", () => {
    memoQuery = memoSearchInput.value.trim().toLowerCase();
    if (currentView === "memo") void refresh();
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
            void renderQADetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteQASession(s.id);
            await refresh();
        });
        qaListEl.appendChild(node);
    }
}

// ===== qa detail =====
let detailSession: QASession | null = null;
let detailMessagesEl: HTMLElement | null = null;
let detailTextarea: HTMLTextAreaElement | null = null;
let detailSendBtn: HTMLButtonElement | null = null;
let detailPort: chrome.runtime.Port | null = null;
let detailPartial = "";
let detailCurrentBubble: HTMLElement | null = null;

async function renderQADetail(): Promise<void> {
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
        if (m.role === "assistant") {
            const sourceText = s.sourceText;
            const content = m.content;
            finalizeBubble(bubble, content, {
                sourceText,
                extraActions: [{
                    label: "保存到备忘录",
                    onClick: () => { void saveQAAnswerToMemoFromSidepanel(content, sourceText, s.pageOrigin); },
                }],
            });
        }
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

async function saveQAAnswerToMemoFromSidepanel(
    answer: string, sourceContext: string, pageOrigin?: string
): Promise<void> {
    try {
        await addMemo({
            title: "",
            content: answer,
            source: "qa",
            sourceContext,
            pageUrl: pageOrigin,
        });
        showToast("已保存 ✓");
        if (currentView === "memo") void refresh();
    } catch (e) {
        console.error("[翻译插件] sidepanel save memo failed:", e);
        showToast("保存失败");
    }
}

async function detailSend(): Promise<void> {
    if (!detailSession || !detailTextarea || !detailMessagesEl || !detailSendBtn) return;
    const text = detailTextarea.value.trim();
    if (!text) return;
    if (detailPort) return;

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
            const fullAnswer = msg.full;
            const sourceText = detailSession?.sourceText ?? "";
            const pageOrigin = detailSession?.pageOrigin;
            if (detailCurrentBubble) {
                finalizeBubble(detailCurrentBubble, fullAnswer, {
                    sourceText,
                    extraActions: [{
                        label: "保存到备忘录",
                        onClick: () => { void saveQAAnswerToMemoFromSidepanel(fullAnswer, sourceText, pageOrigin); },
                    }],
                });
            }
            if (detailSession) {
                detailSession = {
                    ...detailSession,
                    messages: [...detailSession.messages, { role: "assistant", content: fullAnswer }],
                    updatedAt: Date.now(),
                };
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

// ===== memo list =====
function memoIcon(source: "selection" | "qa"): string {
    return source === "selection" ? "📝" : "💬";
}

function memoMatches(memo: Memo, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return memo.title.toLowerCase().includes(q) || memo.content.toLowerCase().includes(q);
}

function renderMemoList(memos: Memo[]): void {
    memoListEl.innerHTML = "";
    const filtered = memos.filter(m => memoMatches(m, memoQuery));
    if (filtered.length === 0) {
        memoListEl.innerHTML = `<div class="empty">${memoQuery ? "无匹配项" : "暂无备忘录"}</div>`;
        return;
    }
    for (const m of filtered) {
        const node = memoItemTpl.content.cloneNode(true) as DocumentFragment;
        const article = node.querySelector(".item") as HTMLElement;
        article.dataset.id = m.id;
        (node.querySelector(".icon") as HTMLElement).textContent = memoIcon(m.source);
        (node.querySelector(".time") as HTMLElement).textContent = fmtTime(m.updatedAt);
        (node.querySelector(".title") as HTMLElement).textContent = m.title;
        (node.querySelector(".preview") as HTMLElement).textContent = m.content;
        (node.querySelector(".source") as HTMLElement).textContent = m.pageTitle || m.pageUrl || "";
        article.addEventListener("click", (e) => {
            if ((e.target as HTMLElement).classList.contains("del")) return;
            currentDetailMemoId = m.id;
            setView("detail-memo");
            void renderMemoDetail();
        });
        (node.querySelector(".del") as HTMLElement).addEventListener("click", async (e) => {
            e.stopPropagation();
            await deleteMemo(m.id);
            await refresh();
        });
        memoListEl.appendChild(node);
    }
}

// ===== memo detail =====
async function renderMemoDetail(): Promise<void> {
    memoDetailEl.innerHTML = "";
    if (!currentDetailMemoId) return;
    const memos = await getMemos();
    const memo = memos.find(m => m.id === currentDetailMemoId);
    if (!memo) {
        memoDetailEl.innerHTML = '<div class="empty">该条已被删除</div>';
        return;
    }
    const node = memoDetailTpl.content.cloneNode(true) as DocumentFragment;
    const titleInput = node.querySelector(".memo-title-input") as HTMLInputElement;
    const contentInput = node.querySelector(".memo-content-input") as HTMLTextAreaElement;
    const sourceLink = node.querySelector(".memo-source-link") as HTMLAnchorElement;
    const sourceRow = node.querySelector(".memo-source-row") as HTMLElement;
    const errorEl = node.querySelector(".memo-error") as HTMLElement;
    const cancelBtn = node.querySelector(".memo-cancel") as HTMLButtonElement;
    const saveBtn = node.querySelector(".memo-save") as HTMLButtonElement;

    titleInput.value = memo.title;
    contentInput.value = memo.content;
    if (memo.pageUrl) {
        sourceLink.href = memo.pageUrl;
        sourceLink.textContent = memo.pageTitle || memo.pageUrl;
    } else {
        sourceRow.hidden = true;
    }

    cancelBtn.addEventListener("click", () => {
        currentDetailMemoId = null;
        setView("memo");
        void refresh();
    });

    saveBtn.addEventListener("click", async () => {
        const newContent = contentInput.value.trim();
        if (!newContent) {
            errorEl.textContent = "正文不能为空";
            errorEl.hidden = false;
            return;
        }
        errorEl.hidden = true;
        try {
            await updateMemo(memo.id, {
                title: titleInput.value,
                content: contentInput.value,
            });
            showToast("已更新 ✓");
            currentDetailMemoId = null;
            setView("memo");
            await refresh();
        } catch (e) {
            console.error("[翻译插件] updateMemo failed:", e);
            showToast("保存失败");
        }
    });

    memoDetailEl.appendChild(node);
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
        await renderQADetail();
    } else if (currentView === "memo") {
        const memos = await getMemos();
        renderMemoList(memos);
    } else if (currentView === "detail-memo") {
        await renderMemoDetail();
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
            && !detailPort
        ) {
            void refresh();
        }
    }
    if (t === "memoUpdated" && currentView === "memo") {
        void refresh();
    }
});

// startup: read last_sidepanel_tab
async function init(): Promise<void> {
    try {
        const r = await chrome.storage.local.get("last_sidepanel_tab");
        const tab = r.last_sidepanel_tab as View | undefined;
        if (tab && (tab === "translate" || tab === "qa" || tab === "memo")) {
            await chrome.storage.local.remove("last_sidepanel_tab");
            setView(tab);
            await refresh();
            return;
        }
    } catch {/* ignore */}
    setView("translate");
    await refresh();
}

void init();
```

- [ ] **Step 13.2：跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

> 注：`memoUpdated` 处理也复用以更新；侧边栏 QA 详情中 finalizeBubble 三按钮也已写入。但「来自 sidepanel 的 saveQAAnswerToMemoFromSidepanel」直接广播效果会让自身列表刷新——这是无害的。

- [ ] **Step 13.3：提交**

```bash
git add src/sidepanel/index.ts
git commit -m "feat(sidepanel): memo Tab list/search/detail/edit + QA detail three-button save + last_sidepanel_tab boot"
```

🏁 **里程碑 6 + 7 完成（侧边栏备忘录 Tab + QA 详情三按钮在同一 commit 实现）。**

---

# 里程碑 8：toast 跳侧边栏

## Task 14：service-worker 处理 openSidepanel 消息

**Files:**
- Modify: `src/background/service-worker.ts`

> 侧边栏侧的「启动时读 last_sidepanel_tab」已在 Task 13 中处理。这里只需 SW 收到消息时写 storage + 调 sidePanel.open。

- [ ] **Step 14.1：在 service-worker.ts 加 openSidepanel 分支**

打开 `src/background/service-worker.ts`。找到现有的 `chrome.runtime.onMessage.addListener` 块。它当前应该是：

```ts
chrome.runtime.onMessage.addListener((msg) => {
    if (!isRuntimeMessage(msg)) return;
    if (msg.type === "openOptions") {
        chrome.runtime.openOptionsPage();
    }
});
```

替换为：

```ts
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
                console.warn("[翻译插件] sidePanel.open failed:", e);
            });
        } else {
            chrome.windows.getLastFocused().then((w) => {
                if (w.id !== undefined) {
                    chrome.sidePanel.open({ windowId: w.id }).catch((e) => {
                        console.warn("[翻译插件] sidePanel.open fallback failed:", e);
                    });
                }
            });
        }
    }
});
```

- [ ] **Step 14.2：跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 14.3：提交**

```bash
git add src/background/service-worker.ts
git commit -m "feat(sw): handle rtOpenSidepanel — set last_sidepanel_tab + open"
```

🏁 **里程碑 8 完成。**

---

# 里程碑 9：设置页备忘录区段

## Task 15：options 页加备忘录区段

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/index.ts`

- [ ] **Step 15.1：HTML 加新 section**

打开 `src/options/index.html`，在「问答」section 之后、`<div class="bar">` 之前插入：

```html
<section>
    <h2>备忘录</h2>
    <label class="checkbox-label">
        <input id="enableMemo" type="checkbox" />
        在工具栏中显示「存」按钮
    </label>
    <label class="checkbox-label">
        <input id="enableSettingsButton" type="checkbox" />
        在工具栏中显示「设」按钮（一键打开设置页）
    </label>
</section>
```

- [ ] **Step 15.2：TS 适配**

打开 `src/options/index.ts`。

`inputs` 对象末尾追加（在 `qaMaxTurns` 之后）：

```ts
    enableMemo: $<HTMLInputElement>("enableMemo"),
    enableSettingsButton: $<HTMLInputElement>("enableSettingsButton"),
```

`fillForm` 末尾追加：

```ts
    inputs.enableMemo.checked = s.enableMemo;
    inputs.enableSettingsButton.checked = s.enableSettingsButton;
```

`readForm` 返回对象末尾追加：

```ts
        enableMemo: inputs.enableMemo.checked,
        enableSettingsButton: inputs.enableSettingsButton.checked,
```

- [ ] **Step 15.3：跑全量**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 15.4：提交**

```bash
git add src/options/index.html src/options/index.ts
git commit -m "feat(options): memo section (enableMemo / enableSettingsButton)"
```

🏁 **里程碑 9 完成。**

---

# 里程碑 10：收尾

## Task 16：手测清单

**Files:** 无（仅手测）。

按下面清单逐项验证 `dist/` 加载到 Edge 的行为：

- [ ] **Step 16.1：工具栏 4 按钮**

- [ ] 选中 ≥2 字 → 工具栏出现 [翻] [问] [存] [设] 四按钮
- [ ] 设置中关掉 enableMemo → [存] 不显示
- [ ] 设置中关掉 enableSettingsButton → [设] 不显示
- [ ] 设置中关掉 enableQA → [问] 不显示，工具栏自动收窄
- [ ] 视口右边缘选区 → 整条工具栏拉回视口

- [ ] **Step 16.2：[设] 按钮**

- [ ] 点 [设] → options 页打开

- [ ] **Step 16.3：[存] 按钮**

- [ ] 选中文字点 [存] → 右上角 toast「已保存 ✓ 打开」
- [ ] 点 toast 的「打开」→ 侧边栏打开并切到「备忘录」Tab，刚保存的条目在最上

- [ ] **Step 16.4：右键菜单**

- [ ] 选中文字 → 右键 → 「保存选中到备忘录」存在
- [ ] 点击 → toast 出现 + 备忘录新增

- [ ] **Step 16.5：QA 卡片三按钮**

- [ ] [问] → 输入问题 → 答案出来后看到 [复制原文] [复制答案] [保存到备忘录]
- [ ] 点「复制原文」复制选中文本
- [ ] 点「复制答案」复制 AI 回答
- [ ] 点「保存到备忘录」→ toast「已保存 ✓ 打开」，侧边栏备忘录列表中出现这条（source 显示 💬）

- [ ] **Step 16.6：侧边栏备忘录 Tab**

- [ ] 切到「备忘录」Tab → 列表展示所有备忘录（按更新时间倒序）
- [ ] 搜索框输入关键词 → 实时过滤（标题或正文匹配）
- [ ] 点某条 → 进详情页 → 标题输入框 + 来源链接（可点跳网页）+ 正文 textarea
- [ ] 改标题/正文 → 点「保存」→ toast「已更新 ✓」+ 列表回首位
- [ ] 详情中正文清空 → 点保存 → 内联红字「正文不能为空」+ 保留在详情页
- [ ] 列表项「×」→ 立即删除
- [ ] 点「清空」→ 确认对话框 → 全清

- [ ] **Step 16.7：侧边栏 QA 详情三按钮**

- [ ] 切到「问答」Tab → 点入历史 session → 每条 AI 答案下都有 [复制原文] [复制答案] [保存到备忘录]
- [ ] 点「保存到备忘录」→ toast + 备忘录新增

- [ ] **Step 16.8：跨视图广播**

- [ ] 同时打开 QA 卡片 + 侧边栏备忘录 Tab → 在卡片中保存 → 列表自动更新

- [ ] **Step 16.9：受限页**

- [ ] `edge://extensions/` 上选中 → 工具栏不出现
- [ ] `edge://extensions/` 上右键 → 点「保存选中到备忘录」→ 通知「无法在此页面保存（受限页面）」

- [ ] **Step 16.10：toast 行为**

- [ ] 连续两次保存 → 第二个 toast 替换第一个，不堆叠
- [ ] toast 不点不操作 → 2 秒后自动消失

如有任一项失败，回到对应 Task 修补。

---

## Task 17：README + CHANGELOG 更新

**Files:**
- Modify: `README.md`

- [ ] **Step 17.1：版本徽章 + 测试数 + 头部 headline**

把：
- `version-v0.4.0-blue.svg` → `version-v0.5.0-blue.svg`
- `tests-120%20passing-brightgreen.svg` → `tests-150%20passing-brightgreen.svg`（具体根据最终测试数）
- 头部说明加入「划词收藏」一句

- [ ] **Step 17.2：功能特性表加新行**

```markdown
| 📝 **知识收藏** | 划词点 [存] / QA 答案点「保存到备忘录」/ 右键菜单 三种入口；本地保存可搜索可编辑 |
| ⚙️ **工具栏 4 档** | [翻] [问] [存] [设]，每档可独立开关；[设] 一键打开设置页 |
```

- [ ] **Step 17.3：使用方式增加备忘录段落**

```markdown
### 划词知识收藏

1. 选中网页文字 → 点工具栏 **[存]**（或右键 → 「保存选中到备忘录」）
2. 右上角 toast 提示已保存
3. 在 QA 答案下也可点「保存到备忘录」→ AI 回复 + 原文一起存入
4. 侧边栏「备忘录」Tab 看全部，支持搜索 / 编辑 / 删除
```

- [ ] **Step 17.4：配置项详解加新区段**

```markdown
### 备忘录

- **启用 [存] 按钮** (`enableMemo`)：默认开。关闭后工具栏不显示 [存]。
- **启用 [设] 按钮** (`enableSettingsButton`)：默认开。关闭后工具栏不显示 [设]。

备忘录上限沿用「历史保留上限」（`historyLimit`，默认 200 条），与翻译/问答共享同一上限。
```

- [ ] **Step 17.5：版本与发布加 v0.5.0 条目**

```markdown
### v0.5.0 (2026-05-08)

- 新增划词知识收藏：工具栏 [存] 按钮 + QA 答案「保存到备忘录」+ 右键菜单 三入口
- 新增侧边栏「备忘录」Tab：列表 + 搜索（标题+正文）+ 详情编辑 + 删除
- 工具栏新增 [设] 按钮：一键打开设置页
- QA 答案对齐翻译卡片：每条 AI 气泡含「复制原文 / 复制答案 / 保存到备忘录」
- 通用 Toast 组件（共享）：右上角 2 秒淡出，可点跳侧边栏
- 测试覆盖：N 个单元测试（含新增 memo-storage / toast 测试文件）
```

- [ ] **Step 17.6：路线图更新**

```markdown
- ✅ **v0.5.0 划词知识收藏**（已完成）
- ⏳ **v0.6.0 备忘录整理增强**（手动标签 / 按来源归组）
- ⏳ **v0.7.0 沉淀工具**（批量 Markdown 导出 / LLM 自动整理）
```

- [ ] **Step 17.7：跑全量**

```bash
npm run typecheck && npm run test
```

预期：全绿。

- [ ] **Step 17.8：提交**

```bash
git add README.md
git commit -m "docs: update README for v0.5.0 (memo + toolbar 4th)"
```

---

## Task 18：合并 + 打 v0.5.0 标签

**Files:** 无。

- [ ] **Step 18.1：合并到 main**

```bash
git checkout main
git merge --no-ff feat/memo-feature -m "merge: v0.5.0 — memo feature + toolbar 4th"
```

- [ ] **Step 18.2：升级 package.json 版本**

把 `"version": "0.4.0"` 改为 `"version": "0.5.0"`：

```bash
git add package.json
git commit -m "chore: bump version to 0.5.0"
```

- [ ] **Step 18.3：全量验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

- [ ] **Step 18.4：打标签**

```bash
git tag v0.5.0
```

- [ ] **Step 18.5：推送（征求用户同意后）**

```bash
git push origin main
git push origin v0.5.0
```

push tag 触发 `.github/workflows/release.yml` 自动构建发布。

🏁 **里程碑 10 (收尾) 完成。v0.5.0 发布。**

---

## 自检（writing-plans skill self-review）

对照 spec 检查覆盖：

| Spec 节 | 任务 |
|---|---|
| §1.1 架构（4 按钮工具栏 / Memo 集合 / Toast / 备忘录 Tab） | M1–M9 完整覆盖 |
| §1.2 关键设计点（直接写 storage、SW 路由、toast 通用化、`设` 第四档、数据驱动） | T1–T8 |
| §1.3 类型增量（Memo / Settings 两字段 / RuntimeMessage 三变体） | T1, T2 |
| §1.4 Toolbar 数据扩展 | T6 |
| §2.1 内容脚本（Toolbar 复用、Toast、qa-render、QACard、index orchestrator） | T5–T10 |
| §2.2 共享层（storage、messages、toast.css） | T2, T3, T5 |
| §2.3 后端（第 3 右键菜单、openSidepanel） | T8, T14 |
| §2.4 侧边栏（HTML 增 Tab + 模板、CSS、JS） | T11–T13 |
| §2.5 设置页（备忘录区段） | T15 |
| §3 数据流（4 条保存路径 / 跨视图广播 / toast → 跳侧边栏） | T7, T8, T10, T13, T14 |
| §4 错误处理（配额满 / 删除并发 / 受限页 / title 空回退 / 正文空校验） | T7, T8, T13, qa-card |
| §5 测试（5 个新/更新文件） | 每个 Task 含 TDD 步骤；新增 memo-storage / toast / 更新 messages / qa-render / qa-card / toolbar |

**类型一致性**：`Memo` 类型在 T1 定义，T3 / T7 / T10 / T13 一致使用；`addMemo / updateMemo / deleteMemo / clearMemos / getMemos` 在 T3 定义，所有调用方使用相同签名；`finalizeBubble` 在 T9 扩展接口，T10 / T13 一致使用。

**Placeholder 扫描**：未发现 TBD / TODO / "implement later" 等占位。每个 Step 都有具体代码或具体命令。
