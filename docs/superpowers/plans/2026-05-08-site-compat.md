# 工具插件 v0.6.1 实施计划：站点兼容性修复

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 v0.6.0 在部分站点（zhihu pin、jishuzhan、xmsumi、hermes-agent 等）划词浮标不出现 / 无法选词的问题。三个一次性改动：事件监听切到 capture 阶段（绕过 stopPropagation）+ manifest 加 `all_frames: true`（注入 iframe）+ 新增「强制页面可选」设置（默认关，覆盖 user-select:none）。

**Architecture:** 无新架构。改 4 处事件监听参数、manifest 1 行、Settings 加 1 个 boolean、content script 顶部加 `<style>` 注入 + class toggle。无新依赖、无新文件。

**Tech Stack:** 同 v0.6.0（TypeScript 严格模式 + Vite + CRXJS + Vitest），无新依赖。

**Spec:** `docs/superpowers/specs/2026-05-08-site-compat-design.md`

**基线：** 从 `main` (v0.6.0) 切出新分支 `feat/site-compat`。

---

## 文件结构（最终态变化）

```
src/
├── manifest.ts             # 修改：content_scripts 加 all_frames: true
├── shared/types.ts         # 修改：Settings 加 forceSelectable
├── content/index.ts        # 修改：4 处 capture + 顶部加 injectForceSelectableStyle
├── options/index.html      # 修改：「行为」section 加 forceSelectable checkbox
└── options/index.ts        # 修改：inputs / fillForm / readForm
README.md                   # 修改：补充新设置说明 + 已知限制
```

---

## 里程碑划分

- **M1 — capture 阶段（T1）**：`document.addEventListener` 4 处加 capture
- **M2 — all_frames（T2）**：manifest 加一行
- **M3 — forceSelectable（T3）**：types + content + options
- **M4 — 收尾（T4）**：README + 合并 + tag v0.6.1

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## Task 0：建分支

**Files:** none.

- [ ] **Step 0.1：切到 main**

```bash
git checkout main
git pull --ff-only origin main
git tag --list "v0.6.0"
```

预期：`v0.6.0` 出现。

- [ ] **Step 0.2：切新分支**

```bash
git checkout -b feat/site-compat
```

- [ ] **Step 0.3：基线全绿**

```bash
npm run typecheck && npm run test && npm run build
```

预期：typecheck 通过，148 tests 通过，build 成功。

---

# 里程碑 1：capture 阶段监听

## Task 1：4 处事件监听加 capture

**Files:**
- Modify: `src/content/index.ts`

`src/content/index.ts` 中现有 4 处 DOM 事件监听器（位于文件 ~236-256 行附近，在 `// ===== 划词浮标编排 =====` 注释下方）。其中 `mousedown` 和 `scroll` 已使用旧式 `, true)` 第三参数表示 capture；`mouseup` 和 `selectionchange` 是 bubble 阶段——本任务把这两个改成 capture，并把另两处的旧式布尔统一为 options 对象 `{ capture: true }` 以保持风格一致。

### Step 1.1：修改 mouseup 监听

打开 `src/content/index.ts`。找到：

```ts
document.addEventListener("mouseup", () => {
    setTimeout(() => { void maybeShowToolbar(); }, 0);
});
```

替换为：

```ts
document.addEventListener("mouseup", () => {
    setTimeout(() => { void maybeShowToolbar(); }, 0);
}, { capture: true });
```

### Step 1.2：修改 selectionchange 监听

> 注意：`selectionchange` 事件只在 `document` 上触发（不会冒泡），所以 `capture` 参数对它实际行为无影响。但加上保持四处风格一致，且无副作用。

找到：

```ts
document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
        toolbar.hide();
    }
});
```

替换为：

```ts
document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.toString().trim().length === 0) {
        toolbar.hide();
    }
}, { capture: true });
```

### Step 1.3：把 mousedown 的旧式布尔改为 options 对象

找到：

```ts
document.addEventListener("mousedown", (e) => {
    if (!toolbar.isShown()) return;
    if (toolbar.contains(e.target)) return;
    toolbar.hide();
}, true);
```

替换为：

```ts
document.addEventListener("mousedown", (e) => {
    if (!toolbar.isShown()) return;
    if (toolbar.contains(e.target)) return;
    toolbar.hide();
}, { capture: true });
```

（功能等价，统一成 options 对象写法）

### Step 1.4：把 scroll 的旧式布尔改为 options 对象

找到：

```ts
window.addEventListener("scroll", () => {
    toolbar.hide();
}, true);
```

替换为：

```ts
window.addEventListener("scroll", () => {
    toolbar.hide();
}, { capture: true });
```

### Step 1.5：验证 grep 后无 `addEventListener` 旧式布尔

```bash
grep -n "addEventListener" src/content/index.ts
```

预期：4 行都以 `{ capture: true })` 结尾。如果还有 `, true)` 形式（其他文件可能有，但本任务只关心 `src/content/index.ts`），跳过。

### Step 1.6：跑测试

```bash
npm run typecheck && npm run test && npm run build
```

预期：
- typecheck：0 错误
- test：148 通过（事件监听阶段切换不影响单元测试，因测试直接 dispatch 事件且不 stopPropagation）
- build：成功

如有失败，调查并修复。

### Step 1.7：提交

```bash
git add src/content/index.ts
git commit -m "fix(content): use capture phase for all 4 document/window event listeners (bypass site stopPropagation)"
```

🏁 **里程碑 1 完成。**

---

# 里程碑 2：all_frames

## Task 2：manifest 注入子 frame

**Files:**
- Modify: `src/manifest.ts`

### Step 2.1：在 content_scripts 加 all_frames

打开 `src/manifest.ts`。找到 `content_scripts` 块：

```ts
content_scripts: [
    {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_idle",
    },
],
```

替换为：

```ts
content_scripts: [
    {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_idle",
        all_frames: true,
    },
],
```

### Step 2.2：跑测试 + build

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。`dist/manifest.json` 应包含 `"all_frames": true`。

### Step 2.3：验证 dist 输出

```bash
grep "all_frames" dist/manifest.json
```

预期：输出包含 `"all_frames": true`。

### Step 2.4：提交

```bash
git add src/manifest.ts
git commit -m "fix(manifest): content_scripts.all_frames=true (inject into iframes)"
```

🏁 **里程碑 2 完成。**

---

# 里程碑 3：forceSelectable 设置

## Task 3：types + content + options 三处改动

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/content/index.ts`
- Modify: `src/options/index.html`
- Modify: `src/options/index.ts`

### Step 3.1：扩展 Settings 类型

打开 `src/shared/types.ts`。找到 `Settings` 类型，在其最后一行 `enableSettingsButton: boolean;` 之后追加：

```ts
    forceSelectable: boolean;
```

修改后该字段位于 Settings 末尾。

### Step 3.2：扩展 DEFAULT_SETTINGS

在同一文件，找到 `DEFAULT_SETTINGS`，在末尾的 `enableSettingsButton: true,` 之后追加：

```ts
    forceSelectable: false,
```

### Step 3.3：typecheck

```bash
npm run typecheck
```

预期：0 错误。Settings 增量字段、其他文件不引用，编译通过。

### Step 3.4：在 content/index.ts 顶部添加 injectForceSelectableStyle

打开 `src/content/index.ts`。找到 import 块的末尾（第 9 行 `import type { ... }` 之后）。在 import 块和 `const card = new FloatingCard();` 之间插入：

```ts
function injectForceSelectableStyle(): void {
    if (document.getElementById("fy-force-style")) return;
    const style = document.createElement("style");
    style.id = "fy-force-style";
    style.textContent =
        "html.fy-force-selectable, html.fy-force-selectable * {" +
        " user-select: text !important;" +
        " -webkit-user-select: text !important;" +
        "}";
    (document.head || document.documentElement).appendChild(style);
}

injectForceSelectableStyle();

void getPublicSettings().then(s => {
    if (s.forceSelectable) {
        document.documentElement.classList.add("fy-force-selectable");
    }
});
```

`getPublicSettings` 已在文件第 6 行的 import 中存在，无需新增 import。

> 注：`(document.head || document.documentElement)` 兜底应对极少数无 `<head>` 的页面。`document_idle` 时点 head 应已存在。

### Step 3.5：HTML 加 checkbox

打开 `src/options/index.html`。找到「行为」section（其中已有 `enableHoverButton` 的 checkbox-label）。在 `enableHoverButton` 的 `</label>` 之后、`<p class="muted">` 之前（如有；如该 section 没有 muted 提示，则在该 section 内最末追加）插入：

```html
            <label class="checkbox-label">
                <input id="forceSelectable" type="checkbox" />
                强制页面可选（覆盖站点的禁复制 CSS；遇到禁复制页面才打开。可能影响按钮拖动等交互。设置后需刷新页面生效）
            </label>
```

> 缩进与同级现有 `<label class="checkbox-label">` 对齐（每层 4 空格）。

### Step 3.6：TS inputs 加引用

打开 `src/options/index.ts`。找到 `const inputs = { ... }` 块。在 `enableSettingsButton` 行之后追加：

```ts
    forceSelectable: $<HTMLInputElement>("forceSelectable"),
```

### Step 3.7：fillForm 同步

在 `fillForm` 函数末尾，`inputs.enableSettingsButton.checked = s.enableSettingsButton;` 之后追加：

```ts
    inputs.forceSelectable.checked = s.forceSelectable;
```

### Step 3.8：readForm 同步

在 `readForm` 函数返回对象末尾，`enableSettingsButton: inputs.enableSettingsButton.checked,` 之后追加：

```ts
        forceSelectable: inputs.forceSelectable.checked,
```

### Step 3.9：跑测试 + build

```bash
npm run typecheck && npm run test && npm run build
```

预期：
- typecheck：0 错误
- test：148 通过（DEFAULT_SETTINGS 增量字段会被 storage.test.ts 已有断言自动覆盖）
- build：成功

### Step 3.10：提交

```bash
git add src/shared/types.ts src/content/index.ts src/options/index.html src/options/index.ts
git commit -m "feat: forceSelectable setting (default off) — inject CSS to override user-select:none"
```

🏁 **里程碑 3 完成。**

---

# 里程碑 4：收尾

## Task 4：README + 合并 + 打 v0.6.1 标签

**Files:**
- Modify: `README.md`

### Step 4.1：更新版本徽章

打开 `README.md`，找到顶部徽章：

- `version-v0.6.0-blue.svg` → `version-v0.6.1-blue.svg`

测试数不变（148），徽章保留。

### Step 4.2：在「版本与发布」section PREPEND v0.6.1 条目

```markdown
### v0.6.1 (2026-05-08)

- **站点兼容性修复**：
  - 事件监听切到 capture 阶段，绕过站点 `stopPropagation` 拦截（zhihu pin、jishuzhan 等站可用）
  - manifest 加 `all_frames: true`，工具栏在 iframe 内也能出现
  - 新增「强制页面可选」设置（默认关）：覆盖站点的 `user-select: none`，需刷新页面生效
- **已知未修**：站点用 `document.write` 重写整页、整页包在 closed Shadow DOM 内、canvas 渲染文字这三类仍无法工作。
```

如 README 有版本概览表（每个版本一行的 summary），加一行 v0.6.1。

### Step 4.3：配置项详解 — 加 forceSelectable 描述

找到「配置项详解」中的「行为」子节（与 enableHoverButton 同位）。在合适位置追加：

```markdown
- **强制页面可选** (`forceSelectable`)：默认关。覆盖站点的 `user-select: none` CSS，让禁复制的页面也能划词。可能让站点的拖动 / 选区类按钮变得可选（视觉影响），所以默认关，遇到禁复制页面再打开。**设置后需刷新页面才生效**。
```

### Step 4.4：跑全量

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

### Step 4.5：提交

```bash
git add README.md
git commit -m "docs: README v0.6.1 — site compat fixes + forceSelectable setting"
```

---

## Task 5：合并 + 打 v0.6.1 标签

**Files:** 无。

### Step 5.1：合并到 main

```bash
git checkout main
git merge --no-ff feat/site-compat -m "merge: v0.6.1 — site compatibility fixes"
```

### Step 5.2：升级 package.json

把 `"version": "0.6.0"` 改为 `"version": "0.6.1"`：

```bash
git add package.json
git commit -m "chore: bump version to 0.6.1"
```

### Step 5.3：全量验证

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

### Step 5.4：打标签

```bash
git tag v0.6.1
```

### Step 5.5：推送（征求用户同意后）

```bash
git push origin main
git push origin v0.6.1
```

push tag 触发 release.yml workflow 自动构建发布。

🏁 **v0.6.1 完成。**

---

## 自检（writing-plans skill self-review）

对照 spec 检查覆盖：

| Spec 节 | 任务 |
|---|---|
| §0 背景 + 三类原因 | T1 / T2 / T3 一一对应 |
| §1 架构（无新架构） | 无对应 task |
| §2.1 capture 阶段（4 处监听） | T1 step 1.1–1.4 |
| §2.2 manifest all_frames | T2 step 2.1 |
| §2.3 forceSelectable 类型 + content + options | T3 step 3.1–3.8 |
| §3 文件结构 | 文件结构区段已列 |
| §4.2 既有测试不破 | T1.6 / T2.2 / T3.9 |
| §4.3 手测清单 | T4 之后用户手测时验；spec §4.3 列表保留 |
| §4.4 已知未修 | T4 step 4.2 README 提及 |
| §5 错误处理 | 由 injectForceSelectableStyle 内 (head || documentElement) 兜底 + getPublicSettings 已有 timeout 保护 |
| §6 兼容性 | 整体：DEFAULT_SETTINGS merge 让老用户行为零变化 |
| §7 里程碑 | M1 / M2 / M3 / M4 与 spec §7 对齐 |

**类型一致性**：`forceSelectable: boolean` 在 types / content / options 三处使用一致；`fy-force-selectable` class 与 `fy-force-style` style id 在 content 内使用一致；`injectForceSelectableStyle` 函数名独一处定义独一处调用。

**Placeholder 扫描**：未发现 TBD / TODO / "implement later" 等占位。每个 Step 都有具体代码或具体命令。
