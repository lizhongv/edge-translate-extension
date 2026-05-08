# 工具插件 v0.6.0 实施计划：更名 + 备忘录导出

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把所有「翻译插件」字面量（用户可见 + 开发者可见）改为「工具插件」；侧边栏「备忘录」Tab 加一个「导出」按钮，一键下载所有（或当前过滤后的）备忘录为 Markdown 文件。

**Architecture:** 无新架构。重命名是 sed 风格的字面量全局替换；导出是一个纯函数 `buildMemosMarkdown(memos)` + Blob 下载。仓库名 / package 名 / FloatingCard 卡片标题保持不变。

**Tech Stack:** 同 v0.5.0（TypeScript 严格模式 + Vite + CRXJS + Vitest + jsdom + Shadow DOM），无新依赖。

**Spec:** `docs/superpowers/specs/2026-05-08-rename-and-export-design.md`

**基线：** 从 `main` (v0.5.0) 切出新分支 `feat/rename-and-export`。

---

## 文件结构（最终态）

```
src/
├── manifest.ts                 # 修改（rename）
├── background/service-worker.ts # 修改（rename）
├── content/index.ts            # 修改（rename）
├── content/qa-card.ts          # 修改（rename）
├── shared/storage.ts           # 修改（rename）
├── sidepanel/
│   ├── index.html              # 修改（rename + 加 export 按钮）
│   ├── index.ts                # 修改（rename + buildMemosMarkdown + exportMemos + 按钮事件）
│   └── sidepanel.css           # 修改（rename 不影响；export 按钮样式 1 条规则）
├── options/
│   └── index.html              # 修改（rename）
README.md                       # 修改（rename）
tests/unit/
└── sidepanel-export.test.ts    # 新增（buildMemosMarkdown 纯函数测试）
```

---

## 里程碑划分

- **M1 — 重命名（T1）**：grep + replace 全跑一遍，单一 commit。
- **M2 — 导出 UI + 函数 + TDD（T2）**：HTML 加按钮、CSS 微调、buildMemosMarkdown TDD、exportMemos 实现、按钮事件挂载。一个 commit。
- **M3 — README + 合并 + tag v0.6.0（T3-T4）**。

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## Task 0：建分支

**Files:** none.

- [ ] **Step 0.1：切到 main，确认 v0.5.0**

```bash
git checkout main
git pull --ff-only origin main
git tag --list "v0.5.0"
```

预期：`v0.5.0` 出现。

- [ ] **Step 0.2：切新分支**

```bash
git checkout -b feat/rename-and-export
```

- [ ] **Step 0.3：验证基线全绿**

```bash
npm run typecheck && npm run test && npm run build
```

预期：typecheck 通过，143 tests pass，build 成功。

---

# 里程碑 1：重命名

## Task 1：全面替换「翻译插件」为「工具插件」

**Files:**
- Modify: `src/manifest.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/content/index.ts`
- Modify: `src/content/qa-card.ts`
- Modify: `src/shared/storage.ts`
- Modify: `src/sidepanel/index.html`
- Modify: `src/options/index.html`
- Modify: `README.md`

### Step 1.1：用 Grep 列出所有「翻译插件」出现位置

```bash
grep -rn "翻译插件" src/ README.md
```

预期：列出 ~20-30 处。Glob 范围限定 `src/` 和 `README.md`，不动 `dist/` `node_modules/` `docs/`（spec/plan 文档保留历史用语，不破坏）。

记录所有文件名。下一步逐个处理。

### Step 1.2：修改 src/manifest.ts

打开 `src/manifest.ts`。当前的 manifest 大致是：

```ts
export default defineManifest({
    manifest_version: 3,
    name: "翻译插件",
    version: pkg.version,
    description: "右键划词调用 OpenAI 兼容大模型流式翻译",
    // ...
    action: {
        default_title: "翻译插件 - 打开历史",
    },
    // ...
});
```

替换为：

```ts
export default defineManifest({
    manifest_version: 3,
    name: "工具插件",
    version: pkg.version,
    description: "划词翻译 / 问答 / 备忘录 一体化网页工具",
    // ...
    action: {
        default_title: "工具插件 - 打开历史",
    },
    // ...
});
```

只动这三处字符串：`name`、`description`、`action.default_title`。其他字段（permissions、host_permissions、background、content_scripts、side_panel、options_page、commands、icons）不动。

### Step 1.3：修改 src/background/service-worker.ts

把所有 `"翻译插件"` 字面量替换为 `"工具插件"`。包括：

- `chrome.notifications.create({ ..., title: "翻译插件", ... })` 中的 title（多处，含 `notifyRestricted` 等）
- 所有 `console.error("[翻译插件] ...")`、`console.log("[翻译插件] ...")`、`console.warn("[翻译插件] ...")` 中的 `[翻译插件]` 前缀

最简方法：在编辑器中全文件替换 `翻译插件` → `工具插件`。Edit tool 可以用 `replace_all: true` 一次替换文件内所有出现。

### Step 1.4：修改 src/content/index.ts

同上，文件内全部 `翻译插件` → `工具插件`。

### Step 1.5：修改 src/content/qa-card.ts

同上。

### Step 1.6：修改 src/shared/storage.ts

同上。包含 `console.warn("[翻译插件] storage ${label} 超过 ${STORAGE_TIMEOUT_MS}ms，使用默认值（chrome.storage.sync 可能因 Edge 同步异常而卡住）")` 等多处。

### Step 1.7：修改 src/sidepanel/index.html

`<title>翻译插件 - 历史</title>` → `<title>工具插件 - 历史</title>`。

### Step 1.8：修改 src/options/index.html

`<title>翻译插件 - 设置</title>` → `<title>工具插件 - 设置</title>`。
`<h1>翻译插件 设置</h1>` → `<h1>工具插件 设置</h1>`。

### Step 1.9：修改 README.md

文件内全部 `翻译插件` → `工具插件`。注意：

- 顶部 `# 翻译插件 · Edge Translate Extension` → 改为 `# 工具插件 · Edge Toolkit Extension`（"Edge Translate Extension" 也跟着改名为 "Edge Toolkit Extension"，与新中文名对齐；但仓库地址文字保留 `edge-translate-extension`）
- 徽章 alt 文本如 `[![Version]...]` 不一定提及"翻译插件"，但如果有「翻译插件」改之
- headline、功能描述、使用步骤等所有正文中的「翻译插件」一并替换
- 旧版本变更日志（v0.4 / v0.3 / v0.2 / v0.1 等历史 changelog 条目里如果有「翻译插件」字面量）也一并改——保持 README 全文一致

最简方法：Edit tool 用 `replace_all: true` 一次替换。

### Step 1.10：grep 验证无残留

```bash
grep -rn "翻译插件" src/ README.md
```

预期：**无输出**（所有 `翻译插件` 字面量都已改）。

如果还有输出，定位并替换；重复此步直到 grep 输出为空。

> **保留**：`docs/superpowers/specs/` 与 `docs/superpowers/plans/` 中的旧 spec/plan 文档不动——它们是历史记录，保留 v0.4/v0.5 时代的「翻译插件」字面量更便于回溯。本任务的 grep 范围严格限定 `src/` 和 `README.md`。

### Step 1.11：typecheck + test + build

```bash
npm run typecheck && npm run test && npm run build
```

预期：
- typecheck：0 错误
- test：143 通过（rename 仅是字面量替换，不影响逻辑；测试中可能有一处提及「翻译插件」吗？grep 一下 `tests/`：）

```bash
grep -rn "翻译插件" tests/
```

如果 tests 中有提及（少见，但比如某个测试断言某个字符串包含「翻译插件」），把那处也替换并重跑测试。

- build：成功，dist/ 创建

### Step 1.12：手测插件名

```bash
ls dist/manifest.json
```

打开 `dist/manifest.json` 文件查看 `"name": "工具插件"` 已生效。

### Step 1.13：提交

```bash
git add -A
git commit -m "refactor: rename 翻译插件 → 工具插件 across user-visible and dev-visible strings"
```

🏁 **里程碑 1 完成。**

---

# 里程碑 2：导出 UI + 函数

## Task 2：导出按钮 + buildMemosMarkdown + 按钮事件挂载

**Files:**
- Modify: `src/sidepanel/index.html`
- Modify: `src/sidepanel/sidepanel.css`
- Modify: `src/sidepanel/index.ts`
- Create: `tests/unit/sidepanel-export.test.ts`

### Step 2.1：HTML 加按钮

打开 `src/sidepanel/index.html`。在 `<input id="memo-search" ... hidden />` 之后、`<button id="clear">清空</button>` 之前插入：

```html
<button id="memo-export" class="memo-export" hidden>导出</button>
```

完整的 `.tools` div 应该变成：

```html
<div class="tools">
    <button id="back" class="back" hidden>← 返回</button>
    <input id="memo-search" class="memo-search" type="search" placeholder="搜索备忘录..." hidden />
    <button id="memo-export" class="memo-export" hidden>导出</button>
    <button id="clear">清空</button>
</div>
```

### Step 2.2：CSS 微调

打开 `src/sidepanel/sidepanel.css`，在文件末尾追加：

```css
.memo-export {
    font: inherit;
    color: inherit;
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    opacity: 0.85;
}
.memo-export:hover { opacity: 1; }
.memo-export:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}
```

### Step 2.3：写 sidepanel-export.test.ts（先失败）

新建 `tests/unit/sidepanel-export.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { buildMemosMarkdown } from "../../src/sidepanel/index";
import type { Memo } from "../../src/shared/types";

const mk = (id: string, title: string, content: string): Memo => ({
    id,
    title,
    content,
    source: "selection",
    createdAt: 0,
    updatedAt: 0,
});

describe("buildMemosMarkdown", () => {
    it("returns empty string for empty array", () => {
        expect(buildMemosMarkdown([])).toBe("");
    });

    it("renders single memo with trailing separator", () => {
        const md = buildMemosMarkdown([mk("a", "Title", "Body line")]);
        expect(md).toBe("# Title\n\nBody line\n\n---\n");
    });

    it("renders multiple memos with separators between and after", () => {
        const md = buildMemosMarkdown([
            mk("a", "First", "Content1"),
            mk("b", "Second", "Content2"),
        ]);
        expect(md).toBe("# First\n\nContent1\n\n---\n\n# Second\n\nContent2\n\n---\n");
    });

    it("preserves multi-line content as-is", () => {
        const md = buildMemosMarkdown([mk("a", "T", "line1\nline2\nline3")]);
        expect(md).toBe("# T\n\nline1\nline2\nline3\n\n---\n");
    });

    it("does not escape special markdown characters in title or content", () => {
        const md = buildMemosMarkdown([mk("a", "# 标题 *bold*", "**body** [link](x)")]);
        expect(md).toBe("# # 标题 *bold*\n\n**body** [link](x)\n\n---\n");
    });
});
```

> 注意：测试 import `buildMemosMarkdown` from `sidepanel/index.ts`。这意味着 `sidepanel/index.ts` 必须 `export` 该函数（不是默认 export，是命名 export）。下一步实现时确保 export。

### Step 2.4：跑测试，确认失败

```bash
npm run test -- tests/unit/sidepanel-export.test.ts
```

预期：FAIL — `buildMemosMarkdown` 未导出。

### Step 2.5：在 sidepanel/index.ts 中实现 buildMemosMarkdown 与 exportMemos

打开 `src/sidepanel/index.ts`。

**A. 在文件靠前位置（紧邻 `fmtTime` 这种工具函数之前或之后）追加：**

```ts
export function buildMemosMarkdown(memos: Memo[]): string {
    if (memos.length === 0) return "";
    return memos
        .map(m => `# ${m.title}\n\n${m.content}\n`)
        .join("\n---\n\n") + "\n---\n";
}

function exportMemos(memos: Memo[]): void {
    if (memos.length === 0) return;
    try {
        const md = buildMemosMarkdown(memos);
        const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `memos-${new Date().toISOString().slice(0, 10)}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast("已导出 ✓");
    } catch (e) {
        console.error("[工具插件] export failed:", e);
        showToast("导出失败");
    }
}
```

> `buildMemosMarkdown` 必须是 `export` 修饰的（命名 export），便于测试 import。`exportMemos` 不需要 export，是文件内部的实现细节。

**B. 在 DOM refs 区域追加：**

```ts
const memoExportBtn = document.getElementById("memo-export") as HTMLButtonElement;
```

放在 `const memoSearchInput = ...` 之后即可（紧邻其他 memo-相关 refs）。

**C. 在 `setView` 函数中处理 export 按钮的 hidden 状态。**

找到 `setView` 函数。它当前结尾大致是：

```ts
function setView(v: View): void {
    currentView = v;
    translateListEl.classList.toggle("active", v === "translate");
    qaListEl.classList.toggle("active", v === "qa");
    qaDetailEl.classList.toggle("active", v === "detail-qa");
    memoListEl.classList.toggle("active", v === "memo");
    memoDetailEl.classList.toggle("active", v === "detail-memo");
    backBtn.hidden = v !== "detail-qa" && v !== "detail-memo";
    clearBtn.hidden = v === "detail-qa" || v === "detail-memo";
    memoSearchInput.hidden = v !== "memo";
    tabBtns.forEach(b => b.classList.toggle("active", b.dataset.tab === v
        || (b.dataset.tab === "qa" && v === "detail-qa")
        || (b.dataset.tab === "memo" && v === "detail-memo")));
}
```

在 `memoSearchInput.hidden = v !== "memo";` 之后追加：

```ts
    memoExportBtn.hidden = v !== "memo";
```

**D. 在 `renderMemoList` 末尾设置 disabled：**

找到 `renderMemoList(memos: Memo[])`。它的结尾是 `for ... appendChild(node);`。在 `for` 循环之前或之后（一致的话放循环之后），加：

```ts
    memoExportBtn.disabled = filtered.length === 0;
```

注意 `filtered` 变量在 `renderMemoList` 内部已经定义（`const filtered = memos.filter(m => memoMatches(m, memoQuery));`）。把这行 disabled 设置加在 `filtered` 定义之后、列表 DOM 渲染之后均可。具体放在 for 循环之后保持代码顺序自然。完整的 `renderMemoList` 末尾：

```ts
function renderMemoList(memos: Memo[]): void {
    memoListEl.innerHTML = "";
    const filtered = memos.filter(m => memoMatches(m, memoQuery));
    memoExportBtn.disabled = filtered.length === 0;
    if (filtered.length === 0) {
        memoListEl.innerHTML = `<div class="empty">${memoQuery ? "无匹配项" : "暂无备忘录"}</div>`;
        return;
    }
    for (const m of filtered) {
        // ... existing code ...
    }
}
```

把 `memoExportBtn.disabled = filtered.length === 0;` 加在 `const filtered = ...;` 之后、`if (filtered.length === 0)` 之前。

**E. 挂载按钮事件。**

在文件中其他事件监听器（如 `tabBtns.forEach(...)`、`backBtn.addEventListener(...)`、`clearBtn.addEventListener(...)`）旁边，追加：

```ts
memoExportBtn.addEventListener("click", async () => {
    const all = await getMemos();
    const filtered = all.filter(m => memoMatches(m, memoQuery));
    exportMemos(filtered);
});
```

> 这里直接 `getMemos()` 重新读 storage，而不是依赖 `renderMemoList` 缓存的内存列表——避免列表与 storage 不同步的边界情况。开销可忽略（typically 200 条以内）。

### Step 2.6：跑测试，确认通过

```bash
npm run test -- tests/unit/sidepanel-export.test.ts
```

预期：5 测试全部通过。

### Step 2.7：跑全量

```bash
npm run typecheck && npm run test && npm run build
```

预期：0 typecheck 错误，143 + 5 = 148 测试通过，build 成功。

### Step 2.8：提交

```bash
git add src/sidepanel/index.html src/sidepanel/sidepanel.css src/sidepanel/index.ts tests/unit/sidepanel-export.test.ts
git commit -m "feat(sidepanel): export memos as Markdown — buildMemosMarkdown + download button"
```

🏁 **里程碑 2 完成。**

---

# 里程碑 3：收尾

## Task 3：README + 合并 + 打 v0.6.0 标签

**Files:**
- Modify: `README.md`

> Task 1 已经把 README 中的「翻译插件」字面量都换了。本任务专注于补充 v0.6.0 changelog + 版本徽章 + 路线图更新。

### Step 3.1：更新版本徽章

打开 `README.md`，找到顶部徽章：

- `version-v0.5.0-blue.svg` → `version-v0.6.0-blue.svg`
- `tests-143%20passing-brightgreen.svg` → `tests-148%20passing-brightgreen.svg`

### Step 3.2：在版本与发布部分添加 v0.6.0 条目

PREPEND（newest-first）一段：

```markdown
### v0.6.0 (2026-05-08)

- **更名**：「翻译插件」→「工具插件」，包括用户可见与开发者可见的所有字面量
- **备忘录导出**：侧边栏「备忘录」Tab 加「导出」按钮，一键下载所有（或当前过滤后的）备忘录为 `memos-YYYY-MM-DD.md`
- 测试覆盖：148 个单元测试（含新增 sidepanel-export 测试文件）
```

如果 README 里有版本概览表（比如所有版本一行的 summary table），也加一行 v0.6.0。

### Step 3.3：更新路线图

找到路线图区段。把：

```markdown
- ✅ **v0.5.0 划词知识收藏**（已完成）
- ⏳ **v0.6.0 备忘录整理增强**（手动标签 / 按来源归组 / 跨设备同步）
- ⏳ **v0.7.0 沉淀工具**（批量 Markdown 导出 / LLM 自动整理）
```

替换为：

```markdown
- ✅ **v0.5.0 划词知识收藏**（已完成）
- ✅ **v0.6.0 更名 + 备忘录导出**（已完成）
- ⏳ **v0.7.0 备忘录整理增强**（手动标签 / 按来源归组 / 跨设备同步 / LLM 自动整理）
```

### Step 3.4：跑全量

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

### Step 3.5：提交

```bash
git add README.md
git commit -m "docs: README v0.6.0 — rename + memo export"
```

---

## Task 4：合并 + 打 v0.6.0 标签

**Files:** 无。

### Step 4.1：合并到 main

```bash
git checkout main
git merge --no-ff feat/rename-and-export -m "merge: v0.6.0 — rename to 工具插件 + memo export"
```

### Step 4.2：升级 package.json 版本

打开 `package.json`，把 `"version": "0.5.0"` 改为 `"version": "0.6.0"`：

```bash
git add package.json
git commit -m "chore: bump version to 0.6.0"
```

### Step 4.3：全量验证

```bash
npm run typecheck && npm run test && npm run build
```

预期：全绿。

### Step 4.4：打标签

```bash
git tag v0.6.0
```

### Step 4.5：推送（征求用户同意后）

```bash
git push origin main
git push origin v0.6.0
```

push tag 触发 `.github/workflows/release.yml` 自动构建发布。

🏁 **v0.6.0 完成。**

---

## 自检（writing-plans skill self-review）

对照 spec 检查覆盖：

| Spec 节 | 任务 |
|---|---|
| §0 背景 / 目标 | 整体覆盖：T1 重命名 + T2 导出 |
| §1 架构（无新架构） | 无对应 task；架构上无变化 |
| §2 重命名（manifest / SW / content / qa-card / storage / sidepanel HTML / options HTML / README） | T1 step 1.2–1.10 |
| §3.1 导出 UI（搜索框旁加按钮） | T2 step 2.1, 2.2 |
| §3.2 导出行为（取过滤后列表 / Blob 下载 / 文件名） | T2 step 2.5 (E) |
| §3.3 Markdown 格式（极简） | T2 step 2.5 (A) |
| §3.4 实现位置 | T2 step 2.5 |
| §4 文件结构 | 文件结构区段已列 |
| §5.1 单元测试（buildMemosMarkdown） | T2 step 2.3, 2.6 |
| §5.2 既有测试不破 | T1 step 1.11, T2 step 2.7 |
| §5.3 手测清单 | T1 step 1.12 + T3 部分；其余在 v0.6.0 后用户手测时验 |
| §6 错误处理（Blob 失败 toast） | T2 step 2.5 (A) — exportMemos try/catch |
| §7 里程碑 | M1 / M2 / M3 与 spec §7 对齐 |
| §8 兼容性（数据零迁移、settings 无新字段） | 整体：本计划不动数据 / Settings 类型 |

**类型一致性**：`buildMemosMarkdown(memos: Memo[])` 在 T2 单测和 T2 实现中签名一致；`exportMemos(memos: Memo[])` 在挂载点和实现一致；`memoExportBtn` 在 DOM ref 与 setView / renderMemoList / 事件监听器中名字一致。

**Placeholder 扫描**：未发现 TBD / TODO / "implement later" 等占位。每个 Step 都有具体代码或具体命令。

**Spec 覆盖差异**：spec §3.5 列出的 YAGNI 项（多选 UI / JSON 备份 / 反向导入 / 自定义文件名 / 自定义模板）— 计划中**没有任何** task 涉及这些项，符合 YAGNI 原则。
