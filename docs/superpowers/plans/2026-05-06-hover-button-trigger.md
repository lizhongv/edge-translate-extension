# 划词浮标触发器 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.2.0 基础上加入划词浮标触发器：用户左键划选文字、松开鼠标后，选区右下角浮现一个 24px 按钮，单击即调用现有 `handleTrigger()` 弹出浮动卡片流式翻译。

**Architecture:** 新增 `src/content/hover-button.ts`（独立 Shadow DOM 模块，与 `floating-card.ts` 对等），由 `content/index.ts` 编排器协调显示/隐藏。点击浮标后复用 v0.2.0 的所有现有路径（FloatingCard / port / SW / translator）。设置加 `enableHoverButton` 开关。

**Tech Stack:** 同 v0.2.0（TypeScript + Vite + CRXJS + Vitest + Shadow DOM）。无新依赖。

**Spec:** `docs/superpowers/specs/2026-05-06-hover-button-trigger-design.md`

**基线：** 分支 `feat/hover-button-trigger`，从 v0.2.0 切出。

---

## 文件结构（最终态）

```
src/
├── shared/
│   └── types.ts               # 修改：Settings 加 enableHoverButton
├── content/
│   ├── hover-button.ts        # 新增：HoverButton 类 + isInEditable 辅助
│   ├── hover-button.css       # 新增：浮标样式（Shadow DOM 注入）
│   └── index.ts               # 修改：mouseup/selectionchange/scroll/mousedown 监听
└── options/
    ├── index.html             # 修改：增加 enableHoverButton 复选框
    └── index.ts               # 修改：表单读写
tests/unit/
└── hover-button.test.ts       # 新增：12+ 用例
```

---

## Task 1：扩展 Settings 类型

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1.1: 在 `Settings` 类型中增加字段**

打开 `src/shared/types.ts`，在 `Settings` 类型最后一行 `shortcut: string;` 之后追加：

```ts
    enableHoverButton: boolean;
```

修改后该类型应为：
```ts
export type Settings = {
    baseUrl: string;
    apiKey: string;
    model: string;
    systemPrompt: string;
    temperature: number;
    customHeaders: Record<string, string>;
    primaryTarget: string;
    secondaryTarget: string;
    longTextThreshold: number;
    historyLimit: number;
    shortcut: string;
    enableHoverButton: boolean;
};
```

- [ ] **Step 1.2: 在 `DEFAULT_SETTINGS` 中追加默认值**

在 `DEFAULT_SETTINGS` 对象末尾、`shortcut: "Alt+T",` 之后追加：

```ts
    enableHoverButton: true,
```

修改后该常量应为：
```ts
export const DEFAULT_SETTINGS: Settings = {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat",
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    temperature: 0.2,
    customHeaders: {},
    primaryTarget: "中文",
    secondaryTarget: "English",
    longTextThreshold: 5000,
    historyLimit: 200,
    shortcut: "Alt+T",
    enableHoverButton: true,
};
```

- [ ] **Step 1.3: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 1.4: 跑测试**

```bash
npm run test
```

预期：64 个全部通过。`storage.test.ts` 中"returns defaults when nothing stored"会比较 DEFAULT_SETTINGS——两边同时变化，自动通过。

- [ ] **Step 1.5: 提交**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add enableHoverButton setting (default true)"
```

---

## Task 2：浮标样式

**Files:**
- Create: `src/content/hover-button.css`

- [ ] **Step 2.1: 新建文件**

创建 `src/content/hover-button.css`，内容如下：

```css
:host {
    all: initial;
    color-scheme: light dark;
}
.btn {
    position: fixed;
    z-index: 2147483647;
    width: 28px;
    height: 28px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid #b8bdc4;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: transform 0.12s, box-shadow 0.12s;
}
.btn:hover {
    transform: scale(1.08);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
}
.btn:active {
    transform: scale(0.96);
}
.btn img {
    width: 20px;
    height: 20px;
    pointer-events: none;
}
@media (prefers-color-scheme: dark) {
    .btn {
        background: #2a2f36;
        border-color: #4a5160;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
    }
}
```

- [ ] **Step 2.2: 提交**

```bash
git add src/content/hover-button.css
git commit -m "feat(content): hover button stylesheet"
```

---

## Task 3：HoverButton 类（TDD）

**Files:**
- Create: `tests/unit/hover-button.test.ts`
- Create: `src/content/hover-button.ts`

- [ ] **Step 3.1: 写失败的测试**

创建 `tests/unit/hover-button.test.ts`：

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { HoverButton, isInEditable } from "../../src/content/hover-button";

beforeEach(() => {
    document.body.innerHTML = "";
});

const mkRect = (left: number, top: number, right: number, bottom: number): DOMRect => ({
    left, top, right, bottom,
    x: left, y: top,
    width: right - left,
    height: bottom - top,
    toJSON() { return this; },
} as DOMRect);

describe("HoverButton.show / hide", () => {
    it("starts not shown", () => {
        const btn = new HoverButton();
        expect(btn.isShown()).toBe(false);
    });

    it("show appends a host to document.body", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        expect(document.body.children.length).toBe(1);
        expect(btn.isShown()).toBe(true);
    });

    it("hide removes the host", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        btn.hide();
        expect(document.body.children.length).toBe(0);
        expect(btn.isShown()).toBe(false);
    });

    it("repeated show does not stack hosts", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        btn.show(mkRect(20, 20, 200, 40), () => {});
        expect(document.body.children.length).toBe(1);
    });

    it("hide when not shown is a no-op", () => {
        const btn = new HoverButton();
        expect(() => btn.hide()).not.toThrow();
    });
});

describe("HoverButton click", () => {
    // closed Shadow DOM: tests access the inner button via the private `button`
    // field with `(btn as any).button` cast (escape hatch, tests only).
    it("clicking the button invokes onClick callback", () => {
        const btn = new HoverButton();
        const cb = vi.fn();
        btn.show(mkRect(10, 10, 100, 30), cb);
        const innerBtn = (btn as any).button as HTMLButtonElement;
        expect(innerBtn).toBeTruthy();
        innerBtn.click();
        expect(cb).toHaveBeenCalledOnce();
    });

    it("clicking the button hides it", () => {
        const btn = new HoverButton();
        btn.show(mkRect(10, 10, 100, 30), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        innerBtn.click();
        expect(btn.isShown()).toBe(false);
    });
});

describe("HoverButton position", () => {
    const winW = 1000;
    const winH = 800;
    beforeEach(() => {
        Object.defineProperty(window, "innerWidth", { value: winW, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: winH, configurable: true });
    });

    it("default places at bottom-right of selection rect", () => {
        const btn = new HoverButton();
        btn.show(mkRect(100, 100, 200, 130), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        // Expected left = rect.right - 28; top = rect.bottom + 4
        expect(innerBtn.style.left).toBe(`${200 - 28}px`);
        expect(innerBtn.style.top).toBe(`${130 + 4}px`);
    });

    it("right-edge overflow → pull back inside viewport", () => {
        const btn = new HoverButton();
        btn.show(mkRect(900, 100, winW + 50, 130), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        // rect.right=1050 → 1050-28=1022 > vw-4=996 → pulled back to vw-28-4=968
        expect(parseInt(innerBtn.style.left, 10)).toBeLessThanOrEqual(winW - 28 - 4);
    });

    it("bottom-edge overflow → place above selection", () => {
        const btn = new HoverButton();
        btn.show(mkRect(100, winH - 10, 200, winH + 20), () => {});
        const innerBtn = (btn as any).button as HTMLButtonElement;
        // rect.bottom > vh, so top = rect.top - 28 - 4
        expect(parseInt(innerBtn.style.top, 10)).toBeLessThan(winH - 10);
    });
});

describe("isInEditable", () => {
    it("null node → false", () => {
        expect(isInEditable(null)).toBe(false);
    });

    it("input element → true", () => {
        const i = document.createElement("input");
        document.body.appendChild(i);
        expect(isInEditable(i)).toBe(true);
    });

    it("textarea element → true", () => {
        const t = document.createElement("textarea");
        document.body.appendChild(t);
        expect(isInEditable(t)).toBe(true);
    });

    it("contenteditable=true → true", () => {
        const d = document.createElement("div");
        d.setAttribute("contenteditable", "true");
        document.body.appendChild(d);
        expect(isInEditable(d)).toBe(true);
    });

    it("nested inside contenteditable → true", () => {
        const outer = document.createElement("div");
        outer.setAttribute("contenteditable", "true");
        const inner = document.createElement("span");
        outer.appendChild(inner);
        document.body.appendChild(outer);
        expect(isInEditable(inner)).toBe(true);
    });

    it("plain div → false", () => {
        const d = document.createElement("div");
        d.textContent = "hello";
        document.body.appendChild(d);
        expect(isInEditable(d)).toBe(false);
    });

    it("text node inside plain element → false", () => {
        const p = document.createElement("p");
        p.textContent = "hi";
        document.body.appendChild(p);
        expect(isInEditable(p.firstChild)).toBe(false);
    });
});
```

- [ ] **Step 3.2: 运行测试，确认失败**

```bash
npm run test -- hover-button
```

预期：FAIL（模块不存在）。

- [ ] **Step 3.3: 写实现**

创建 `src/content/hover-button.ts`：

```ts
import buttonCss from "./hover-button.css?inline";

export function isInEditable(node: Node | null): boolean {
    let n: Node | null = node;
    while (n) {
        if (n instanceof HTMLElement) {
            if (n.isContentEditable) return true;
            const tag = n.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
        }
        n = n.parentNode;
    }
    return false;
}

const BTN_SIZE = 28;
const MARGIN = 4;

export class HoverButton {
    private host: HTMLDivElement | null = null;
    private root: ShadowRoot | null = null;
    private button: HTMLButtonElement | null = null;

    show(rect: DOMRect, onClick: () => void): void {
        this.hide();
        try {
            this.host = document.createElement("div");
            this.host.style.all = "initial";
            this.root = this.host.attachShadow({ mode: "closed" });

            const style = document.createElement("style");
            style.textContent = buttonCss;
            this.root.appendChild(style);

            const btn = document.createElement("button");
            btn.className = "btn";
            btn.type = "button";
            btn.title = "翻译选中内容";

            const img = document.createElement("img");
            img.src = chrome.runtime.getURL("icons/32.png");
            img.alt = "翻译";
            btn.appendChild(img);

            const { x, y } = this.computePosition(rect);
            btn.style.left = `${x}px`;
            btn.style.top = `${y}px`;

            btn.addEventListener("mousedown", (e) => {
                e.stopPropagation();
            });
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                onClick();
                this.hide();
            });

            this.root.appendChild(btn);
            document.body.appendChild(this.host);
            this.button = btn;
        } catch {
            this.host = null;
            this.root = null;
            this.button = null;
        }
    }

    hide(): void {
        if (this.host?.parentNode) {
            this.host.parentNode.removeChild(this.host);
        }
        this.host = null;
        this.root = null;
        this.button = null;
    }

    isShown(): boolean {
        return this.host !== null;
    }

    contains(target: EventTarget | null): boolean {
        if (!this.host || !target) return false;
        if (target instanceof Node) {
            return this.host.contains(target) || this.host === target;
        }
        return false;
    }

    private computePosition(rect: DOMRect): { x: number; y: number } {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let x = rect.right - BTN_SIZE;
        let y = rect.bottom + MARGIN;
        if (x + BTN_SIZE > vw - MARGIN) x = vw - BTN_SIZE - MARGIN;
        if (x < MARGIN) x = MARGIN;
        if (y + BTN_SIZE > vh - MARGIN) y = rect.top - BTN_SIZE - MARGIN;
        if (y < MARGIN) y = MARGIN;
        return { x, y };
    }
}
```

注意：`__buttonForTest` 字段是给测试访问 closed Shadow DOM 内按钮用的——closed shadow root 不能从外部 `shadowRoot` 拿到，但通过 class 字段可以。**生产代码不应使用此字段**——它仅是 escape hatch。

- [ ] **Step 3.4: 运行测试，确认通过**

```bash
npm run test -- hover-button
```

预期：17 个用例全部 PASS（5 show/hide + 2 click + 3 position + 7 isInEditable）。

- [ ] **Step 3.5: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 3.6: 全套测试**

```bash
npm run test
```

预期：64 + 17 = 81 个测试通过。

- [ ] **Step 3.7: 提交**

```bash
git add src/content/hover-button.ts tests/unit/hover-button.test.ts
git commit -m "feat(content): add HoverButton class with isInEditable helper"
```

---

## Task 4：编排器接入浮标

**Files:**
- Modify: `src/content/index.ts`

- [ ] **Step 4.1: 用以下完整内容覆盖 `src/content/index.ts`**

```ts
import { FloatingCard } from "./floating-card";
import { HoverButton, isInEditable } from "./hover-button";
import { getSelectionRect, getSelectionText } from "./selection";
import { getPublicSettings } from "../shared/storage";
import { msgTranslate, isTokenMsg, isDoneMsg, isErrorMsg, rtOpenOptions } from "../shared/messages";
import type { LLMError, RuntimeMessage } from "../shared/types";

console.log("[翻译插件] content script 已加载:", location.href);

const card = new FloatingCard();
const hoverButton = new HoverButton();
let currentPort: chrome.runtime.Port | null = null;
let lastText = "";
let partial = "";

function disconnect(): void {
    if (currentPort) {
        try { currentPort.disconnect(); } catch { /* ignore */ }
        currentPort = null;
    }
}

function startTranslation(text: string): void {
    partial = "";
    disconnect();
    const port = chrome.runtime.connect({ name: "translate" });
    currentPort = port;
    port.onMessage.addListener((msg: unknown) => {
        if (isTokenMsg(msg)) {
            partial += msg.chunk;
            card.appendToken(msg.chunk);
        } else if (isDoneMsg(msg)) {
            card.setComplete(msg.full);
        } else if (isErrorMsg(msg)) {
            card.setError(msg.error as LLMError, partial);
        }
    });
    port.onDisconnect.addListener(() => {
        currentPort = null;
    });
    port.postMessage(msgTranslate(text));
}

async function handleTrigger(fallbackText?: string): Promise<void> {
    const live = getSelectionText();
    const text = live || fallbackText || "";
    console.log("[翻译插件] 触发翻译, DOM 选区:", live.slice(0, 30), "回退:", fallbackText?.slice(0, 30));
    if (!text) {
        console.warn("[翻译插件] 没有可翻译的文本（选区已丢失且菜单未带文本）");
        return;
    }
    hoverButton.hide();
    const rect = getSelectionRect();
    lastText = text;
    const settings = await getPublicSettings();

    card.mount(rect, {
        onClose: () => { disconnect(); },
        onRetry: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onOpenOptions: () => {
            chrome.runtime.sendMessage(rtOpenOptions()).catch(() => {/* ignore */});
        },
        onConfirmLong: () => {
            card.setLoading();
            startTranslation(lastText);
        },
        onCancelLong: () => { disconnect(); },
    });

    if (text.length > settings.longTextThreshold) {
        card.requestLongConfirm(text.length);
    } else {
        startTranslation(text);
    }
}

// ===== 划词浮标编排 =====

async function maybeShowHoverButton(): Promise<void> {
    const text = getSelectionText();
    if (!text || text.length < 2) {
        hoverButton.hide();
        return;
    }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
        hoverButton.hide();
        return;
    }
    if (isInEditable(sel.anchorNode)) {
        hoverButton.hide();
        return;
    }
    const settings = await getPublicSettings();
    if (settings.enableHoverButton === false) {
        hoverButton.hide();
        return;
    }
    const rect = getSelectionRect();
    if (!rect) {
        hoverButton.hide();
        return;
    }
    hoverButton.show(rect, () => {
        void handleTrigger(text);
    });
}

document.addEventListener("mouseup", () => {
    // 推迟到下一帧，等浏览器完成选区状态更新
    setTimeout(() => { void maybeShowHoverButton(); }, 0);
});

document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
        hoverButton.hide();
    }
});

document.addEventListener("mousedown", (e) => {
    if (!hoverButton.isShown()) return;
    if (hoverButton.contains(e.target)) return;
    hoverButton.hide();
}, true);

window.addEventListener("scroll", () => {
    hoverButton.hide();
}, true);

// ===== 现有 chrome.runtime 消息入口 =====

chrome.runtime.onMessage.addListener((msg: RuntimeMessage | { type: string }) => {
    if ((msg as { type: string }).type === "__ping__") return;
    const m = msg as RuntimeMessage;
    if (m.type === "showCard") {
        void handleTrigger(m.text);
    } else if (m.type === "requestTranslate") {
        void handleTrigger();
    }
});
```

- [ ] **Step 4.2: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 4.3: 跑全套测试**

```bash
npm run test
```

预期：81 个测试通过（无回归）。

- [ ] **Step 4.4: 提交**

```bash
git add src/content/index.ts
git commit -m "feat(content): wire HoverButton into mouseup/selectionchange/scroll/mousedown listeners"
```

---

## Task 5：选项页加开关

**Files:**
- Modify: `src/options/index.html`
- Modify: `src/options/index.ts`

- [ ] **Step 5.1: 在 `src/options/index.html` 的"行为"分区添加复选框**

打开 `src/options/index.html`，找到这段（行为分区）：

```html
        <section>
            <h2>行为</h2>
            <label>长文软提示阈值（字符）<input id="longTextThreshold" type="number" min="100" /></label>
            <label>历史保留上限<input id="historyLimit" type="number" min="10" /></label>
            <p class="muted">
                快捷键在 <code>edge://extensions/shortcuts</code> 处修改。
                当前默认：<span id="shortcut">Alt+T</span>。
            </p>
        </section>
```

在 `<label>历史保留上限...</label>` 之后、`<p class="muted">` 之前**插入**：

```html
            <label class="checkbox-label">
                <input id="enableHoverButton" type="checkbox" />
                启用划词浮标（选中文字后在选区右下角显示一键翻译按钮；输入框不出现）
            </label>
```

- [ ] **Step 5.2: 在 `src/options/options.css` 末尾追加复选框样式**

```css
.checkbox-label {
    display: flex !important;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 14px;
}
.checkbox-label input[type="checkbox"] {
    display: inline-block;
    width: auto;
    margin: 0;
    cursor: pointer;
}
```

- [ ] **Step 5.3: 修改 `src/options/index.ts` 处理 `enableHoverButton`**

在 `inputs` 对象中追加（在 `historyLimit` 一行之后、闭合 `};` 之前）：

```ts
    enableHoverButton: $<HTMLInputElement>("enableHoverButton"),
```

修改后 `inputs` 应是：
```ts
const inputs = {
    baseUrl: $<HTMLInputElement>("baseUrl"),
    apiKey: $<HTMLInputElement>("apiKey"),
    model: $<HTMLInputElement>("model"),
    temperature: $<HTMLInputElement>("temperature"),
    systemPrompt: $<HTMLTextAreaElement>("systemPrompt"),
    customHeaders: $<HTMLTextAreaElement>("customHeaders"),
    primaryTarget: $<HTMLInputElement>("primaryTarget"),
    secondaryTarget: $<HTMLInputElement>("secondaryTarget"),
    longTextThreshold: $<HTMLInputElement>("longTextThreshold"),
    historyLimit: $<HTMLInputElement>("historyLimit"),
    enableHoverButton: $<HTMLInputElement>("enableHoverButton"),
};
```

在 `fillForm` 函数末尾追加（最后一行 `inputs.historyLimit.value = String(s.historyLimit);` 之后）：

```ts
    inputs.enableHoverButton.checked = s.enableHoverButton;
```

在 `readForm` 函数 `return` 对象的 `historyLimit:` 一行之后追加：

```ts
        enableHoverButton: inputs.enableHoverButton.checked,
```

修改后 `readForm` 的 return 应是：
```ts
    return {
        baseUrl: inputs.baseUrl.value.trim(),
        apiKey: inputs.apiKey.value,
        model: inputs.model.value.trim(),
        temperature: Number(inputs.temperature.value) || 0.2,
        systemPrompt: inputs.systemPrompt.value,
        customHeaders: headers,
        primaryTarget: inputs.primaryTarget.value.trim(),
        secondaryTarget: inputs.secondaryTarget.value.trim(),
        longTextThreshold: Math.max(100, Number(inputs.longTextThreshold.value) || 5000),
        historyLimit: Math.max(10, Number(inputs.historyLimit.value) || 200),
        enableHoverButton: inputs.enableHoverButton.checked,
    };
```

- [ ] **Step 5.4: typecheck**

```bash
npm run typecheck
```

预期：通过。

- [ ] **Step 5.5: 跑测试**

```bash
npm run test
```

预期：81 个测试通过。

- [ ] **Step 5.6: 提交**

```bash
git add src/options/index.html src/options/options.css src/options/index.ts
git commit -m "feat(options): add enableHoverButton toggle in 行为 section"
```

---

## Task 6：构建 + 验证

**Files:** 无修改（只是验证产物）。

- [ ] **Step 6.1: 完整构建**

```bash
npm run build
```

预期：
- 通过
- `dist/` 中有 `assets/hover-button-*.js` 和 `assets/options-*.css` 含新样式
- 无编译错误

- [ ] **Step 6.2: 检查 service-worker-loader 仍指向正确 SW**

```bash
cat dist/service-worker-loader.js
```

预期：`import './assets/service-worker.ts-*.js';`（v0.2.0 修复保留）。

- [ ] **Step 6.3: 全套测试 + typecheck 最终验证**

```bash
npm run typecheck && npm run test
```

预期：通过 / 81 个测试通过。

- [ ] **Step 6.4: 提交（空 commit 作为里程碑）**

```bash
git commit --allow-empty -m "build: hover-button v1 ready for manual smoke test"
```

---

## Task 7：手动验收（用户）

**Files:** 无修改。

- [ ] **Step 7.1: 重新加载扩展**

在 `edge://extensions/` 卡片上点【重新加载】。

- [ ] **Step 7.2: 刷新测试页面**

在浏览器里打开 https://en.wikipedia.org/wiki/Translation 并 F5。

- [ ] **Step 7.3: 主路径测试**

划选维基段落中的一句英文，鼠标松开后 → 选区右下角应出现 28px 圆形浮标 → 单击 → 浮动卡片弹出 → 流式中文译文。

- [ ] **Step 7.4: 编辑区跳过测试**

打开 Gmail，进入 compose 撰写邮件框，划选你刚输入的字 → **不**应出现浮标。但右键应仍可触发翻译。

- [ ] **Step 7.5: 选区清空测试**

在维基页面划选 → 浮标出现 → 点击页面其他空白处 → 浮标应立即消失。

- [ ] **Step 7.6: 滚动测试**

在维基页面划选 → 浮标出现 → 滚动页面 → 浮标应消失（不漂移）。

- [ ] **Step 7.7: 设置开关测试**

打开扩展选项页 → 取消勾选"启用划词浮标"→ 保存 → 回到维基划选 → **不**应出现浮标 → 但右键和 Alt+T 应仍能触发翻译。

- [ ] **Step 7.8: 视觉边界测试**

划选靠近窗口右边缘 / 下边缘的文字 → 浮标应自动收回，不被裁切。

- [ ] **Step 7.9: 单字符不触发测试**

双击只选中一个汉字（< 2 字符）→ 浮标**不**应出现。

- [ ] **Step 7.10: 通过则提交里程碑 commit**

```bash
git commit --allow-empty -m "test: hover-button manual smoke passed"
```

---

## Task 8：合并 + 打 v0.3.0 标签

**Files:** 无修改。

- [ ] **Step 8.1: 切回 master 分支**

```bash
git checkout master
```

- [ ] **Step 8.2: 合并 feat/hover-button-trigger（fast-forward 或 no-ff 任选）**

推荐 `--no-ff` 保留分支历史：

```bash
git merge --no-ff feat/hover-button-trigger -m "merge: hover-button trigger into master"
```

- [ ] **Step 8.3: 跑最终验证**

```bash
npm run typecheck && npm run test && npm run build
```

预期：全部通过。

- [ ] **Step 8.4: 打 v0.3.0 tag**

```bash
git tag -a v0.3.0 -m "v0.3.0: hover-button trigger

- Floating 28px button appears at bottom-right of selection on mouseup
- Click → reuses existing handleTrigger → opens streaming FloatingCard
- Skips input/textarea/contenteditable
- New setting enableHoverButton (default true)
- Hides on selectionchange/scroll/external mousedown
- Coexists with right-click + Alt+T (no v0.2.0 regressions)"
```

- [ ] **Step 8.5: 验证 tag**

```bash
git tag
git log --oneline -10
```

---

## 执行总结

| Task | 主要产出 | 测试增量 |
|---|---|---|
| 1 | Settings 字段 | 0（既有 storage 测试自动适配） |
| 2 | hover-button.css | 0 |
| 3 | HoverButton 类（TDD） | +17 |
| 4 | content/index.ts 编排 | 0 |
| 5 | options 开关 | 0 |
| 6 | 构建验证 | 0 |
| 7 | 手动验收 | 0 |
| 8 | 合并 + tag v0.3.0 | 0 |

**最终测试数：** 64 + 17 = 81 个。

**最终 commit 数（在 feat/hover-button-trigger 分支）：** 7 个 + 1 merge commit + 1 milestone = ~9 个。

**TDD 严格度：** Task 3（HoverButton）严格 TDD（先测后实现）。其余任务为配置 / 接入 / UI 调整，没有可单测逻辑，通过 typecheck + 既有套件 + 手动验收覆盖。
