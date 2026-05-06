<div align="center">

# 翻译插件 · Edge Translate Extension

**用左键划词，按一下「翻」字按钮，让 OpenAI 兼容大模型流式翻译瞬间出现在网页上。**

[![Version](https://img.shields.io/badge/version-v0.3.0-blue.svg)](https://github.com/lizhongv/edge-translate-extension/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/manifest-v3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tests](https://img.shields.io/badge/tests-81%20passing-brightgreen.svg)](#测试)
[![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6.svg)](https://www.typescriptlang.org/)

</div>

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [使用方式](#使用方式)
- [配置项详解](#配置项详解)
- [已知限制](#已知限制)
- [开发指南](#开发指南)
- [项目结构](#项目结构)
- [技术栈](#技术栈)
- [测试](#测试)
- [版本与发布](#版本与发布)
- [路线图](#路线图)
- [贡献](#贡献)
- [许可证](#许可证)

---

## 功能特性

| 特性 | 说明 |
| --- | --- |
| 🖱️ **三种触发方式** | 划词浮标点击 / 右键菜单 / `Alt+T` 快捷键，任选其一 |
| 🌊 **流式呈现** | 译文 token 级增量显示，长文也能秒看首字 |
| 🤖 **OpenAI 兼容 API** | 支持 OpenAI、DeepSeek、Moonshot、Qwen、Ollama 等任意兼容端点 |
| 🔄 **智能反向** | 中文输入自动翻为英文（由 prompt 完成，无需切换设置） |
| 📝 **可配置 Prompt** | 自定义系统提示、温度、自定义请求头 |
| 💾 **持久历史 + 缓存** | 侧边栏累积最近 200 条；同文本同模型命中缓存避免重复调用 |
| 🛡️ **隐私优先** | API Key 仅存于本地 `storage.local`，不参与浏览器同步 |
| ⚠️ **长文软提示** | 选中超 5000 字符弹确认，避免误操作产生大额账单 |
| 🎯 **智能跳过** | 输入框 / `<textarea>` / contenteditable 区域不显示浮标，不打扰用户编辑 |
| 🌗 **深色模式** | 自动跟随系统主题 |
| 🎨 **Shadow DOM 隔离** | 浮标和卡片样式不被宿主页面 CSS 污染 |
| 📋 **双向复制** | 复制原文 / 复制译文按钮 |

---

## 快速开始

### 1. 克隆并构建

```bash
git clone git@github.com:lizhongv/edge-translate-extension.git
cd edge-translate-extension
npm install
npm run build       # 产物输出到 dist/
```

> 需要 Node.js ≥ 18。

### 2. 加载扩展

1. 在 Edge 中打开 `edge://extensions/`（Chrome 用户访问 `chrome://extensions/`）
2. 右上角启用 **「开发人员模式」**
3. 点击 **「加载解压缩的扩展」**，选择 `dist/` 目录
4. 工具栏出现「翻译」图标即安装成功

### 3. 配置 API

右键扩展图标 → **「选项」**，至少填入：

- **Base URL**：默认 `https://api.deepseek.com/v1`（DeepSeek）；OpenAI 用户改为 `https://api.openai.com/v1`
- **API Key**：你的密钥
- **Model**：默认 `deepseek-chat`；OpenAI 推荐 `gpt-4o-mini`

点 **「测试连接」**显示 ✅ 即配置成功。

### 4. 开始翻译

任意网页上左键划选一段文字 → 点击右下角的蓝色「翻」字浮标 → 译文流式呈现。

---

## 使用方式

三种触发方式可同时使用，按需选择：

### 1. 划词浮标（默认）

```
[原文 hello world]   ← 拖选文字，鼠标松开
              [翻]   ← 选区右下角出现蓝色按钮，单击触发
```

- 在 `<input>`、`<textarea>`、contenteditable 区域**不会**出现，避免打扰编辑
- 选区清空 / 滚动 / 点击其他地方 → 自动消失
- 在选项页可一键关闭（关闭后右键和快捷键仍可用）

### 2. 右键菜单

划选文字 → **右键** → 点击「翻译选中内容」

### 3. 全局快捷键

划选文字 → 按 **`Alt+T`** 即可触发。可在 `edge://extensions/shortcuts` 修改。

### 翻译卡片操作

译文呈现后底部按钮：

- **复制原文**：复制选中的源文本
- **复制译文**：复制翻译结果
- **关闭**：关闭卡片

### 侧边栏历史

点击工具栏「翻译」图标打开侧边栏，可见全部历史，每条提供：

- 复制原文 / 复制译文 / 删除单条 / 清空全部

---

## 配置项详解

打开扩展选项页，所有字段均可调整：

### LLM 接口

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| **Base URL** | OpenAI 兼容端点根地址。扩展会自动追加 `/chat/completions` | `https://api.deepseek.com/v1` |
| **API Key** | 端点鉴权密钥。以 `Bearer` 形式发往后端，仅保存在本地 `storage.local`，**不参与浏览器同步** | 空（必填） |
| **Model** | 模型名称（如 `deepseek-chat` / `gpt-4o-mini` / `qwen-plus`） | `deepseek-chat` |
| **Temperature** | 采样温度，越低越稳定。翻译场景建议 0–0.3 | `0.2` |
| **System Prompt** | 系统提示。占位符 `{{TARGET_LANG}}` / `{{SECONDARY_LANG}}` 在请求时被替换为目标语 / 反向语 | 见 [`src/shared/types.ts`](src/shared/types.ts) 中 `DEFAULT_SYSTEM_PROMPT` |
| **自定义请求头** | JSON 对象，给所有请求附加 header。常用于自托管端点的 `X-Project-Id` 等 | `{}` |

### 翻译方向

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| **主目标语** | 默认翻译目标 | `中文` |
| **反向目标语** | 当输入本身已是主目标语时改用的目标 | `English` |

### 行为

| 字段 | 说明 | 默认值 |
| --- | --- | --- |
| **长文阈值** | 单次选区超过该字符数时弹出确认 | `5000` |
| **历史条数上限** | 本地保留多少条历史，超出后按时间淘汰 | `200` |
| **启用划词浮标** | 划词后是否在选区右下角显示一键翻译按钮 | `true` |
| 快捷键（仅展示） | 全局快捷键，实际修改入口在 `edge://extensions/shortcuts` | `Alt+T` |

### 兼容端点示例

| 服务商 | Base URL | 推荐 Model |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Azure OpenAI | `https://<resource>.openai.azure.com/openai/deployments/<deployment>` | 部署名 |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| Qwen / DashScope | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| Ollama 本地 | `http://localhost:11434/v1` | 本地模型名（如 `qwen2.5:7b`） |

---

## 已知限制

- **PDF.js**：浏览器内置 PDF 阅读器中的文字选区在不同版本下行为不稳定，可能无法触发或拿到错误的范围。
- **跨 iframe**：跨多个 iframe 的选区无法翻译；只有当选区完整位于同一文档内时才生效。
- **受限页面**：`chrome://`、`edge://`、扩展商店、`view-source:` 等页面禁止注入内容脚本，不可用。会显示通知"无法在此页面翻译"。
- **快捷键全局生效**：`Alt+T` 在所有标签页中可触发；可能与某些网站冲突。修改入口：`edge://extensions/shortcuts`。
- **流式取消**：网络层取消依赖 `AbortController`，部分代理 / 网关可能在已发送 token 后无法立即中断。
- **选项页首次加载延迟**：当 `chrome.storage.sync` 因 Edge 同步异常无法返回时，会有最多 1.5 秒延迟（已加超时降级，不会卡住）。

---

## 开发指南

### 环境要求

- Node.js ≥ 18
- npm（或兼容包管理器）
- Edge / Chrome（用于加载未打包扩展）

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm install` | 安装依赖 |
| `npm run dev` | Vite + CRXJS 开发模式，启用 HMR；产物写入 `dist/`，加载该目录到浏览器即可热更新 |
| `npm run build` | 生产构建，输出到 `dist/` |
| `npm run test` | Vitest 单元测试（共 81 条） |
| `npm run test:watch` | Vitest 监视模式 |
| `npm run test:coverage` | 测试 + 覆盖率报告 |
| `npm run typecheck` | `tsc --noEmit`，仅做类型检查 |

### 开发流程

1. `git checkout -b feat/your-feature`
2. 修改代码（推荐在 `feat/*` 分支按 TDD 节奏：先写测试 → 跑失败 → 写实现 → 跑通过 → 提交）
3. `npm run typecheck && npm run test && npm run build` 全部通过
4. 在 `edge://extensions/` 上重新加载扩展验证
5. 提交 PR

### Windows 特别说明

构建时如遇 `EPERM dist/icons` 错误，是 Edge 加载扩展时锁住了图标文件。本项目的 `vite.config.ts` 已加入 `tolerantClean` 自定义插件绕过该问题，无需手动卸载扩展。

---

## 项目结构

```
edge-translate-extension/
├── src/
│   ├── manifest.ts                # CRXJS 类型化 manifest
│   ├── shared/                    # 跨入口共用代码
│   │   ├── types.ts                 # Settings / HistoryItem / 消息协议 / 默认值
│   │   ├── messages.ts              # 类型化消息构造与守卫
│   │   ├── storage.ts               # chrome.storage 类型化封装（含超时降级）
│   │   └── lang.ts                  # CJK 占比检测（仅供历史展示）
│   ├── background/                # Service Worker（MV3）
│   │   ├── service-worker.ts        # 入口：菜单 / 快捷键 / Port 生命周期
│   │   ├── translator.ts            # 翻译编排：缓存 + 流式 + 历史落库
│   │   ├── llm-client.ts            # SSE 解析、重试退避、错误归一化
│   │   └── cache.ts                 # SHA-1 键控的翻译缓存
│   ├── content/                   # 内容脚本
│   │   ├── index.ts                 # 入口：监听 mouseup/selectionchange/scroll/mousedown
│   │   ├── selection.ts             # 选中文本 / 包围矩形
│   │   ├── floating-card.ts         # Shadow DOM 浮动卡片（流式渲染）
│   │   ├── card.css
│   │   ├── hover-button.ts          # Shadow DOM 划词浮标 + isInEditable 辅助
│   │   └── hover-button.css
│   ├── sidepanel/                 # 侧边栏（历史视图）
│   │   ├── index.html
│   │   ├── index.ts
│   │   └── sidepanel.css
│   ├── options/                   # 选项页（设置）
│   │   ├── index.html
│   │   ├── index.ts                 # 表单读写 + 测试连接按钮
│   │   └── options.css
│   └── types/
│       └── css.d.ts                 # Vite ?inline CSS 模块声明
├── tests/
│   ├── setup.ts                   # chrome.* mock + webcrypto polyfill
│   └── unit/                      # Vitest 单元测试（81 条）
├── public/
│   └── icons/                     # 16/32/48/128 PNG（翻译主题）
├── docs/superpowers/
│   ├── specs/                     # 设计文档
│   └── plans/                     # 实施计划
├── vite.config.ts                 # 含 tolerantClean 自定义插件
├── tsconfig.json                  # TS 严格模式
└── vitest.config.ts
```

---

## 技术栈

- **TypeScript** strict 模式
- **Vite 8** + [`@crxjs/vite-plugin`](https://crxjs.dev/) — MV3 manifest 类型化生成 + HMR
- **Manifest V3** — Service Worker、Side Panel、Shadow DOM
- **Vitest** + jsdom — 单元测试
- **原生 DOM + Shadow DOM** — 不引入 React/Vue/Lit，保持 content script 体积最小

详细技术决策见 [`docs/superpowers/specs/`](docs/superpowers/specs/) 中的设计文档。

---

## 测试

```bash
npm run test              # 81 个单元测试
npm run test:coverage     # 含覆盖率报告
```

测试范围：
- `shared/lang.ts` — CJK 占比计算（9 用例）
- `shared/messages.ts` — 消息构造器与类型守卫（9 用例）
- `shared/storage.ts` — 设置 / 历史 / 缓存的类型化封装（12 用例）
- `background/cache.ts` — SHA-1 键控缓存（7 用例）
- `background/llm-client.ts` — 错误归一化 / SSE 解析 / 流式 + 重试（20 用例）
- `background/translator.ts` — 翻译编排（4 用例）
- `content/selection.ts` — 选区辅助（3 用例）
- `content/hover-button.ts` — 浮标 + isInEditable（17 用例）

UI 模块（FloatingCard、sidepanel、options 页）由手动验收覆盖。

---

## 版本与发布

| 版本 | 主要内容 |
| --- | --- |
| [`v0.3.0`](https://github.com/lizhongv/edge-translate-extension/releases/tag/v0.3.0) | 划词浮标触发器（蓝底白「翻」字）；浮动卡片 + 侧边栏双向复制（原文 / 译文） |
| [`v0.2.0`](https://github.com/lizhongv/edge-translate-extension/releases/tag/v0.2.0) | 右键菜单 + Alt+T 全链路稳定；DeepSeek 默认；选项页对比度优化；Windows 构建容错 |
| [`v0.1.0`](https://github.com/lizhongv/edge-translate-extension/releases/tag/v0.1.0) | 初始 MVP：右键菜单 + 流式翻译 + 历史 + 选项页 |

每个 tag 推送后由 GitHub Actions 自动构建并上传 `dist.zip` 到对应 Release，供非开发者下载安装。

---

## 路线图

- [ ] PDF.js 阅读器内选区翻译
- [ ] 整页翻译（双语对照）
- [ ] 对话式追问（基于侧边栏，复用上下文）
- [ ] 长文自动分段并行翻译
- [ ] 多套 LLM 配置切换（一键在 OpenAI / DeepSeek 等之间切换）
- [ ] 自定义术语表 / 翻译记忆

欢迎在 [Issues](https://github.com/lizhongv/edge-translate-extension/issues) 提需求。

---

## 贡献

欢迎 PR。提交流程：

1. Fork 本仓库并克隆到本地
2. 创建特性分支：`git checkout -b feat/awesome-thing`
3. 先写测试再写实现（TDD）
4. 确保 `npm run typecheck && npm run test && npm run build` 全部通过
5. 在 Edge 中重新加载扩展，按 [使用方式](#使用方式) 章节自测
6. 提交并发起 PR；请关联相关 Issue 编号

代码风格：
- TypeScript strict
- 中文 commit message 可接受；推荐使用 [Conventional Commits](https://www.conventionalcommits.org/)：`feat:` / `fix:` / `docs:` / `test:` / `build:` / `chore:` / `perf:`
- 不引入 React / Vue / Lit / 大型 UI 框架（content script 体积优先）

---

## 许可证

[MIT](LICENSE) © 2026 lizhongv

---

<div align="center">

如果这个项目帮到你，欢迎 ⭐ Star。

报告问题 · [Issues](https://github.com/lizhongv/edge-translate-extension/issues) | 讨论 · [Discussions](https://github.com/lizhongv/edge-translate-extension/discussions)

</div>
