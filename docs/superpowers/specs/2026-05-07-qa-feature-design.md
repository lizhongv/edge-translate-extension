# 翻译插件 v0.4.0 设计稿：划词问答 + 工具栏化浮标

**日期**：2026-05-07
**版本目标**：v0.4.0
**前置版本**：v0.3.0（划词浮标 + 双复制按钮）

---

## 0. 背景与目标

v0.3.0 已经把划词浮标做成了「单按钮 → 翻译」。本版本将其升级为**工具栏**形态，并新增**问答**功能：用户选中网页一段文字后，可以点击工具栏上的「问」按钮，对所选内容进行多轮问答（例如「请详细解释这段」「X 是什么意思」）。问答会话会保存到侧边栏，关闭卡片或刷新网页后可以重新打开继续追问。

后续版本（v0.5.0）将以同样模式加入「总结」按钮，本设计预留扩展位但不实现。

---

## 1. 架构

### 1.1 整体边界

```
   ┌──────────── Page (Content Script) ────────────┐
   │                                                │
   │  Toolbar  ──onClick──▶  FloatingCard (translate)│
   │   翻 问 …               QACard ◀───┐           │
   │                                   │ port 双向  │
   │                                   ▼           │
   └──────────────────── port "task" ──────────────┘
                                  │
   ┌────────── Service Worker ────│────────────────┐
   │                              ▼                │
   │  task router ──"translate"──▶ translator.ts   │
   │              └─"qa"────────▶ qa.ts            │
   │                       (both → llm-client.ts)  │
   │                                                │
   │  storage: history (translate) + sessions (qa)  │
   └────────────────────────────────────────────────┘
                                  │
                                  ▼
                       ┌──── Side Panel ────┐
                       │  Tabs: 翻译 | 问答  │
                       │  - 列表             │
                       │  - 点入：QASessionView│
                       └─────────────────────┘
```

### 1.2 关键设计点

- **Port 协议升级**：现有 `port "translate"` 重命名为 `port "task"`，第一条消息携带 `task: "translate" | "qa"` 区分。后端 router 派发到对应 handler。同仓单插件，同步部署，不保留旧通道。
- **Toolbar 数据驱动**：按钮列表是数组，每项 `{ id, char, label }`。v0.4.0 上 `[翻译, 问答]`；后续加「总结」只是数组多一项。设置页保留「启用浮标」开关，再加分功能 checkbox（哪些按钮入栏）。
- **Q&A 会话状态归属内容脚本**：`QACard` 自己持有 `messages: ChatMessage[]`，每次发问把整个 messages 推给后端。后端无状态，按请求拼 prompt。
- **轮数硬上限**：默认保留最近 6 轮（=12 条 user/assistant 消息），超出时丢最早一对，sourceText 不动。设置页可调（1–20）。
- **会话存档时机**：每轮 `done` 之后，QACard 把整个 session 推回后端，后端 `upsertQASession` 落 `chrome.storage.local.qa_sessions`。关闭不丢，刷新可见。
- **侧边栏继续追问**：侧边栏的 Session 详情视图复用 Q&A 的渲染纯函数（抽到 `src/shared/qa-render.ts`），但**不嵌 Shadow DOM**（侧边栏自有 document）。Port 协议复用，sessionId 复用。

### 1.3 类型增量（types.ts）

```ts
export type ChatMessage = { role: "user" | "assistant"; content: string };

export type QASession = {
  id: string;
  sourceText: string;
  pageOrigin?: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
};

export type TaskPortMessage =
  | { type: "task"; task: "translate"; text: string }
  | { type: "task"; task: "qa"; sessionId: string; sourceText: string; messages: ChatMessage[] }
  | { type: "token"; chunk: string }
  | { type: "done"; full: string }
  | { type: "error"; error: LLMError };
```

`Settings` 增量字段：

```ts
{
  enableQA: boolean;          // 默认 true，工具栏是否含问答按钮
  qaSystemPrompt: string;     // 默认见下
  qaMaxTurns: number;         // 默认 6，min 1 max 20
}
```

`qaSystemPrompt` 默认值：

```
You are a helpful assistant. The user has selected a passage of text from a webpage and will ask questions about it.
The selected text is provided as context. Answer the user's questions concisely and accurately, in the same language the user uses.
If the user's question is unrelated to the text, still try to be helpful.
Output plain text. Do not use markdown unless asked.
```

---

## 2. 组件

### 2.1 内容脚本（src/content/）

#### `Toolbar`（新增，取代 `HoverButton`）

- **职责**：划词后在选区右下角弹出一行按钮，按钮配置由数组驱动；点击某项调用对应 callback；hide 行为（mousedown/scroll/selectionchange）与 v0.3.0 一致。
- **接口**：

  ```ts
  type ToolbarAction = { id: string; char: string; label: string };
  class Toolbar {
    show(rect: DOMRect, actions: ToolbarAction[], onPick: (id: string) => void): void;
    hide(): void;
    isShown(): boolean;
    contains(target: EventTarget | null): boolean;
  }
  ```

- **依赖**：`toolbar.css?inline`、`isInEditable`（搬到 `src/content/dom-utils.ts`）。
- **MVP 按钮**：`[{id:"translate",char:"翻",label:"翻译"},{id:"qa",char:"问",label:"问答"}]`。
- **样式**：横向连体，整体一个圆角矩形 + 蓝色渐变（沿用 v0.3.0 浮标的视觉），hover 略亮 + 显示原生 title。

#### `FloatingCard`（既有，最小改动）

- 仍只服务翻译。改一处：mount 时不再硬编码标题为「翻译插件」，改为接受可选 `title` 参数（默认「翻译」），给后续 v0.5.0「总结」复用预留。

#### `QACard`（新增）

- **职责**：多轮问答的浮动卡片。状态机：`idle`（输入态）→ `streaming`（最后一条 assistant 在写）→ `idle`（可继续追问）。
- **结构**（Shadow DOM）：

  ```
  ┌─ header（标题「问答」+ 关闭 ×） ─┐
  │ ▸ 原文（折叠态，点击展开/折叠）  │
  ├─ messages（可滚动） ──────────┤
  │   你：...                     │
  │   AI：...（流式追加）          │
  │   [复制] [复制原文]            │
  ├─ input（textarea + 发送↑） ───┤
  └────────────────────────────┘
  ```

- **接口**（per-turn lifecycle）：

  ```ts
  class QACard {
    mount(rect: DOMRect | null, sourceText: string, callbacks: {
      onSend: (messages: ChatMessage[]) => void;
      onClose: () => void;
      onOpenOptions: () => void;
      onRetry: () => void;
    }): void;
    beginAssistant(): void;                   // 当前轮开始：渲染空白 AI 泡泡 + 旋转点，禁用输入框
    appendToken(chunk: string): void;          // 追加 token 到当前 AI 泡泡
    endAssistant(full: string): void;          // 当前轮成功：定稿 + 加复制按钮 + 输入框可用
    failAssistant(err: LLMError, partial?: string): void;  // 当前轮失败：红框 + 重试 + 输入框可用
    unmount(): void;
  }
  ```

- **输入框行为**：
  - `Enter` 发送，`Shift+Enter` 换行
  - 流式中输入框禁用 + 发送按钮变「停止」
  - 6 轮上限触发时，输入框上方一行灰色提示「为控制费用，仅保留最近 6 轮对话作为上下文」
- **依赖**：`qa-card.css?inline`、`getSelectionRect`（计算初始位置）、`shared/types.ChatMessage`、`shared/qa-render`（消息泡泡渲染纯函数）。

#### `src/content/index.ts`（编排器）

- 维护 `toolbar: Toolbar`、`translateCard: FloatingCard`、`qaCard: QACard`、`currentQASession: QASession | null`。
- `Toolbar.onPick(id)`：
  - `"translate"` → 既有 `handleTrigger(text)`
  - `"qa"` → 新建 `QASession{id:uuid(), sourceText:text, messages:[], ...}` → `qaCard.mount(...)` → 等用户输入 → `onSend` 时通过 Port 发 `{task:"qa", sessionId, sourceText, messages}`
- 接收侧边栏 `rtOpenQASession(sessionId)` 消息时**不**展示卡片（在侧边栏自己渲染）。

### 2.2 后端（src/background/）

#### `qa.ts`（新增）

- **职责**：Q&A 任务执行器。复用 `llm-client.stream()`，喂的是聊天历史。
- **接口**：

  ```ts
  export async function answerQA(
    sessionId: string,
    sourceText: string,
    messages: ChatMessage[],
    port: Port,
    signal: AbortSignal,
    pageOrigin?: string
  ): Promise<void>;
  ```

- **流程**：
  1. `getSettings()` → 拿 `qaSystemPrompt`、`qaMaxTurns`、`model` 等。
  2. 截断 messages 到最后 `qaMaxTurns * 2` 条。
  3. 构造请求体：

     ```
     [
       { role: "system", content: qaSystemPrompt + "\n\n---\nSelected text:\n" + sourceText },
       ...messages
     ]
     ```

  4. 调 `llm-client.stream({kind:"chat", system, messages})`。
  5. token 流式回吐 → port。
  6. `done` 之后：把完整 `assistant` 回复 append 到 messages，调 `upsertQASession(...)`，再 `chrome.runtime.sendMessage(rtQASessionUpdated(sessionId))` 广播。
- **不缓存**（多轮、状态相关）。
- **不写 history**（写专用的 `qa_sessions` store）。

#### `llm-client.ts`（小改）

- 现签名 `stream(text, target, settings, signal)` 改为接受 discriminated 输入：

  ```ts
  type StreamInput =
    | { kind: "translate"; text: string; target: string }
    | { kind: "chat"; system: string; messages: ChatMessage[] };
  export async function* stream(
    input: StreamInput,
    settings: Settings,
    signal: AbortSignal,
    fetchFn?: FetchFn
  ): AsyncGenerator<string>;
  ```

- 重试 / 错误归一化 / SSE 解析逻辑不变。`translator.ts` 同步调整调用方式。

#### `service-worker.ts`（小改）

- `chrome.runtime.onConnect`：`port.name === "task"`，根据首条消息的 `task` 字段路由：
  - `"translate"` → `translator.translate(...)`
  - `"qa"` → `qa.answerQA(...)`
- 内容脚本同步改 `chrome.runtime.connect({name:"task"})`。
- 注册新右键菜单「问答选中内容」（id: `fayichajian-qa-selection`）。
- 注册新快捷键命令 `qa`（默认未绑定，用户在 `edge://extensions/shortcuts` 自行设置，建议 Alt+Q）。

#### `storage.ts`（增量）

```ts
export async function getQASessions(): Promise<QASession[]>;
export async function upsertQASession(s: QASession): Promise<void>;
export async function deleteQASession(id: string): Promise<void>;
export async function clearQASessions(): Promise<void>;
```

存到 `chrome.storage.local.qa_sessions`，按 `updatedAt` 倒序，按 `historyLimit`（与翻译共用）截断。

### 2.3 侧边栏（src/sidepanel/）

#### Tab 切换

- 顶部 `[翻译] [问答]` 两个 tab，「清空」按钮跟随当前 tab 上下文。

#### 翻译 Tab

- 完全保留现有渲染。

#### 问答 Tab

- 列表项展示：时间 / 模型 / 轮数 / 原文首行 / 第一轮问题首行。
- 点击列表项 → 切到 Session 详情视图（同一页内切换，不开新页）：
  - 顶部「← 返回列表」
  - 完整聊天记录（所有 user/assistant 消息）
  - 底部输入框，行为与 `QACard` 一致
  - 发送时：`port "task"` 发 `{task:"qa", sessionId, sourceText, messages}`，token 追加到当前最后一条 AI 泡泡。
  - 完成后侧边栏直接更新自己的 DOM。

**关键**：侧边栏视图与 QACard 渲染抽出 `src/shared/qa-render.ts` 共享纯函数（消息泡泡 HTML 生成、复制按钮挂载），各自的 mount/event 绑定分开。

### 2.4 设置页（src/options/）

新区段「问答」，与「行为」并列，含三项：

- `enableQA`（checkbox，默认 true）：工具栏是否含问答按钮
- `qaSystemPrompt`（textarea，默认值见 §1.3）
- `qaMaxTurns`（number，默认 6，min 1 max 20）

---

## 3. 数据流

### 3.1 主流程：从划词到第一轮回答

```
[user] 选中文字
   │
   ▼
content/index.ts: mouseup → maybeShowToolbar()
   │  (检查 editable / 浮标设置 / 选区有效)
   ▼
Toolbar 显示在选区右下角  [翻] [问]
   │
   ├─ 用户点 [翻] ──▶ 既有 translate 流程（不变）
   │
   └─ 用户点 [问]
         │
         ▼
   content/index.ts: openQACard(text, rect)
         │  - 新建 session = {id:uuid, sourceText:text, messages:[], createdAt:Date.now(), ...}
         │  - qaCard.mount(rect, sourceText, callbacks)
         │  - 卡片 idle 态，输入框获焦
         ▼
   [user] 输入「请详细解释」, 按 Enter
         │
         ▼
   qaCard.onSend([{role:"user", content:"请详细解释"}])
         │
         ▼
   content/index.ts:
     - userMsg push 到 session.messages
     - qaCard.beginAssistant()  // 渲染空白 AI 泡泡 + 旋转点
     - port = chrome.runtime.connect({name:"task"})
     - port.postMessage({type:"task", task:"qa", sessionId, sourceText, messages: session.messages})
         │
         ▼
   sw/service-worker.ts: onConnect → onMessage → router
     - task==="qa" → qa.answerQA(sessionId, sourceText, messages, port, signal, pageOrigin)
         │
         ▼
   sw/qa.ts:
     - settings = await getSettings()
     - messages = truncate(messages, settings.qaMaxTurns)
     - chat = [{role:"system", content: qaSystemPrompt + "\n---\n" + sourceText}, ...messages]
     - stream({kind:"chat", system, messages: chat-without-system}, settings, signal)
     - for await chunk: port.postMessage({type:"token", chunk})
     - 全部完成 → port.postMessage({type:"done", full})
     - session.messages.push({role:"assistant", content: full})
     - session.updatedAt = Date.now()
     - upsertQASession(session)
     - chrome.runtime.sendMessage(rtQASessionUpdated(sessionId))
         │
         ▼
   content/index.ts onMessage:
     - "token" → qaCard.appendToken(chunk)
     - "done" → qaCard.endAssistant(full); session.messages.push assistant；卡片回到 idle
     - "error" → qaCard.failAssistant(err, partial)
```

### 3.2 追问

完全复用上面链路；区别只是 messages 数组里已有前几轮内容。每轮独立开 Port 一次（短连接 per turn），与翻译现状一致。

### 3.3 关闭与丢失

- 用户**点关闭** / **按 Esc** / **点卡片外**：`qaCard.unmount()` + `port.disconnect()`。session 已在每轮 done 时写入 storage，不丢。
- 网页**刷新**：content script 死掉，session 已在 storage。
- 流式中关闭：`signal.abort()` 终止当前 fetch，**当前轮的 partial assistant 不写入 session**（避免半截回答污染历史）。

### 3.4 侧边栏继续追问

```
[user] 在侧边栏问答 Tab 点击某条 session
   ▼
sidepanel: 切到 Session 详情视图，渲染 messages
   ▼
[user] 在底部输入框输入新问题，发送
   ▼
sidepanel: 走与 content/index.ts.onSend 完全一致的路径
   - 唯一区别：消息渲染目标是 sidepanel 的 DOM（非 Shadow DOM）
   - port = chrome.runtime.connect({name:"task"})
   - 收到 token 时调 qa-render.appendToken(messagesEl, chunk)
```

后端**不知道**请求来自卡片还是侧边栏。`upsertQASession` 落盘后广播 `rtQASessionUpdated(sessionId)`，**任何**未发送方的视图刷新自己。

### 3.5 RuntimeMessage 增量

```ts
export type RuntimeMessage =
  | { type: "showCard"; text?: string }                 // 既有
  | { type: "requestTranslate" }                        // 既有
  | { type: "historyUpdated" }                          // 既有
  | { type: "qaSessionUpdated"; sessionId: string }     // 新增
  | { type: "openQA"; text?: string }                   // 新增（右键 / Alt+Q 用）
  | { type: "openOptions" };                            // 既有
```

---

## 4. 错误处理

### 4.1 错误来源与处理策略

| 错误来源 | 表现 | 处理 |
|---|---|---|
| API Key 未填 / 401 / 403 | `LLMError{code:"auth"}` | QACard 显示 ⚠️ + 「打开设置」，**不入 session 历史** |
| 429 限流 | `LLMError{code:"rate_limit", retryable:true}` | `llm-client.ts` 重试链生效；耗尽后显示 ⚠️ + 「重试」 |
| 网络断开 / TypeError | `LLMError{code:"network", retryable:true}` | 同上 |
| 5xx | `LLMError{code:"unknown", retryable:status>=500}` | 同上 |
| 上下文超长 400 | `LLMError{code:"context_too_long"}` | 显示 ⚠️「对话过长，请关闭重新提问」+ 「打开设置」（提示降低 `qaMaxTurns`） |
| 流中断 | `LLMError{code:"bad_response"}` | partial 显示，**不写入 session**；按钮：「重试」「复制部分」「关闭」 |
| 用户主动 abort | `code:"aborted"` | 静默；当前轮回滚（partial AI 泡泡删除，最后一条 user message 回滚到输入框） |

### 4.2 重试语义

- **「重试」按钮**：用 messages 数组**当前的状态**（已有 user message，无 assistant 或失败的）重发一次。后端不感知是重试。
- **追问轮失败**：失败的那条 assistant 留红色框 + 「重试」。重试不重复 push user message。
- **半截 partial**：失败时 QACard 内可见，但 `setError` 不会把 partial 写进 messages 数组；用户可手动「复制」保存。

### 4.3 边界状态

- **sourceText 为空**：toolbar 不会出现（`text.length < 2` 时不展示），兜底 QACard.mount 收到空 sourceText 时直接 unmount + 控制台 warn。
- **session 写入失败**（配额）：catch + console.warn，不影响 UI；用户能看到回答，下次重启会丢失。`historyLimit` 默认 200，按 LRU 截断。
- **侧边栏与卡片同时改一个 session**：`upsertQASession` 用乐观「最后写入胜出」（`updatedAt` 比较）。代价是极端竞态下丢一轮。可接受。
- **多标签页同时问答**：每个标签页自己的 QACard / session，互不干扰。Port 之间也独立。

### 4.4 受限页

- chrome:// / edge:// / 扩展页 / file:// 内容脚本不注入，工具栏不出现。
- 右键「问答选中内容」点击时 `isRestrictedUrl(tab.url)` 命中后弹通知「无法在此页面问答（受限页面）」。
- 快捷键 Alt+Q 同上。

---

## 5. 测试

延续 vitest + jsdom + 81 个单测的风格。新增覆盖：

### 5.1 单元测试（新增）

| 文件 | 测什么 |
|---|---|
| `tests/toolbar.test.ts` | `Toolbar.show()` 渲染按钮数；`onPick` 回调 id 正确；`hide()` 后 `isShown===false`；`computePosition` 视口边界回弹 |
| `tests/qa-card.test.ts` | mount/unmount；输入框 Enter 触发 `onSend`，Shift+Enter 换行；`beginAssistant` 渲染空泡泡且禁用输入；`appendToken` 追加到最后 AI 泡泡；`endAssistant` 后输入框可再次输入；`failAssistant` 渲染错误状态；6 轮上限提示行出现 |
| `tests/qa.test.ts` | `answerQA` 调用 `streamFn` 入参 messages 含 system+sourceText+history；超过 `qaMaxTurns` 时截断旧消息；done 后调用 `upsertQASession`；error 时不写 session |
| `tests/qa-storage.test.ts` | `upsertQASession` 按 id 更新；`getQASessions` 按 updatedAt 排序；`historyLimit` 截断；`deleteQASession` / `clearQASessions` 行为 |
| `tests/qa-render.test.ts` | 共享渲染函数：`renderMessage`, `appendToken`, 复制按钮挂载（DOM-level，不依赖 Shadow） |

### 5.2 既有测试小改

- `tests/llm-client.test.ts`：现有 `stream(text, target, ...)` 测试更新为 `stream({kind:"translate",...})`；新增 `{kind:"chat", system, messages}` 路径的 SSE 解析测试。
- `tests/messages.test.ts`：新增 `qaSessionUpdated` / `openQA` 类型的构造器与 type guard 测试。
- `tests/storage.test.ts`：确认翻译相关 API 不被 QA 字段干扰。

### 5.3 不写自动化的部分（手测清单）

- 工具栏在选区不同位置（左上、右下、视口边缘）的回弹效果
- QACard 在长会话时的滚动行为、输入框禁用态
- 侧边栏 Tab 切换、Session 详情进入/返回、追问后列表更新
- 右键「问答选中内容」+ `Alt+Q` 快捷键
- 受限页 / 编辑区 / iframe 中的行为
- DeepSeek 真实接口的多轮回答质量

每完成一个里程碑后跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## 6. 范围外（YAGNI）

下列功能本版本**不做**，留给后续：

- **总结按钮**：v0.5.0。本设计预留 `Toolbar` 数据驱动、`FloatingCard` 标题参数化等扩展点。
- **多轮对话超过 20 轮的滑动窗口策略**：当前简单截断已够用。
- **Q&A 缓存**：状态相关，不做。
- **预设快捷提示词 chip**：用户已明确不要。
- **markdown 渲染**：默认纯文本。如未来要加，再讨论。
- **Q&A 与翻译用不同的 API/Model**：当前共用一份 Settings。

---

## 7. 里程碑划分（实现计划用）

实现计划（writing-plans 阶段）会基于以下里程碑划分任务：

1. **Foundation**：types / messages / Settings / storage 增量；llm-client 的 `StreamInput` 改造；既有翻译流不破。
2. **Toolbar**：取代 HoverButton，单测通过，翻译路径验证不退化。
3. **QACard + qa.ts + Port 路由**：完成单轮问答主流程，单测通过。
4. **多轮追问 + 截断 + 错误处理**。
5. **侧边栏 Tab + Q&A 列表 + Session 详情视图 + 追问**。
6. **设置页问答区段**。
7. **右键菜单 + 快捷键**。
8. **手测清单 + 文档（README / CHANGELOG）+ 打 v0.4.0 标签**。

---

## 8. 与既有版本的兼容性

- **Settings 兼容**：新增字段 `enableQA / qaSystemPrompt / qaMaxTurns`，老用户首次升级时 `getSettings()` 自动 merge `DEFAULT_SETTINGS`，行为保持原样（启用问答、默认提示词、6 轮）。
- **Storage 兼容**：新增 `qa_sessions` key，与既有 `history` 互不干扰。
- **Port name 改动**：从 `"translate"` 改为 `"task"`，**只**影响 content↔SW 通信，没有外部调用方。一次性升级，无平滑期。
- **manifest 改动**：commands 加一项 `qa`，contextMenus 加一项 `fayichajian-qa-selection`。
