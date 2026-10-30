# 参与贡献

感谢你对划词译问的关注！提交前请阅读以下约定。

## 提交 Issue

- **Bug**：使用 Bug 模板，写明浏览器与版本、扩展版本、出问题的网址、复现步骤、期望与实际结果，附截图或控制台日志（日志前缀为 `[划词译问]`）。
- **功能建议**：使用功能建议模板，说明使用场景与期望效果。

## 提交 Pull Request

1. Fork 本仓库，从 `main` 创建分支：`feat/整页翻译`、`fix/iframe-选区` 等。
2. 安装依赖：`npm ci`（Node.js 20 及以上）。
3. 开发与调试：`npm run dev`，在 `edge://extensions/` 加载 `dist/`。
4. 修改代码并补充测试，确保 `npm run check` 全部通过。
5. 涉及界面改动时，运行 `npm run build && npm run screenshots` 更新截图。
6. 在 `CHANGELOG.md` 顶部「未发布」小节记录变更。
7. 提交信息使用 [约定式提交](https://www.conventionalcommits.org/zh-hans/)：`feat:`、`fix:`、`docs:`、`refactor:`、`test:`、`chore:`。

## 代码规范

完整规范见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)，要点如下：

- TypeScript 严格模式，`npm run lint` 零错误。
- 界面颜色、圆角、阴影只用 `src/shared/tokens.css` 中的变量，不硬编码。
- 页面内界面一律放在 Shadow DOM 中；模型输出用 `textContent` 插入，禁止 `innerHTML` 拼接外部内容。
- 敏感字段（API Key 等）只能存 `storage.local`。
- 产品名、链接、菜单 ID 从 `src/shared/constants.ts` 取。
