# 法译查鉴 (fayichajian)

Edge / Chromium 浏览器翻译扩展：划词后通过右键菜单或 `Alt+T` 快捷键调用 OpenAI 兼容大模型，流式呈现译文，并把每一次结果累积进侧边栏供回看。

## 功能

- 划词翻译：右键菜单「翻译选区」或 `Alt+T` 快捷键即可触发，无需打开新页签。
- 浮动卡片流式呈现：译文以 token 为单位增量显示，可中途取消。
- 侧边栏历史：所有翻译条目按时间倒序累积，可重看 / 复制 / 单条删除 / 一键清空。
- OpenAI 兼容大模型接入：Base URL、API Key、Model、System Prompt、temperature、自定义请求头均可在选项页配置，可对接 OpenAI、Azure OpenAI、DeepSeek、SiliconFlow、Ollama 等任意兼容端点。
- 智能反向翻译：默认目标语为中文；选中本身已是中文（按 CJK 字符占比判定）时由 prompt 自动翻为英文，无需切换设置。
- 命中缓存：同一段文本 + 同一模型 24 小时内命中缓存，避免重复扣费。
- 持久化历史：本地保留最近 200 条（默认值，可配置），重启浏览器不丢失。
- 长文软提示：单次选区超过阈值（默认 5000 字符）时给出确认提示，避免误操作产生大额账单。

## 安装

本项目暂未发布到扩展商店，需要本地构建后以「解压缩扩展」形式加载。

```bash
git clone <repo-url> fayichajian
cd fayichajian
npm install
npm run build         # 产物输出到 dist/
```

加载到浏览器：

1. 打开 `edge://extensions`（Chrome 用户访问 `chrome://extensions`）。
2. 右上角启用「开发人员模式」。
3. 点击「加载解压缩的扩展」，选择刚才生成的 `dist/` 目录。
4. 右键扩展图标 → 「选项」（或在扩展卡片上点击「详细信息 → 扩展选项」），至少填入 Base URL / API Key / Model 后保存。
5. 在任意网页中划选一段文字，右键「翻译选区」或按 `Alt+T` 即可看到浮动卡片。

## 配置项

选项页中各字段的含义：

| 字段 | 含义 | 默认值 |
| --- | --- | --- |
| Base URL | OpenAI 兼容端点根地址，如 `https://api.openai.com/v1`。扩展会自动追加 `/chat/completions`。 | 空（必填） |
| API Key | 端点所需的鉴权密钥，明文以 `Bearer` 形式发往后端，仅保存在浏览器本地 `chrome.storage.sync` 中。 | 空（必填） |
| Model | 模型名称，如 `gpt-4o-mini`、`deepseek-chat`、`qwen2.5:7b`。 | `gpt-4o-mini` |
| System Prompt | 决定翻译风格的系统提示。占位符 `{{TARGET_LANG}}` / `{{SECONDARY_LANG}}` 在请求时被替换为目标语 / 反向语。 | 见 `src/shared/types.ts` 中的 `DEFAULT_SYSTEM_PROMPT` |
| Temperature | 采样温度，越低越稳定。建议翻译场景保持 0–0.3。 | `0.2` |
| 自定义请求头 | 以 JSON 对象形式给所有请求附加 header，常用于自托管端点的 `X-Project-Id` 等。 | `{}` |
| 主目标语 | 默认翻译目标。 | `中文` |
| 反向目标语 | 当输入本身已是主目标语时改用的目标。 | `English` |
| 长文阈值 | 单次选区超过该字符数时弹出确认。 | `5000` |
| 历史条数上限 | 本地保留多少条历史，超出后按时间淘汰。 | `200` |
| 快捷键 | 触发翻译的全局快捷键，仅供展示，实际修改入口见下文。 | `Alt+T` |

## 已知限制

- **PDF**：浏览器内置 PDF.js 阅读器中的文字选区在不同版本下行为不稳定，可能无法触发或拿到错误的范围。
- **跨 iframe**：同一页面中跨多个 iframe 的选区无法翻译；只有当选区完整位于同一文档内时才生效。
- **受限页面**：`chrome://`、`edge://`、扩展商店、`view-source:` 等页面禁止注入内容脚本，不可用。
- **快捷键全局生效**：`Alt+T` 在所有标签页中可触发；如需修改请打开 `edge://extensions/shortcuts`（Chrome 为 `chrome://extensions/shortcuts`）。
- **流式取消**：网络层取消依赖 `AbortController`，部分代理 / 网关可能在已发送 token 后无法立即中断。

## 开发

常用脚本：

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | Vite + CRXJS 开发模式，启用 HMR，产物写入 `dist/`，加载该目录到浏览器即可热更新。 |
| `npm run build` | 生产构建，输出到 `dist/`。 |
| `npm run test` | Vitest 单元测试（共 64 条）。 |
| `npm run typecheck` | `tsc --noEmit`，仅做类型检查。 |

### 项目结构

```
src/
├── manifest.ts          # CRXJS 类型化 manifest
├── shared/              # 跨入口共用代码
│   ├── types.ts           # Settings / HistoryItem / 消息协议 / 默认值
│   ├── messages.ts        # 类型化消息构造与守卫
│   ├── storage.ts         # chrome.storage 的类型化包装
│   └── lang.ts            # CJK 占比检测
├── background/          # Service Worker（MV3）
│   ├── index.ts           # 菜单 / 快捷键 / Port 生命周期
│   ├── translator.ts      # 翻译编排：缓存 + 流式 + 历史落库
│   ├── llm-client.ts      # SSE 解析、重试退避、错误归一化
│   └── cache.ts           # SHA-1 键控的翻译缓存
├── content/             # 内容脚本
│   ├── index.ts           # 选区采集与 Port 编排
│   ├── selection.ts       # 选中文本 / 包围矩形
│   ├── floating-card.ts   # Shadow DOM 浮动卡片
│   └── card.css
├── sidepanel/           # 侧边栏历史 UI
└── options/             # 选项页
tests/                   # Vitest 单测
docs/superpowers/        # 设计与实施文档
```

## 文档

- 设计文档：[docs/superpowers/specs/2026-05-06-edge-translation-extension-design.md](docs/superpowers/specs/2026-05-06-edge-translation-extension-design.md)
- 实施计划：[docs/superpowers/plans/2026-05-06-edge-translation-extension.md](docs/superpowers/plans/2026-05-06-edge-translation-extension.md)

## 许可证

MIT
