# 应用商店上架素材

适用于 Microsoft Edge 加载项商店与 Chrome 网上应用店。

## 1. 基本信息

| 项目 | 内容 |
|---|---|
| 名称（中文） | 划词译问 - AI 划词翻译与问答 |
| 名称（英文） | SelectLingo - AI Translate & Ask on Selection |
| 分类 | 效率工具（Productivity） |
| 语言 | 简体中文、English |
| 隐私政策网址 | https://github.com/lizhongv/edge-translate-extension/blob/main/PRIVACY.md |
| 支持网址 | https://github.com/lizhongv/edge-translate-extension/issues |
| 上传包 | GitHub Release 中的 `selectlingo-vX.Y.Z.zip` |

## 2. 简短描述（不超过 132 字符）

**中文**：选中网页文字，一键 AI 翻译、追问与收藏。支持 DeepSeek、OpenAI 等任意兼容模型，数据只存本机。

**English**: Select text on any page to translate, ask follow-up questions and save notes with AI. Bring your own model; data stays local.

## 3. 详细描述（中文）

划词译问让阅读外文与理解复杂内容不再需要切换页面。

【核心功能】
• 划词翻译：选中文字即浮出工具栏，点「翻」流式显示译文；选中目标语言内容时自动反向翻译
• 划词问答：围绕选中段落向 AI 多轮追问，会话自动保存，随时继续
• 一键收藏：选中文字或 AI 回答一键存入备忘录，可搜索、编辑、导出 Markdown
• 侧边栏：翻译历史、问答会话、备忘录集中管理

【模型自由】
内置 DeepSeek、OpenAI、Kimi、通义千问、智谱 GLM、Ollama（本地）预设，选择后自动填好接口地址与模型；也支持任意 OpenAI 兼容接口，并支持思考模式开关。

【隐私优先】
扩展没有服务器，不收集任何数据。划词内容只发送给你自己配置的模型服务；API Key、历史与备忘录只保存在本机。

【使用方式】
1. 安装后按欢迎页引导选择服务商、填写 API Key 并测试连接
2. 在任意网页选中文字，点击「翻 / 问 / 存」
3. 也可使用右键菜单或快捷键 Alt+T

## 4. 权限说明（审核填写）

| 权限 | 理由 |
|---|---|
| 所有网站（host permissions） | 在用户选中文字的网页中显示工具栏与结果卡片；向用户自行配置的模型服务地址（可为任意域名或本地地址）发起请求 |
| storage | 本地保存设置、历史、问答与备忘录 |
| contextMenus | 提供右键菜单入口 |
| sidePanel | 提供侧边栏查看记录 |
| scripting、activeTab | 页面尚未加载内容脚本时按需注入 |
| notifications | 在受限页面提示无法使用 |

单一用途声明：本扩展的唯一用途是帮助用户理解网页中选中的文字（翻译、提问与收藏）。

## 5. 图片素材

| 素材 | 尺寸 | 来源 |
|---|---|---|
| 商店图标 | 128 × 128 | `public/icons/128.png` |
| 截图 1：网页内划词翻译与问答 | 1280 × 800 | `docs/images/in-page.png`（需裁剪缩放） |
| 截图 2：设置页与服务商预设 | 1280 × 800 | `docs/images/options.png` |
| 截图 3：侧边栏 | 1280 × 800 | `docs/images/sidepanel.png`（需置于背景画布中） |
| 截图 4：深色模式 | 1280 × 800 | `docs/images/in-page-dark.png` |

截图由 `npm run build && npm run screenshots` 生成，界面改动后重新生成。
