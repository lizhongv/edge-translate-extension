# 法译查鉴 (fayichajian)

Edge / Chromium 浏览器翻译扩展：左键划词、右键菜单或 `Alt+T` 调用 OpenAI 兼容大模型流式翻译。

## 开发

```bash
npm install
npm run dev      # Vite + HMR，输出到 dist/
```

加载扩展：打开 `edge://extensions` → 启用“开发者模式” → “加载解压缩的扩展” → 选择 `dist/`。

## 配置

安装后右键扩展图标 → 选项，填入：
- Base URL（如 `https://api.openai.com/v1`）
- API Key
- Model（如 `gpt-4o-mini`）

详见 [设计文档](docs/superpowers/specs/2026-05-06-edge-translation-extension-design.md)。
