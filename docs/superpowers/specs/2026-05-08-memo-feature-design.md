# 翻译插件 v0.5.0 设计稿：备忘录（划词知识收藏）+ 工具栏第四档

**日期**：2026-05-08
**版本目标**：v0.5.0
**前置版本**：v0.4.0（工具栏 + 划词问答）

---

## 0. 背景与目标

v0.4.0 已让用户在网页上「翻译」+「问答」。本版本加入「保存」能力——用户能把选中的知识点（原文）或 AI 回答一键存到本地备忘录，未来再回头查看/编辑/搜索。同时工具栏额外加一个「设置」快捷入口，让 v0.4 已建立的数据驱动工具栏初次发挥扩展性。

参考 Monica 插件的「知识收藏」体验，但走轻量私有路线：纯本地存储、不做云同步、聚焦个人沉淀。

---

## 1. 架构

### 1.1 整体边界

```
   ┌──────────── Page (Content Script) ────────────┐
   │                                                │
   │  Toolbar: [翻] [问] [存] [设]                  │
   │             │    │    │    └─→ rtOpenOptions   │
   │             │    │    └─→ saveSelectionAsMemo  │
   │             │    └─→ QACard (existing)         │
   │             └─→ TranslateCard (existing)       │
   │                                                │
   │  Toast (新增 shared/toast.ts)                  │
   │    "已保存 ✓ 打开"                         │
   │                                                │
   │  QACard: 每条 AI 气泡                          │
   │    [复制原文] [复制答案] [保存到备忘录]        │
   └────────────────────────────────────────────────┘
                                  │
                                  ▼ direct storage call OR rtSaveMemo
   ┌────────── Service Worker / shared/storage ────┐
   │                                                │
   │  storage:                                      │
   │    history (translate)                         │
   │    qa_sessions (qa)                            │
   │    memos (新增)                                │
   │                                                │
   │  右键菜单：「保存选中到备忘录」                │
   │    → dispatchToTab(rtSaveMemo)                 │
   │                                                │
   │  rtOpenSidepanel({tab})                        │
   │    → 写 last_sidepanel_tab + sidePanel.open    │
   └────────────────────────────────────────────────┘
                                  │
                                  ▼
                       ┌──── Side Panel ────┐
                       │  Tabs: 翻译 | 问答 | 备忘录│
                       │  备忘录列表（搜索 + 卡片）│
                       │  备忘录详情（编辑/保存/删除）│
                       │  QA 详情每条 AI 同步三按钮  │
                       └─────────────────────┘
```

### 1.2 关键设计点

- **存储独立**：新 key `chrome.storage.local.memos`，与 `history` / `qa_sessions` 互不影响。沿用 `historyLimit`（共用）作为上限——保持设置数量克制。
- **保存路径分两类**：
  - 内容脚本直接调 `addMemo()`（划词工具栏 [存]、QA 卡片「保存」按钮）：节省一次 SW round-trip
  - SW 路径（右键菜单）：`dispatchToTab(rtSaveMemo(text, pageUrl, pageTitle))`，由内容脚本接收并调 `addMemo()`——只为复用现有的 dispatch 模式
- **toast 通用化**：抽 `src/shared/toast.ts`（独立 Shadow DOM 浮窗，固定右上角，2 秒淡出，可点跳侧边栏）。这个组件 v0.5.0 仅用于「已保存」，但接口设计上通用，未来加错误 toast 等也可复用。
- **工具栏 `设` 按钮**：纯导航，不读 selection。点击发 `rtOpenOptions()` 让 SW 调 `chrome.runtime.openOptionsPage()`。位置在最右与功能键分隔可视。
- **QA AI 气泡三按钮**：`[复制原文] [复制答案] [保存到备忘录]`，与翻译卡片的「复制原文/复制译文」对齐风格。侧边栏 QA 详情同步。
- **数据驱动**：`TOOLBAR_ACTIONS` 数组从 v0.4 的 2 项扩到 4 项；每项可在设置页 checkbox 关掉。
- **备忘录侧边栏 Tab**：完全复用 v0.4 Tab 模式——加第三个 Tab 「备忘录」。详情视图也跟 QA 详情同构（顶部 `← 返回 [删除]`、中部多字段、底部 `[取消][保存]`）。

### 1.3 类型增量（types.ts）

```ts
export type MemoSource = "selection" | "qa";

export type Memo = {
  id: string;
  title: string;            // 默认首 30 字截取，可后期编辑
  content: string;          // 正文（选中文本 / AI 回答）
  source: MemoSource;
  sourceContext?: string;   // 仅 source==="qa"：原始选中文本
  pageUrl?: string;
  pageTitle?: string;
  createdAt: number;
  updatedAt: number;
};
```

`Settings` 增量：

```ts
{
  enableMemo: boolean;             // 默认 true，工具栏含 [存]
  enableSettingsButton: boolean;   // 默认 true，工具栏含 [设]
}
```

`RuntimeMessage` 增量：

```ts
| { type: "saveMemo"; text: string; pageUrl?: string; pageTitle?: string }
| { type: "memoUpdated" }
| { type: "openSidepanel"; tab?: "translate" | "qa" | "memo" }
```

### 1.4 工具栏数据结构升级

```ts
const TOOLBAR_ACTIONS: ToolbarAction[] = [
  { id: "translate", char: "翻", label: "翻译" },
  { id: "qa",        char: "问", label: "问答" },
  { id: "memo",      char: "存", label: "保存到备忘录" },
  { id: "settings",  char: "设", label: "打开设置" },
];
```

`maybeShowToolbar()` 从 settings 读 `enableQA / enableMemo / enableSettingsButton` 三个开关过滤。`enableHoverButton` 总开关保留——关掉则整条不显示。

---

## 2. 组件

### 2.1 内容脚本（src/content/）

#### `Toolbar`（既有，仅数据扩展）

不改类，只改 `content/index.ts` 中的 `TOOLBAR_ACTIONS` 数组（§1.4）+ 新增 `id` 分支处理。`Toolbar.show` 已是数据驱动，按钮数自动从 2 → 4。位置算法 `rect.right - 28*N` 也已自动适配。

#### `Toast`（新增，shared 组件）

- **职责**：右上角浮窗，2 秒后自动消失。Shadow DOM 隔离，可点击触发回调。
- **位置**：`src/shared/toast.ts`（也可被 sidepanel/options 调用）。
- **接口**：
  ```ts
  export function showToast(message: string, options?: {
    actionLabel?: string;        // 例如 "点击打开"
    onAction?: () => void;       // 点 actionLabel 触发
    durationMs?: number;         // 默认 2000
  }): void;
  ```
- **实现**：单例（多次调用替换上一条）。Shadow DOM 注入 toast.css。点击 actionLabel → 调用 onAction，自动关闭。
- **依赖**：`toast.css?inline`。

#### `qa-render.ts`（既有，**finalizeBubble 接口扩展**）

签名扩展：

```ts
finalizeBubble(
  bubble: HTMLElement,
  fullContent: string,
  options?: {
    sourceText?: string;         // 提供则加 [复制原文]
    extraActions?: { label: string; onClick: () => void }[];
  }
): void
```

行为：
- 默认按钮文字从 v0.4 的 `复制` **改为 `复制答案`**（更精确，与翻译卡片的 `复制译文` 对齐风格）
- 若 `sourceText` 提供，加 `[复制原文]` 按钮（点击复制 sourceText）
- `extraActions` 里的项追加渲染（用于 `保存到备忘录`）

对 v0.4 的兼容：`tests/unit/qa-render.test.ts` 的相关断言（`expect(btn.textContent).toBe("复制")`）需更新为 `"复制答案"`。

#### `QACard`（既有，**改 endAssistant 调用 finalizeBubble**）

`endAssistant(full)` 调用 finalizeBubble 时改为：

```ts
finalizeBubble(bubble, full, {
  sourceText: this.sourceText,
  extraActions: [{
    label: "保存到备忘录",
    onClick: () => saveQAAnswerAsMemo(full, this.sourceText),
  }],
});
```

新增私有 `saveQAAnswerAsMemo(answer, sourceContext)`：调 `addMemo({ source:"qa", content:answer, sourceContext, pageUrl, pageTitle })`，调 `showToast`。

#### `content/index.ts`（编排器）

- `TOOLBAR_ACTIONS.onPick(id)` 增加两个分支：
  - `id === "memo"` → 调 `saveSelectionAsMemo(text)`
  - `id === "settings"` → `chrome.runtime.sendMessage(rtOpenOptions())`
- 新增 `saveSelectionAsMemo(text, pageUrl?, pageTitle?)`：缺省时取 `location.href` / `document.title`，调 `addMemo({source:"selection", content:text, ...})`，showToast。
- 新增 `chrome.runtime.onMessage` 分支：`m.type === "saveMemo"` → 走同一路径。
- `maybeShowToolbar()` 按 `enableQA / enableMemo / enableSettingsButton` 过滤 actions。

### 2.2 共享层（src/shared/）

#### `storage.ts`（增量）

```ts
const MEMOS_KEY = "memos";

export async function getMemos(): Promise<Memo[]>;
export async function addMemo(input: Omit<Memo, "id" | "createdAt" | "updatedAt">): Promise<Memo>;
export async function updateMemo(id: string, patch: Partial<Pick<Memo, "title" | "content">>): Promise<void>;
export async function deleteMemo(id: string): Promise<void>;
export async function clearMemos(): Promise<void>;
```

- `getMemos()`：按 `updatedAt desc` 排序。
- `addMemo()`：生成 id（uuid 同 qa）；如 `input.title` 缺省则 `title = input.content.slice(0, 30).replace(/\n/g, " ").trim()`；`createdAt = updatedAt = Date.now()`；按 `historyLimit` 截断旧条目。返回完整 Memo 让调用方拿到 id。调用方负责广播 `rtMemoUpdated()`。
- `updateMemo()`：只允许改 title / content，自动更新 updatedAt。如果 title 为空字符串，回退到 content 截取。
- `deleteMemo()` / `clearMemos()`：直观。

#### `messages.ts`（增量）

```ts
export const rtSaveMemo = (text: string, pageUrl?: string, pageTitle?: string): RuntimeMessage =>
    ({ type: "saveMemo", text,
       ...(pageUrl ? { pageUrl } : {}),
       ...(pageTitle ? { pageTitle } : {}) });

export const rtMemoUpdated = (): RuntimeMessage => ({ type: "memoUpdated" });

export const rtOpenSidepanel = (tab?: "translate" | "qa" | "memo"): RuntimeMessage =>
    tab ? { type: "openSidepanel", tab } : { type: "openSidepanel" };
```

`isRuntimeMessage` 守卫的已知类型表加 `saveMemo / memoUpdated / openSidepanel`。

#### `toast.css`（新增）

蓝灰背景 + 白字 + 圆角 + 渐入渐出 + 右上角 fixed 定位。约 30 行。

### 2.3 后端（src/background/service-worker.ts）

- 注册第 3 个右键菜单：`MENU_MEMO_ID = "fayichajian-memo-selection"` → 「保存选中到备忘录」。
- `chrome.contextMenus.onClicked` 增加 `else if (info.menuItemId === MENU_MEMO_ID)`：分发 `rtSaveMemo(info.selectionText, tab.url, tab.title)`。受限页守卫沿用 v0.4 的 `notifyRestricted("保存")`。
- 新增 `chrome.runtime.onMessage` 分支：`msg.type === "openSidepanel"` →
  1. 把 `msg.tab` 写入 `chrome.storage.local.last_sidepanel_tab`（用于侧边栏启动时切 Tab）
  2. 调 `chrome.sidePanel.open({ windowId: sender.tab?.windowId ?? lastFocusedWindow.id })`
  3. catch 失败：忽略（fallback 由 toast 调用处处理）

### 2.4 侧边栏（src/sidepanel/）

#### `index.html`（增量）

- 顶部 Tab 增加第三项：`<button class="tab" data-tab="memo">备忘录</button>`
- 新 section 容器：`<section id="list-memo" class="view"></section>`、`<section id="detail-memo" class="view detail"></section>`
- 新搜索框（仅在备忘录 Tab 显示）：`<input id="memo-search" placeholder="搜索...">`
- 新模板 `memo-item-tpl`、`memo-detail-tpl`

#### `index.ts`（增量）

- `View` 类型增加 `"memo"` 和 `"detail-memo"`
- 新增 `renderMemoList(query?)`：`getMemos()` → 过滤 `query`（title.includes || content.includes，case-insensitive）→ 渲染卡片
- 新增 `renderMemoDetail(id)`：取单条 memo，渲染 title 输入框 + 来源行（pageTitle + 可点 URL 跳转）+ content textarea + 保存/取消/删除
- `setView` 扩展：备忘录 Tab 时显示 search 框，备忘录详情 Tab 时隐藏
- 监听 `rtMemoUpdated` → 当前在 `memo` 列表时刷新
- 启动时读 `chrome.storage.local.last_sidepanel_tab` → setView 到对应 Tab，读完清掉 key
- QA 详情视图渲染历史时，每条 AI 已用 finalizeBubble，自动获得三按钮（含「保存到备忘录」回调指向 sidepanel 的 `saveQAAnswerAsMemo`）

#### `sidepanel.css`（增量）

- 备忘录列表卡片样式（类似 QA item，加 `📝/💬` 图标区分 source）
- 详情页表单样式（标题输入框 + 来源链接 + 大 textarea）
- 搜索框样式

### 2.5 设置页（src/options/）

新区段「备忘录」（与「问答」并列）：

- `enableMemo`（checkbox，默认 true）：工具栏含 `[存]`
- `enableSettingsButton`（checkbox，默认 true）：工具栏含 `[设]`

`historyLimit` 作为通用列表上限不变（适用于翻译/问答/备忘录）。

---

## 3. 数据流

### 3.1 划词工具栏 [存]

```
[user] 选中文字 → 工具栏出现
[user] 点 [存]
   ▼
toolbar.onPick("memo")
   ▼
saveSelectionAsMemo(text):
  - addMemo({
      source: "selection",
      content: text,
      pageUrl: location.href,
      pageTitle: document.title,
    })
  - showToast("已保存 ✓", { actionLabel: "打开", onAction: openMemoTab })
  - sendMessage(rtMemoUpdated())
```

### 3.2 QA 卡片「保存到备忘录」

```
[user] QA 卡片中 endAssistant 完成 → finalizeBubble 渲染 [复制原文][复制答案][保存到备忘录]
[user] 点「保存到备忘录」
   ▼
saveQAAnswerAsMemo(answer, this.sourceText):
  - addMemo({
      source: "qa",
      content: answer,
      sourceContext: this.sourceText,
      pageUrl: location.href,
      pageTitle: document.title,
    })
  - showToast + sendMessage(rtMemoUpdated())
```

### 3.3 侧边栏 QA 详情「保存到备忘录」

```
[user] 在侧边栏问答详情看 AI 历史回复（已 finalizeBubble 渲染三按钮）
[user] 点某条「保存到备忘录」
   ▼
saveQAAnswerAsMemo(answer, detailSession.sourceText):
  - addMemo({
      source: "qa",
      content: answer,
      sourceContext: detailSession.sourceText,
      pageUrl: detailSession.pageOrigin,    // 注：仅 origin，无 path/title
      pageTitle: undefined,
    })
  - showToast(在 sidepanel 自己的 document 内)
  - sendMessage(rtMemoUpdated())  ← 自身视图也会刷新（无害冗余）
```

### 3.4 右键菜单「保存选中到备忘录」

```
[user] 选中文字 → 右键 → 「保存选中到备忘录」
   ▼
SW: chrome.contextMenus.onClicked
  - 受限 URL 检查 → notifyRestricted("保存")
  - dispatchToTab(tabId, rtSaveMemo(info.selectionText, tab.url, tab.title))
   ▼
content/index.ts: chrome.runtime.onMessage(saveMemo)
  - saveSelectionAsMemo(text, pageUrl, pageTitle)
   ▼
后续与 §3.1 一致
```

### 3.5 备忘录列表 → 详情 → 编辑 → 保存

```
[user] 侧边栏切到「备忘录」Tab
   ▼
renderMemoList():
  - getMemos() (按 updatedAt desc)
  - 过滤 memo-search 关键词
  - 渲染卡片：图标 + 标题 + 来源 + 摘要 + 时间
[user] 点某条
   ▼
setView("detail-memo") + renderMemoDetail(id)
  - getMemos() → find by id
  - 渲染：title input、source row（可点 URL 跳转）、content textarea
[user] 改 title 或 content → 点 [保存]
   ▼
updateMemo(id, { title, content })
[user] 自动返回列表 + showToast("已更新 ✓")
   ▼
sendMessage(rtMemoUpdated()) → 列表自动重排（这条到顶）
```

### 3.6 跨视图广播

```
任意保存/更新 → addMemo or updateMemo
                 ↓
        sendMessage(rtMemoUpdated())
                 ↓
   ┌─────────────┴──────────────┐
   ▼                            ▼
 sidepanel                  其他打开的标签页
 (如在 memo Tab)            content scripts
 → refresh()                → 不处理
```

### 3.7 toast 点击 → 跳侧边栏并切 Tab

```
toast.actionLabel="打开" 被点击
   ▼
chrome.runtime.sendMessage(rtOpenSidepanel("memo"))
   ▼
SW 收到 openSidepanel:
  - chrome.storage.local.set({ last_sidepanel_tab: "memo" })
  - chrome.sidePanel.open({ windowId })  ← 借 toast 点击的用户手势
   ▼
sidepanel 加载/显示
  - 启动时读 last_sidepanel_tab → setView("memo")
  - 读完后清掉这个 key
```

> sidePanel.open 必须在用户手势同步上下文调用。toast 点击 → sendMessage → SW 调 open，中间有异步边界，理论上手势可能失效。**降级方案**：失败时 toast 改为 `"已保存 ✓ 请点击工具栏插件图标查看"`。MVP 先尝试 open，有失败案例再调整。

---

## 4. 错误处理

| 来源 | 表现 | 处理 |
|---|---|---|
| `chrome.storage.local.set` 配额满（10MB） | rejected promise | catch + toast 显示「保存失败：存储空间不足，请清理旧条目」 |
| `addMemo` 调用时 `getMemos` 解析失败（脏数据） | unexpected | 回退到空数组、log warn、继续 add（不中断用户） |
| 详情页保存时 `updateMemo` 找不到 id（被并发删除） | 罕见 | catch + toast「该条已被删除」+ 自动返回列表 |
| 右键菜单在受限页 | 受限 URL 检查失败 | `notifyRestricted("保存")` 通知（沿用 v0.4 的多 action 参数） |
| toast 单例并发：连续两次保存 | 第二个 toast 替换第一个 | 故意行为，只显示最新（避免堆叠） |
| toast actionLabel 点击触发 `sidePanel.open` 失败 | 手势丢失 / 不在用户活动 | catch + toast 文案「请点击插件图标查看」（fallback） |
| 编辑时 title 清空保存 | 用户清空标题 | 保存时 `title.trim()` 为空 → 自动回退到 `content.slice(0, 30)` |
| 编辑时 content 清空保存 | 用户清空正文 | 阻止保存 + 详情页内联红字「正文不能为空」 |

错误处理优先用 toast 而不是 alert：保持轻量、不打断阅读。仅「正文不能为空」这种内联校验例外。

---

## 5. 测试

延续 vitest + jsdom 风格，新增 5 个测试文件 + 既有更新。

### 5.1 单元测试（新增/更新）

| 文件 | 测什么 |
|---|---|
| `tests/unit/memo-storage.test.ts` | `addMemo` 自动生成 id + title 截取（首 30 字、换行替空格）；按 `historyLimit` 截断；`getMemos` 按 updatedAt 排序；`updateMemo` 更新 updatedAt 且仅允许改 title/content；`deleteMemo`、`clearMemos` 正确性；`addMemo` 输入显式 title 时不覆盖；title 清空回退 |
| `tests/unit/toast.test.ts` | `showToast` 创建单例 host；2 秒后自动消失；连续调用替换旧 toast；actionLabel 点击触发 onAction 并立即关闭；options 缺省时不显示 actionLabel |
| `tests/unit/messages.test.ts`（更新） | 新增 `rtSaveMemo` / `rtMemoUpdated` / `rtOpenSidepanel` 构造器与守卫测试 |
| `tests/unit/qa-render.test.ts`（更新） | `finalizeBubble` 默认按钮文字改为「复制答案」；`sourceText` 提供时渲染「复制原文」+ 点击复制 sourceText；`extraActions` 各项渲染 + 点击触发 onClick |
| `tests/unit/qa-card.test.ts`（更新） | `endAssistant(full)` 调用 finalizeBubble 时传入正确的 sourceText + extraActions；点「保存到备忘录」触发回调；点「复制原文」复制 sourceText；点「复制答案」复制 full |
| `tests/unit/toolbar.test.ts`（更新） | 4 个按钮的渲染（翻/问/存/设）、对应 onPick(id) 都正确 |

### 5.2 不写自动化的部分（手测清单）

- 工具栏 4 按钮在不同选区位置的回弹（多了 56px 宽度，可能更多触发右边缘溢出）
- toast 在不同视口尺寸下的可见性
- toast 点击 → `sidePanel.open` 成功率（不同浏览器版本）
- 备忘录列表在 200 条上限时的滚动 + 搜索
- 备忘录详情编辑保存后的列表自动重排
- 右键「保存选中到备忘录」+ 受限页通知
- 工具栏 [设] 按钮跳设置页的体验
- QACard 三按钮 + 侧边栏 QA 详情三按钮表现一致
- 设置页关掉 enableMemo / enableSettingsButton 后工具栏正确减项

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## 6. 范围外（YAGNI）

下列功能本版本**不做**，留给后续：

- **手动标签 / 分类**：v0.6.0 再做。`Memo` 类型不预留 `tags` 字段——加字段时再说，避免「保留位但永远不用」。
- **批量导出 Markdown**：v0.7.0。
- **LLM 自动整理**（多条合并为结构化笔记）：v0.7.0+。
- **跨设备同步**：v0.7.0+，需切到 `storage.sync` 或外部存储，是大改动。
- **去重**：同段文字多次保存会存多份。MVP 不做去重。
- **按来源页面归组视图**：v0.6.0+。
- **memo 单独的 limit 设置**：先沿用 `historyLimit`。
- **markdown 渲染备忘录正文**：先纯文本。

---

## 7. 里程碑划分（实现计划用）

实现计划（writing-plans 阶段）会基于以下里程碑划分任务：

1. **Foundation**：types / messages / storage / settings 增量。完成后既有翻译、问答流仍跑通。
2. **Toast**：通用组件 + 单测。
3. **Toolbar 第四档 + 设置按钮**：[设] 跳设置页可用。
4. **划词保存（[存] + 右键菜单）**：完整路径 + toast。
5. **QA 卡片三按钮**：finalizeBubble 接口扩展 + QACard 调用更新。
6. **侧边栏备忘录 Tab**：列表 + 搜索 + 详情 + 编辑/删除。
7. **侧边栏 QA 详情同步三按钮**：saveQAAnswerAsMemo from sidepanel。
8. **toast → 跳侧边栏 切 Tab**：rtOpenSidepanel + last_sidepanel_tab 机制。
9. **设置页备忘录区段**：两 checkbox。
10. **手测清单 + README/CHANGELOG + 打 v0.5.0 标签**。

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## 8. 与既有版本的兼容性

- **Settings 兼容**：新增 `enableMemo / enableSettingsButton`，老用户首次升级时 `getSettings()` 自动 merge `DEFAULT_SETTINGS`，行为保持原样（启用备忘录、设置按钮）。
- **Storage 兼容**：新增 `memos` key、`last_sidepanel_tab` key，与既有 `history` / `qa_sessions` 互不干扰。
- **finalizeBubble 接口扩展**：新增可选 options 参数，不传时与 v0.4 行为一致（除按钮文字「复制」→「复制答案」）。这一字面变化会更新 v0.4 的相关测试断言。
- **Toolbar 数据扩展**：原 2 项 → 4 项，老 settings 文件没有 `enableMemo / enableSettingsButton` 字段时按默认（true）显示。
- **manifest 改动**：contextMenus 加一项 `fayichajian-memo-selection`；其他不变。
