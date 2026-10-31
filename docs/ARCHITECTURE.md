# 架构说明

> 适用版本：v1.1.0

## 1. 整体结构

划词译问是 Manifest V3 浏览器扩展，由四个运行上下文组成，彼此只通过消息与存储通信：

```
┌──────────── 网页（内容脚本） ────────────┐        ┌────────── 后台（Service Worker） ──────────┐
│ content/index.ts   监听选区、调度界面     │  Port  │ service-worker.ts  菜单、快捷键、消息路由 │
│ toolbar.ts         划词工具栏            │ "task" │ translator.ts      翻译：缓存 → 流式 → 历史 │
│ floating-card.ts   翻译结果卡片          ├───────▶│ qa.ts              问答：多轮上下文 → 会话   │
│ qa-card.ts         问答卡片              │◀───────┤ llm-client.ts      OpenAI 兼容流式客户端     │
│ （Shadow DOM 隔离）                      │ token  │ cache.ts           译文缓存（SHA-1 键）      │
└──────────────────────────────────────────┘        └──────────────────┬─────────────────────────┘
                                                                         │ fetch（用户配置的模型服务）
┌──────── 侧边栏 sidepanel ────────┐   ┌──────── 设置页 options ────────┐ ▼
│ 翻译历史 / 问答会话 / 备忘录       │   │ 服务商预设、连接测试、偏好设置   │  DeepSeek / OpenAI / Ollama …
└────────────────┬───────────────────┘   └────────────────┬────────────────┘
                 └──────────── shared/storage.ts ─────────┘
                       chrome.storage.sync（偏好）  chrome.storage.local（密钥、历史、会话、备忘录、缓存）
```

## 2. 目录

| 路径 | 职责 |
|---|---|
| `src/manifest.ts` | 扩展清单（名称走 `_locales` 国际化） |
| `src/background/` | Service Worker：右键菜单、快捷键、Port 任务路由、调用模型、缓存与历史写入 |
| `src/content/` | 内容脚本：选区监听、工具栏、翻译卡片、问答卡片；全部渲染在封闭 Shadow DOM 中 |
| `src/sidepanel/` | 侧边栏：翻译历史、问答会话（可继续追问）、备忘录（搜索、编辑、导出） |
| `src/options/` | 设置页：服务商预设、模型下拉框（`combobox.ts`）、连接测试、偏好设置、欢迎引导 |
| `src/shared/` | 跨上下文共享：类型、存储、消息构造、服务商预设、模型列表获取与筛选（`model-list.ts`）、常量、设计规范、Toast |
| `public/` | 图标、`_locales` 多语言文案 |
| `tests/unit/` | Vitest 单元测试（jsdom + chrome API 模拟，见 `tests/setup.ts`） |
| `scripts/` | 生成图标、渲染截图 |

## 3. 关键流程

### 3.1 划词翻译

1. `content/index.ts` 在捕获阶段监听 `mouseup`，取选区文字与位置，显示工具栏（输入框、可编辑区域内不显示）。
2. 用户点「翻」→ 创建翻译卡片 → 通过 `chrome.runtime.connect({ name: "task" })` 发送 `translate` 任务。
3. 后台 `translator.ts`：读取设置 → 查缓存，命中则直接返回 → 否则调用 `llm-client.stream` 流式请求。提示词同时给出主要目标语言与第二语言，原文已是目标语言时由模型反向翻译。
4. 每个片段通过 Port 回传：`reasoning`（思考中）、`token`（正文增量）、`done`（完成）或 `error`（错误码 + 是否可重试）。
5. 完成后写入缓存与历史，并广播 `historyUpdated`，侧边栏实时刷新。

### 3.2 划词问答

与翻译共用 Port 通道，任务类型为 `qa`，携带会话 ID、原文与多轮消息；后台按「多轮上限」裁剪上下文后请求，完成后更新会话并广播 `qaSessionUpdated`。侧边栏打开历史会话可继续追问。设置了 `qaModel` 时问答改用该模型，会话记录实际使用的模型；未设置时沿用翻译模型。

### 3.3 模型列表

设置页点「获取模型列表」或测试连接成功后，`model-list.ts` 请求 `GET {baseUrl}/models`（支持 `has_more` 分页），按名称排除向量、语音、图像、视觉等非文本模型。结果按接口地址缓存在 `storage.local`；获取失败时下拉框回退到 `providers.ts` 中该服务商的推荐模型，输入框始终可手动填写。

### 3.4 设置读写

`storage.ts` 将设置拆成两部分：敏感字段（`apiKey`、`customHeaders`）存 `storage.local`，其余存 `storage.sync` 以便跨设备同步。读取带 1.5 秒超时降级，防止 Edge 同步异常时卡住界面。

## 4. 设计约定

- **样式隔离**：页面内界面全部在 `mode: "closed"` 的 Shadow DOM 中，样式由 `tokens.css` + 组件样式拼接注入，不受网页 CSS 影响，也不影响网页。
- **设计规范**：颜色、圆角、阴影、字体只在 `src/shared/tokens.css` 定义（浅色 / 深色两套），所有界面引用变量。
- **安全输出**：模型输出只通过 `textContent` 写入 DOM。
- **错误分级**：`llm-client.normalizeError` 把 HTTP 状态与网络异常归一为 `auth / rate_limit / context_too_long / network / bad_response / aborted / unknown`，界面据此给出「打开设置」「重试」等下一步操作。
- **单一来源**：产品名、链接、菜单 ID 在 `constants.ts`；服务商预设与推荐模型在 `providers.ts`；文本模型的名称筛选规则在 `model-list.ts`；消息结构在 `messages.ts`。
