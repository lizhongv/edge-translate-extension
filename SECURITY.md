# 安全说明

## 支持的版本

只对最新的正式版本提供安全修复。

## 报告漏洞

请**不要**在公开 Issue 中披露漏洞细节。请通过 GitHub 的 [Private vulnerability reporting](https://github.com/lizhongv/edge-translate-extension/security/advisories/new) 私下报告，并尽量提供：

- 影响范围与版本
- 复现步骤或概念验证
- 你建议的修复方式（可选）

我们会在 7 天内确认收到，并在修复发布后致谢（如你愿意）。

## 安全设计要点

- API Key 与自定义请求头只保存在 `storage.local`，不参与浏览器同步，不写入日志。
- 页面内界面（工具栏、卡片、提示框）运行在封闭的 Shadow DOM 中，与网页脚本和样式隔离。
- 模型返回的内容一律以纯文本插入页面（`textContent`），不解析为 HTML，避免注入。
- 扩展没有后端服务，不存在服务端数据泄露面。
