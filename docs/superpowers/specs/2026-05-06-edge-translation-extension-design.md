# 法译查鉴 · Edge 翻译扩展设计文档

- 日期：2026-05-06
- 状态：草案，待用户审阅
- 目标平台：Microsoft Edge（Manifest V3，Chromium 内核同样兼容 Chrome）

---

## 1. 概述

一个浏览器扩展，让用户在网页上**用鼠标左键划词、右键点击菜单**（或快捷键）调用 OpenAI 兼容的大模型 API 翻译选中的文本。译文通过浮动卡片在选区附近**流式逐字呈现**，并自动沉淀到侧边栏历史中。所有 LLM 配置（Base URL、API Key、Model、System Prompt、temperature、自定义请求头）以及目标语言、阈值、快捷键均可在设置页配置。

### 1.1 用户视角的核心交互

1. 用户在任意网页用左键划词。
2. 在选中文字上右键，浏览器菜单出现 **"翻译选中内容"** 项（仅在有选区时出现）；或按下快捷键 `Alt+T`。
3. 选区附近弹出浮动卡片，显示"翻译中…"，随后译文逐字流入。
4. 译文完成后卡片显示**复制**按钮；同一段文字下次再翻命中本地缓存，瞬间显示。
5. 工具栏图标点击可打开侧边栏，浏览全部翻译历史，支持重看 / 复制 / 删除 / 一键清空。
6. 设置页可配置 LLM 参数、目标语言、第二语言、长文阈值、历史上限、快捷键。

### 1.2 范围（in / out）

**v1 包含：**

- 右键菜单翻译（`contexts: ["selection"]`）
- 全局快捷键（默认 `Alt+T`，可改）
- 浮动卡片（Shadow DOM 注入）+ 流式渲染
- 侧边栏历史视图（被动累积）
- OpenAI 兼容 API（Base URL + Key + Model + System Prompt + temperature + 自定义 headers）
- 智能反向：选中文字若以中文为主自动翻为第二语言（由 prompt 完成，无需客户端语言判定）
- 持久化历史（默认 200 条）+ 命中缓存（同 text + target + model 不重复调 API）
- 长文软提示（默认阈值 5000 字符，可改）
- 错误归一化与有限自动重试

**v1 不包含（明确 YAGNI）：**

- 多套配置切换（用户只配一套）
- 划词浮标（选区右上角小图标）
- 对话式追问 / 长文分段并行
- PDF 内嵌阅读器内的翻译（`pdf.js` viewer 受限，列入已知限制）
- iframe 内复杂选区的特殊处理
- 视觉回归测试 / CI E2E

---

## 2. 架构

Manifest V3 扩展由四个独立运行时协作；通信靠消息传递。

```
┌──────────────────────────────────────────────────────────────────────┐
│  浏览器进程                                                          │
│                                                                      │
│  ┌─────────────────┐        ┌──────────────────────────────────────┐ │
│  │  Service Worker │        │  网页 Tab                            │ │
│  │  (background)   │◄──────►│  ┌────────────────────────────────┐  │ │
│  │                 │ 长连接 │  │  Content Script (Shadow DOM)   │  │ │
│  │  - LLM 调用     │  port  │  │  - 监听选区、注入浮动卡片      │  │ │
│  │  - SSE 解析     │        │  │  - 接 background 推送的 token  │  │ │
│  │  - 缓存/历史    │        │  └────────────────────────────────┘  │ │
│  │  - 右键菜单     │        └──────────────────────────────────────┘ │
│  │  - 快捷键       │                                                 │
│  │  - 限流/重试    │        ┌──────────────────────────────────────┐ │
│  └────────┬────────┘ ◄────► │  Side Panel  (历史 / 详情)           │ │
│           │                  │  - 列表 + 查看详情 + 删除/清空      │ │
│           │ chrome.storage   └──────────────────────────────────────┘ │
│           ▼                                                           │
│  ┌─────────────────┐        ┌──────────────────────────────────────┐ │
│  │  storage.local  │        │  Options Page                        │ │
│  │  (历史/缓存/Key)│ ◄────► │  - Base URL / API Key / Model        │ │
│  │  storage.sync   │        │  - System Prompt / temperature       │ │
│  │  (其余设置项)   │        │  - 自定义 headers / 目标语言 /       │ │
│  └─────────────────┘        │    第二语言 / 阈值 / 快捷键          │ │
│                              └──────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.1 关键设计决策

1. **LLM 调用集中在 background**。content script 只发选区和触发请求；API Key 不离开 service worker，避免被宿主页面 JS 读取；service worker 在多 tab 间共享单点限流与缓存；SSE 解析逻辑只写一遍。
2. **content ↔ background 用 `chrome.runtime.connect` 长连接（Port）**。流式 token 推送靠 `port.postMessage`，关闭浮动卡片即 `port.disconnect`，触发 `AbortController.abort()` 中止 fetch。
3. **存储分区**：
   - 设置项绝大部分写 `storage.sync`（多设备同步）。
   - **API Key 写 `storage.local`**（不上云，避免泄露）。
   - 历史和缓存写 `storage.local`（容量大，且本机独有）。
4. **侧边栏独立运行时**，不与 content script 直接通信；通过 background 广播 `historyUpdated` 事件刷新。
5. **浮动卡片用 Shadow DOM 注入**——彻底隔绝宿主页面 CSS / JS。
6. **智能反向逻辑由 prompt 完成**：System Prompt 直接告诉模型"若输入已是 {{TARGET_LANG}}，则翻译成 {{SECONDARY_LANG}}"。客户端不做语言判定。

### 2.2 技术栈

- **构建**：Vite（多入口 → background / content / sidepanel / options）+ TypeScript。
- **UI**：原生 DOM + Shadow DOM；不引入 React / Vue / Lit。卡片体积保持 < 80KB（含 TS 转译产物）。
- **测试**：Vitest（单元）+ Playwright（本地集成）。
- **目标平台**：Manifest V3，最低 Edge 120+。

不选 React / WXT / Plasmo 的理由见 §6.1。

---

## 3. 组件与目录结构

```
fayichajian/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── manifest.ts           # 类型化生成 manifest.json
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
└── public/
    └── icons/                # 16 / 32 / 48 / 128 PNG
```

### 3.1 模块职责

| 模块 | 做什么 | 谁调用 | 依赖 |
|---|---|---|---|
| `shared/messages.ts` | 定义跨运行时消息类型与构造器（`TranslateRequest` / `TokenChunk` / `Done` / `Error` / `HistoryUpdated`） | 所有运行时 | 无 |
| `shared/storage.ts` | 类型化封装 `chrome.storage.{sync,local}`：`getSettings / setSettings / appendHistory / readCache / writeCache` | background / sidepanel / options | `chrome.storage` |
| `shared/lang.ts` | CJK 比例计算（仅供日志/历史展示用，**不**用于决定翻译方向） | sidepanel（展示） | 无 |
| `shared/types.ts` | 全局类型（见 §4.5） | 所有运行时 | 无 |
| `background/index.ts` | service worker 入口：注册 `contextMenus`、`commands`、`runtime.onConnect`；分发到 `translator` | （入口） | 下方所有 |
| `background/llm-client.ts` | OpenAI 兼容流式调用：`fetch + ReadableStream + TextDecoder`；接收 `AbortSignal`；返回 `AsyncIterable<string>`；错误归一化为 `LLMError` | `translator.ts` | `fetch` |
| `background/translator.ts` | 编排单次翻译：查缓存 → 决定 prompt 插值 → 调 llm-client → 推 token → 写历史/缓存 | `background/index.ts` | `llm-client` / `cache` / `storage` |
| `background/cache.ts` | `getCached(key) / setCached(key, value)`；键 = `sha1(text + target + model)`；LRU 淘汰；存 `storage.local` 下 `cache` 命名空间 | `translator.ts` | `storage` |
| `content/index.ts` | 监听 `chrome.runtime.onMessage`；管理浮动卡片生命周期；打开 / 关闭 port | （入口） | 下方所有 |
| `content/selection.ts` | `getSelectionText() / getSelectionRect()`；处理空选区与跨段落选区 | `content/index.ts` | DOM |
| `content/floating-card.ts` | 暴露 `mount(rect) / appendToken(s) / setComplete(full) / setError(LLMError) / unmount()`；内部 Shadow DOM | `content/index.ts` | DOM |
| `sidepanel/index.ts` | 启动读历史并渲染；订阅 `HistoryUpdated` 实时刷新；删除 / 清空按钮；详情查看 | （独立入口） | `shared/storage` / `shared/messages` |
| `options/index.ts` | 表单 ↔ storage 双向绑定；"测试连接"按钮（复用 `llm-client`） | （独立入口） | `shared/storage` / `background/llm-client`（共享代码） |

### 3.2 边界原则

- content script **不持有任何敏感凭据**（API Key、自定义 headers 中的 auth 类字段）；UI 相关设置（`longTextThreshold`、`shortcut` 显示文案、`primaryTarget` 用于状态文案）可从 `storage.sync` 读取。敏感字段只在 background 内使用。
- `shared/messages.ts` 是跨运行时协议的**单一信源**，禁止散装字符串。
- `llm-client.ts` 是唯一接触网络的模块，所有错误在此归一化成 `LLMError`。

---

## 4. 数据流

### 4.1 流程 A：右键菜单触发翻译（主路径）

```
[用户] 划词 → 右键 → 点"翻译选中内容"
   │
   ▼
[Service Worker] chrome.contextMenus.onClicked
   │  selectionText = "..."（菜单事件直接带选中文字）
   ▼
[SW → Content Script] sendMessage({type:"showCard"})
   │
[Content Script]
   │  rect = window.getSelection().getRangeAt(0).getBoundingClientRect()
   │  if (text.length > settings.longTextThreshold) → 卡片先显示"长文确认 UI"
   │  否则直接 floatingCard.mount(rect, "翻译中…")
   │  port = chrome.runtime.connect({name:"translate"})
   │  port.postMessage({type:"translate", text})
   ▼
[Service Worker] translator.translate(text, port)
   │  ├─ cache.get(key) 命中？→ 直接 port.postMessage({type:"done", full})  ✅快路径
   │  └─ 未命中：
   │      llm-client.stream(text, settings, abortSignal) →
   │         for await (chunk of stream):
   │             port.postMessage({type:"token", chunk})
   │         port.postMessage({type:"done", full})
   │      cache.set(key, full)
   │      storage.appendHistory({...})
   │      broadcast({type:"historyUpdated"})  → sidepanel 刷新
   ▼
[Content Script] port.onMessage:
   │  ├─ "token" → floatingCard.appendToken(chunk)
   │  ├─ "done"  → floatingCard.setComplete(full)
   │  └─ "error" → floatingCard.setError(err)
```

### 4.2 流程 B：快捷键触发

```
[用户] 选中文字 → Alt+T
   ▼
[Service Worker] chrome.commands.onCommand("translate")
   │  无法直接拿 selectionText
   │  → sendMessage(activeTab, {type:"requestTranslate"})
   ▼
[Content Script] 读 window.getSelection().toString() 与 rect
   │  → 走流程 A 的"打开 port"那一步往后
```

### 4.3 流程 C：用户中途取消

```
[用户] 关卡片 / Esc / 点页面别处
   ▼
[Content Script] floatingCard.unmount() + port.disconnect()
   ▼
[Service Worker] port.onDisconnect
   │  → AbortController.abort() 中止 fetch
   │  → 部分译文不写历史、不写缓存
```

### 4.4 流程 D：长文软提示

阈值（默认 5000 字符）由 content script 检查；超出时卡片先显示确认 UI，用户点【继续】才创建 port。

### 4.5 关键数据形状（`shared/types.ts`）

```ts
type Settings = {
    baseUrl: string;            // 例 "https://api.openai.com/v1"
    apiKey: string;             // 仅 storage.local
    model: string;              // 例 "gpt-4o-mini"
    systemPrompt: string;       // 含 {{TARGET_LANG}} / {{SECONDARY_LANG}} 占位
    temperature: number;        // 默认 0.2
    customHeaders: Record<string, string>;
    primaryTarget: string;      // 默认 "zh-Hans"
    secondaryTarget: string;    // 默认 "en"
    longTextThreshold: number;  // 默认 5000
    historyLimit: number;       // 默认 200
    shortcut: string;           // 默认 "Alt+T"，仅供 UI 展示
};

type HistoryItem = {
    id: string;                 // uuid v4
    sourceText: string;
    translatedText: string;
    targetLang: string;         // 实际 target，反向后的结果
    model: string;
    timestamp: number;
    pageOrigin?: string;        // 仅 origin（隐私），不发给 LLM
};

type LLMError = {
    code: "auth" | "rate_limit" | "context_too_long"
        | "network" | "bad_response" | "aborted" | "unknown";
    message: string;
    retryable: boolean;
    httpStatus?: number;
};

type PortMessage =
    | { type: "translate"; text: string }
    | { type: "token";     chunk: string }
    | { type: "done";      full: string }
    | { type: "error";     error: LLMError };
```

### 4.6 默认 System Prompt

```
You are a professional translator. Translate the user's input into {{TARGET_LANG}}.
Output only the translation itself: no explanations, no quotes, no markdown.
Preserve original formatting (line breaks, lists).
If the input is already in {{TARGET_LANG}}, translate it into {{SECONDARY_LANG}} instead.
```

`{{TARGET_LANG}}` / `{{SECONDARY_LANG}}` 由 background 在调用前替换为 `settings.primaryTarget` / `settings.secondaryTarget`。智能反向逻辑由 LLM 完成。

---

## 5. 错误处理

### 5.1 错误归一化

所有错误在 `llm-client.ts` 内统一为 `LLMError`（见 §4.5）。上层不感知 HTTP 细节。

### 5.2 错误分类与处理

| 场景 | 触发 | code | 用户文案 | 自动重试 |
|---|---|---|---|---|
| API Key 未配置 | `settings.apiKey` 为空 | `auth` | "请先在扩展设置中填入 API Key" + 【打开设置】 | 否 |
| 401 / 403 | HTTP 状态 | `auth` | "API Key 无效或权限不足，请检查设置" + 【打开设置】 | 否 |
| 429 | HTTP 429 | `rate_limit` | "请求过于频繁，已自动重试…" / 失败后 "请稍后再试" | **是，2 次，1s / 3s 退避** |
| 上下文过长 | HTTP 400 + body 含 token/context 关键词 | `context_too_long` | "选中内容过长，超出模型上下文。请缩短选择或更换大上下文模型" | 否 |
| 网络异常 | TypeError / DOMException / 超时 | `network` | "网络异常，已自动重试…" / 失败后 "无法连接到 LLM 服务，请检查网络或 Base URL" | 是，2 次，500ms / 2s |
| SSE 损坏 | 非法 chunk / 提前断开 | `bad_response` | "翻译过程中断" + 【重试】按钮 | **否（用户决定）** |
| 用户取消 | port disconnect | `aborted` | 卡片直接消失 | — |
| 未知 5xx | 任意 5xx | `unknown` | "服务器错误（{httpStatus}），请稍后重试" + 【重试】 | 是，1 次 |

重试在 `llm-client.ts` 内通过指数退避实现。`auth` / `context_too_long` / `bad_response` 不自动重试（重试只会重复扣费或重复失败）。

### 5.3 中断不丢部分译文

`bad_response` 错误显示时**保留已逐字渲染的部分译文**，附【复制部分】按钮，但不写入历史和缓存。

### 5.4 受限页面（chrome:// / edge:// / 商店 / file:// / 扩展页面）

content script 无法注入。处理：

- 右键菜单仍会显示（API 限制）；点击后 service worker 检测 `tab.url` 协议，发 `chrome.notifications` 通知"无法在此页面翻译（受限页面）"。
- 快捷键同理：service worker 检测当前 tab，受限就发通知。

### 5.5 设置页"测试连接"

发一个固定 `max_tokens: 5` 的小请求验证配置；复用 `llm-client.ts` 的同一份代码。成功显示 ✅ 模型名 + 响应时间；失败用同样的 `LLMError` 文案。

---

## 6. 决策记录

### 6.1 为什么选 Vite + TS + 原生 DOM（而非 React / WXT）

- TypeScript 对 LLM API、SSE 解析、消息协议、设置 schema 的类型保护价值远高于 React 的虚拟 DOM。
- 浮动卡片用 Shadow DOM 比 React 组件更稳——React 在注入到任意宿主页面时不带来本质优势，反而要解决样式和事件冒泡冲突；Shadow DOM 是 Chrome/Edge 扩展标准做法。
- content script 在每个页面都加载，体积越轻越好。React 运行时在此场景纯属负担。
- Vite 提供 HMR，开发体验比原生 JS 强很多。
- WXT / Plasmo 引入额外学习曲线，对单人小项目 ROI 偏低。

### 6.2 为什么 LLM 调用集中在 background

- API Key 不暴露到 content script（不被宿主页面嗅探）。
- service worker 多 tab 共享缓存与限流。
- SSE 解析逻辑唯一处。

### 6.3 为什么用 Port 而非 sendMessage

- 流式翻译需要边到边推 token，Port 的长连接语义直接匹配。
- 关闭卡片即 `port.disconnect`，service worker 用 `port.onDisconnect` 触发 `abort()`，取消语义自然。
- `sendMessage` 是请求-响应模型，不适合流。

### 6.4 为什么智能反向交给 prompt 而非客户端规则

- 客户端语言判定（CJK 比例、混合文本）天然有误差和边界情况（含日韩、含罗马音、纯标点）。
- LLM 本身就理解语种，prompt 一句话比客户端十几行规则更鲁棒。
- 客户端 `lang.ts` 退化为仅做"展示用统计"，复杂度大幅下降。

### 6.5 为什么 429 自动重试而 bad_response 不

- 429 是临时拥塞，多数情况下退避后能成功，自动重试改善体验。
- bad_response 是流被破坏，原因可能是网络中段、模型故障、配置错误，自动重试会无意义地重复扣费且不一定解决根因。让用户主动点【重试】是更安全的默认。

---

## 7. 测试策略

### 7.1 测试金字塔

```
                ▲ 少
                │
      ┌─────────┴──────────┐
      │  E2E 手动验收清单  │   每次发版前过一遍
      ├─────────────────────┤
      │   集成（Playwright）│   关键流程自动化（本地跑）
      ├─────────────────────┤
      │   单元（Vitest）     │   纯函数为主（CI 跑）
      └─────────────────────┘
                │ 多
                ▼
```

### 7.2 单元测试（Vitest，CI 必跑，覆盖率目标 ≥80%）

| 模块 | 测什么 |
|---|---|
| `shared/lang.ts` | CJK 比例：纯英 / 纯中 / 中英混合 / 含日韩 / 空字符串 / 含标点 |
| `shared/messages.ts` | 消息构造器形状 + 类型守卫 |
| `background/cache.ts` | mock storage 上的读写；LRU 淘汰；键计算稳定性 |
| `background/llm-client.ts` | mock fetch + ReadableStream 模拟 SSE：正常、断流、非法 chunk、401/429/400 token-too-long/超时；错误归一化；重试次数与退避（fake timers） |
| `background/translator.ts` | 缓存命中跳过 LLM；prompt 插值；abort 不写历史 |

### 7.3 集成测试（Playwright，本地手跑）

`launchPersistentContext` 加载本地未打包扩展，对接本地 mock SSE 服务器：

| 用例 | 断言 |
|---|---|
| 右键翻译主路径 | 卡片出现、token 逐步追加、最终文本正确、历史已写入 |
| 智能反向 | 选中中文 → 译文是英文 |
| 缓存命中 | 第二次翻译不发 fetch（spy）、立即完整显示 |
| 中途取消 | mock 服务端收到 abort、历史未新增 |
| 受限页面 | 收到 notifications 提示、无卡片 |
| 设置页测试连接 | 错误配置失败、正确配置 ✅ |
| 长文软提示 | 卡片先显示确认 UI |

Mock LLM 服务器：Node `http` 起本地 SSE，按需返回正常/异常流。

### 7.4 手动验收清单（每次发版）

- 在 GitHub / 知乎 / Twitter / Notion / Gmail / PDF 各划词翻译；卡片不被宿主样式破坏（Shadow DOM 验证）。
- iframe 内文字（嵌入式视频站点）选中能否翻译（已知限制，写入 README）。
- 高 DPI 屏幕、深色模式下卡片可读性。
- `Alt+T` 在中文输入法激活时不冲突。
- 第二台 Edge 上 `storage.sync` 同步生效（API Key 不同步）。
- 历史超过上限时旧条被淘汰，UI 不卡。

### 7.5 不测什么

- 不测 chrome.* API 本身（假设浏览器实现正确）。
- 不做视觉回归（截图比对维护成本高）。
- CI 不跑 Playwright（headless Chromium 不稳定，单人项目本地跑足够）。

---

## 8. 已知限制与未来增强

### 已知限制（v1）

- PDF.js viewer 内的文字选区不稳定（浏览器内置 PDF 阅读器各厂商实现不一）。
- 跨 iframe 选区无法翻译（浏览器安全模型限制）。
- 受限页面（chrome:// / edge:// / 扩展商店等）无法翻译。
- 快捷键全局生效，可能与某些网站的 `Alt+T` 冲突——用户可在 `edge://extensions/shortcuts` 改。

### 可能的未来增强（不在 v1）

- 划词浮标（v1.1）
- 多套 LLM 配置切换（v1.2）
- 长文分段并行翻译（v2）
- 对话式追问（基于侧边栏，v2）
- 整页翻译（v2）

---

## 9. 验收标准

v1 视为完成，当：

1. 在 GitHub / 知乎 / Twitter / Notion / Gmail 各成功划词翻译至少一段，浮动卡片正确显示流式译文。
2. 设置页可成功保存配置；"测试连接"按钮在配置错误时显示对应文案，正确时显示 ✅。
3. 侧边栏正确显示历史，删除 / 清空生效。
4. 长文（> 5000 字符）触发软提示。
5. 中途关闭卡片中止 fetch（用 mock 服务器或 DevTools Network 验证）。
6. 关闭浏览器再开，历史和设置仍在；API Key 不出现在 `storage.sync`。
7. Vitest 单元测试通过，覆盖率 ≥ 80%。
8. 手动验收清单（§7.4）逐条通过。
