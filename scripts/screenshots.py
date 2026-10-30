"""用演示数据渲染扩展各界面并截图到 docs/images，用于 README、应用商店素材与界面回归检查。

用法：
    npm run build
    python scripts/screenshots.py

原理：扩展页面依赖 chrome.* 接口，无法直接用浏览器打开。脚本在 dist/__preview 下生成
注入了模拟接口与演示数据的预览页，起本地静态服务后用 Edge 无头模式截图（浅色、深色各一套）。
内容脚本界面（工具栏、翻译卡片、问答卡片）用真实样式在演示网页中还原。
运行结束删除 dist/__preview，不影响构建产物。
"""

import functools
import http.server
import json
import os
import shutil
import subprocess
import tempfile
import threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
PREVIEW = os.path.join(DIST, "__preview")
OUT = os.path.join(ROOT, "docs", "images")
PORT = 8765
EDGE_CANDIDATES = [r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                   r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"]

NOW = 1761900000000
DEMO = {
    "settingsSync": {"model": "deepseek-chat", "baseUrl": "https://api.deepseek.com/v1"},
    "settingsLocal": {"apiKey": "sk-demo-1234567890abcdef"},
    "history": [
        {"id": "h1", "sourceText": "Large language models are reshaping how we read the web.",
         "translatedText": "大语言模型正在重塑我们阅读网页的方式。", "targetLang": "中文",
         "model": "deepseek-chat", "timestamp": NOW},
        {"id": "h2", "sourceText": "划词即可翻译，无需切换页面。",
         "translatedText": "Translate on selection, without leaving the page.", "targetLang": "English",
         "model": "deepseek-chat", "timestamp": NOW - 3600_000},
        {"id": "h3", "sourceText": "Retrieval-augmented generation grounds answers in documents.",
         "translatedText": "检索增强生成让回答以文档为依据。", "targetLang": "中文",
         "model": "gpt-4o-mini", "timestamp": NOW - 86400_000},
    ],
    "qa_sessions": [],
    "memos": [],
}

STUB = """
(() => {
  const params = new URLSearchParams(location.search);
  const data = JSON.parse(%s);
  if (params.has("nokey")) data.settingsLocal = {};
  const pick = (keys) => {
    const out = {};
    for (const k of [].concat(keys ?? Object.keys(data))) if (k in data) out[k] = data[k];
    return Promise.resolve(out);
  };
  const area = { get: pick, set: (o) => { Object.assign(data, o); return Promise.resolve(); },
                 remove: () => Promise.resolve() };
  const evt = { addListener() {}, removeListener() {} };
  window.chrome = {
    storage: { sync: area, local: area, onChanged: evt },
    runtime: { getManifest: () => ({ version: "1.0.0" }), sendMessage: () => Promise.resolve(),
               onMessage: evt, openOptionsPage() {}, connect: () => ({ onMessage: evt, onDisconnect: evt,
               postMessage() {}, disconnect() {} }), getURL: (p) => "/" + p },
    tabs: { create: () => Promise.resolve() },
  };
})();
"""

CARDS_PAGE = """<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>demo</title>
<style>
  body { margin: 0; font: 16px/1.9 "Segoe UI","Microsoft YaHei",sans-serif; background: #f8fafc; color: #1e293b; }
  @media (prefers-color-scheme: dark) { body { background: #0b1220; color: #cbd5e1; } }
  article { max-width: 760px; margin: 0 auto; padding: 48px 40px; }
  h1 { font-size: 28px; margin: 0 0 18px; }
  mark { background: rgba(59,130,246,.28); color: inherit; padding: 2px 0; }
</style></head><body>
<article>
  <h1>The Future of Reading on the Web</h1>
  <p>Browsers have become the place where most knowledge work happens. <mark>Large language models are
  reshaping how we read the web: instead of switching tabs to a translator, readers can now translate,
  question and annotate any passage in place.</mark> This keeps attention on the content itself.</p>
  <p>A good reading assistant should be fast, private and stay out of the way until it is needed.</p>
</article>
<div id="hosts"></div>
<script>
  const CSS = __CSS__;
  const mount = (file, html) => {
    const host = document.createElement("div");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS["tokens.css"]}${CSS[file]}</style>${html}`;
    document.getElementById("hosts").appendChild(host);
  };
  mount("toolbar.css", `<div class="bar" style="left:620px;top:262px">
    <button class="btn"><span class="char">翻</span></button><button class="btn"><span class="char">问</span></button>
    <button class="btn"><span class="char">存</span></button><button class="btn"><span class="char">设</span></button></div>`);
  mount("card.css", `<div class="card" style="left:120px;top:300px;width:420px">
    <div class="header"><span>翻译</span><span class="status">deepseek-chat</span></div>
    <div class="body">大语言模型正在重塑我们阅读网页的方式：读者无需切换到翻译工具，就能在原处翻译、追问和批注任何段落。</div>
    <div class="footer"><button>复制原文</button><button class="primary">复制译文</button><button>关闭</button></div></div>`);
  mount("qa-card.css", `<div class="card" style="left:580px;top:300px">
    <div class="header"><span>问答</span><button class="close">×</button></div>
    <div class="source collapsed"><div class="source-text">Large language models are reshaping how we read the web…</div></div>
    <div class="messages">
      <div class="msg user"><div class="content">这段话的核心观点是什么？</div></div>
      <div class="msg assistant"><div class="content">核心观点是：大模型让「阅读」与「理解」在同一处完成——读者不必离开当前页面，就能翻译、提问和记录，注意力始终留在内容上。</div>
      <button class="copy">复制</button><button class="copy">保存到备忘录</button></div>
    </div>
    <div class="input-row"><textarea rows="1" placeholder="继续追问…"></textarea><button class="send">↑</button></div></div>`);
</script></body></html>"""


def build_preview():
    if not os.path.exists(os.path.join(DIST, "manifest.json")):
        raise SystemExit("请先运行 npm run build")
    os.makedirs(PREVIEW, exist_ok=True)
    with open(os.path.join(PREVIEW, "stub.js"), "w", encoding="utf-8") as f:
        f.write(STUB % json.dumps(json.dumps(DEMO, ensure_ascii=False)))
    for page in ("options", "sidepanel"):
        with open(os.path.join(DIST, "src", page, "index.html"), encoding="utf-8") as f:
            html = f.read()
        html = html.replace("<head>", '<head><script src="/__preview/stub.js"></script>', 1)
        with open(os.path.join(PREVIEW, f"{page}.html"), "w", encoding="utf-8") as f:
            f.write(html)
    # 样式直接内联进页面：无头截图的虚拟时钟下，异步 fetch 可能等不到渲染完成
    css = {}
    for name, src in (("tokens.css", "src/shared/tokens.css"), ("toolbar.css", "src/content/toolbar.css"),
                      ("card.css", "src/content/card.css"), ("qa-card.css", "src/content/qa-card.css")):
        with open(os.path.join(ROOT, src), encoding="utf-8") as f:
            css[name] = f.read()
    # 截图要的是静止终态：关掉入场动画，否则虚拟时钟可能停在半透明的中间帧
    css["tokens.css"] += "*, *::before, *::after { animation: none !important; }"
    with open(os.path.join(PREVIEW, "cards.html"), "w", encoding="utf-8") as f:
        f.write(CARDS_PAGE.replace("__CSS__", json.dumps(css, ensure_ascii=False)))


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = functools.partial(Quiet, directory=DIST)
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def shot(edge, url, out, size, dark):
    args = [edge, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-proxy-server",
            f"--user-data-dir={tempfile.mkdtemp(prefix='sl_shot_')}", "--force-device-scale-factor=2",
            f"--window-size={size}", "--virtual-time-budget=2500", f"--screenshot={out}", url]
    # 显式指定配色，避免跟随本机系统主题：0 为深色，1 为浅色
    args.insert(1, f"--blink-settings=preferredColorScheme={0 if dark else 1}")
    try:
        subprocess.run(args, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        pass
    print(("已保存 " if os.path.exists(out) else "失败 ") + os.path.basename(out))


def main():
    edge = next((p for p in EDGE_CANDIDATES if os.path.exists(p)), None)
    if not edge:
        raise SystemExit("未找到 Microsoft Edge")
    os.makedirs(OUT, exist_ok=True)
    build_preview()
    httpd = serve()
    base = f"http://127.0.0.1:{PORT}/__preview"
    try:
        for dark in (False, True):
            sfx = "-dark" if dark else ""
            shot(edge, f"{base}/options.html?nokey", os.path.join(OUT, f"options{sfx}.png"), "1280,860", dark)
            shot(edge, f"{base}/sidepanel.html", os.path.join(OUT, f"sidepanel{sfx}.png"), "520,820", dark)
            shot(edge, f"{base}/cards.html", os.path.join(OUT, f"in-page{sfx}.png"), "1100,720", dark)
    finally:
        httpd.shutdown()
        shutil.rmtree(PREVIEW, ignore_errors=True)


if __name__ == "__main__":
    main()
