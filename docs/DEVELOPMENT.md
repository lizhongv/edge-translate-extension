# 开发规范

> 版本：v1.0（2026-10-31）
> 基于团队《开源工具类项目开发规范》，按浏览器扩展（TypeScript + Vite + CRXJS）调整。交付前逐项对照文末检查清单。

## 1. 环境与命令

- Node.js 20 及以上；Python 3 + Pillow（仅生成图标、截图时需要）。
- `npm ci` 安装依赖；`npm run dev` 开发；`npm run check` 提交前自检；`npm run build` 构建。

## 2. 调试

**加载扩展**：运行 `npm run dev`（保持终端开启，改动自动重建到 `dist/`）→ 打开 `edge://extensions`，开启「开发人员模式」→「加载解压缩的扩展」选择 `dist/`。

**各上下文的开发者工具**（日志统一以 `[划词译问]` 开头，可在控制台按此过滤）：

| 上下文 | 打开方式 |
|---|---|
| 后台 Service Worker | `edge://extensions` 本扩展卡片上的「检查视图：Service Worker」 |
| 页面内工具栏与卡片 | 目标网页按 F12，控制台上下文从 `top` 切到「划词译问」 |
| 侧边栏 | 侧边栏内右键 →「检查」 |
| 设置页 | 设置页按 F12 |

**改动生效**：页面与样式一般自动刷新；`manifest.ts`、后台脚本、权限改动需在 `edge://extensions` 点「重新加载」，之后目标网页也要刷新，否则旧的内容脚本仍在运行。

**排查要点**：

- 划词无反应：先确认不是受限页面（`edge://`、扩展商店、内置 PDF 阅读器），再看网页控制台报错。
- 请求失败：在 Service Worker 的「网络」面板查看请求；401 多为 Key 错误，404 多为接口地址或模型名错误。
- Service Worker 显示「无效」：空闲约 30 秒后被浏览器挂起属正常，触发任意操作即唤醒。
- 查看存储：在 Service Worker 控制台执行 `chrome.storage.sync.get(null, console.log)`；`storage.local` 中含 API Key，截图或贴日志前注意脱敏。

## 3. 目录与分层

| 层 | 约束 |
|---|---|
| `background/` | 只做调度、网络与存储写入；不操作 DOM |
| `content/` | 只做选区与页面内界面；不直接调用模型，一律经 Port 交给后台 |
| `sidepanel/`、`options/` | 扩展页面；通过 `shared/storage` 读写数据 |
| `shared/` | 纯类型、纯函数、存储封装、常量、设计规范；不依赖任何一个具体上下文 |

- 新增跨上下文消息：在 `types.ts` 定义类型，在 `messages.ts` 提供构造函数与类型守卫，不在调用处手写对象字面量。
- 产品名、链接、菜单 ID 只从 `constants.ts` 取；日志统一以 `LOG_PREFIX` 开头。

## 4. 编码风格

- TypeScript 严格模式，`npm run typecheck`、`npm run lint` 零错误；4 空格缩进，LF 换行（见 `.editorconfig`）。
- 文件头写一段注释说明模块职责与关键约定；注释写「为什么」，不复述代码。
- 异常只捕获预期情况；「失败可忽略」的 `catch` 要写注释说明原因。
- 不留无用代码与无用变量（ESLint 会报错）。

## 5. 界面

- **设计规范**：颜色、圆角、阴影、字体只用 `src/shared/tokens.css` 的变量，浅色 / 深色两套同时验证。
- **页面内界面**：必须渲染在封闭 Shadow DOM 中，样式写作 `tokensCss + 组件样式`；`z-index` 使用最大值，避免被网页遮挡。
- **主次分明**：每组按钮最多一个主操作（品牌色），其余为次要样式。
- **状态完整**：每个异步操作都有进行中、成功、失败三种状态；失败要给出下一步（打开设置、重试等）。
- **空状态**：列表为空时给出图标、标题和下一步操作引导，不能只显示「暂无数据」。
- **截图回归**：界面改动后运行 `npm run build && npm run screenshots`，检查浅色 / 深色截图无错位、无截断。

## 6. 数据与隐私

- 敏感字段（API Key、自定义请求头）只能存 `storage.local`，不得写入 `storage.sync`、日志或错误信息。
- 新增需要持久化的数据，必须在 `PRIVACY.md` 的数据表中补充说明。
- 新增权限必须在 `PRIVACY.md` 的权限表中写明用途；能用 `activeTab` 解决的不申请更大权限。

## 7. 安全

- 模型输出、网页文字等外部内容只能通过 `textContent` 写入 DOM；`innerHTML` 只允许用于代码中写死的固定文案。
- 请求只发往用户配置的接口地址，不引入任何第三方统计或远程脚本。

## 8. 测试

- 使用 Vitest + jsdom；chrome API 模拟在 `tests/setup.ts`。
- 新增功能必须附单元测试；修复 Bug 先补能复现问题的测试。
- 网络与流式输出通过注入的 `fetchFn` / `StreamFn` 模拟，测试不访问真实网络。
- 测试不依赖计时竞争；需要中断时用 `AbortController` 显式触发。

## 9. 版本与发布

1. 修改 `package.json` 的 `version`（清单版本自动读取）。
2. 将 `CHANGELOG.md` 中「未发布」的内容移到新版本小节，按「新增 / 变更 / 修复 / 工程」分类。
3. 提交后打标签 `vX.Y.Z` 推送，GitHub Actions 自动检查、构建、打包 zip 并发布 Release。
4. 上传应用商店时使用 Release 中的 zip，商店文案与素材见 `docs/STORE_LISTING.md`。

## 10. Git

- 约定式提交：`feat` / `fix` / `docs` / `refactor` / `test` / `chore` / `ci`，标题说明做了什么，正文说明原因。
- 分支：`main` 始终可发布；功能在 `feat/*`、修复在 `fix/*` 分支开发后合并。
- 公开仓库使用 GitHub 匿名邮箱提交。

## 11. 交付前检查清单

- [ ] `npm run check` 通过（类型、代码检查、测试）
- [ ] `npm run build` 成功，在 Edge 中加载 `dist/` 手动验证主要流程
- [ ] 界面改动已在浅色、深色下截图检查
- [ ] 新增数据 / 权限已写入 `PRIVACY.md`
- [ ] `CHANGELOG.md` 已记录
- [ ] 无硬编码颜色、产品名、密钥
