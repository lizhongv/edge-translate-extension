# 工具插件 v0.6.0 设计稿：更名 + 备忘录导出

**日期**：2026-05-08
**版本目标**：v0.6.0
**前置版本**：v0.5.0（备忘录 + 工具栏第四档）

---

## 0. 背景与目标

v0.5.0 把插件从「翻译插件」扩展到了「翻译 + 问答 + 备忘录」一体化工具，名字与功能不再贴切。本版本完成两件事：

1. **更名**：「翻译插件」→「工具插件」，全面清理用户可见与开发者可见的字面量。
2. **备忘录导出**：侧边栏「备忘录」Tab 加一个「导出」按钮，一键下载所有（或当前过滤后的）备忘录为 Markdown 文件。

仓库名 `edge-translate-extension` 与 `package.json` 的包名 `fayichajian` **保持不变**，避免破坏 git remote / GitHub Pages / npm 历史等。

---

## 1. 架构

无新架构。两件事都是表面变更：

- 重命名是 sed 风格的全局字面量替换。
- 导出是侧边栏新增一个按钮 + 一个纯函数 `exportMemos(memos)` 拼 Markdown + Blob 下载。

不引入新依赖、不修改既有数据形状、不影响任何 storage 持久化数据。

---

## 2. 重命名（全面清理）

**改动对象**：所有「翻译插件」字面量。

| 文件 | 改动 |
|---|---|
| `src/manifest.ts` | `name: "翻译插件"` → `"工具插件"`；`description` 更新为「划词翻译 / 问答 / 备忘录 一体化网页工具」；`action.default_title: "翻译插件 - 打开历史"` → `"工具插件 - 打开历史"` |
| `src/background/service-worker.ts` | `chrome.notifications.create({ title: "翻译插件" })` → `"工具插件"`（多处）；所有 `console.error/log("[翻译插件] ...")` 前缀 → `"[工具插件]"` |
| `src/content/index.ts` | console 日志 `[翻译插件]` 前缀替换 |
| `src/content/qa-card.ts` | 同上 |
| `src/shared/storage.ts` | `console.warn("[翻译插件] storage ...")` 同上 |
| `src/sidepanel/index.html` | `<title>翻译插件 - 历史</title>` → `<title>工具插件 - 历史</title>` |
| `src/options/index.html` | `<title>翻译插件 - 设置</title>` → `<title>工具插件 - 设置</title>`；`<h1>翻译插件 设置</h1>` → `<h1>工具插件 设置</h1>` |
| `README.md` | 标题（`# 工具插件 · Edge Toolkit Extension`）、徽章 alt、headline、所有「翻译插件」字面量 → `工具插件` |

**保持不变**：

- 仓库名 `edge-translate-extension`
- `package.json` 包名 `fayichajian`
- 工具栏按钮字符 `翻 / 问 / 存 / 设`（动作而非品牌）
- FloatingCard 卡片标题「翻译」「问答」（v0.4 已 title 参数化，默认值就是「翻译」）

**执行方式**：subagent 用 grep `翻译插件` 找出所有实例，按表逐个文件替换。`Toast.message` 等使用 message 文本而非品牌名的代码不受影响。

---

## 3. 备忘录导出

### 3.1 UI

侧边栏「备忘录」Tab 的 tools 区在搜索框旁加 `[导出]` 按钮。HTML 模板增量：

```html
<button id="memo-export" class="memo-export" hidden>导出</button>
```

放在 `#memo-search` 之后、`#clear` 之前。`hidden` 默认关闭；`setView("memo")` 时显示，其他 view 时隐藏（同 `memo-search` 的逻辑）。

按钮状态：
- 列表为空（含「无匹配项」搜索结果）→ disabled
- 列表非空 → 可点击

### 3.2 行为

- 点 `[导出]` → 取**当前过滤后**的 memos（`memoQuery` 已应用过的列表）
- 拼 Markdown 字符串
- Blob + URL.createObjectURL + 临时 anchor.click 触发下载
- 文件名：`memos-YYYY-MM-DD.md`（用 `new Date().toISOString().slice(0, 10)`）
- 下载触发后 toast 「已导出 ✓」

### 3.3 Markdown 格式（极简）

```markdown
# {title}

{content}

---

# {title 2}

{content 2}

---
```

- 每条以 `# {title}` 开头
- 空行
- 正文（保留换行）
- 空行
- `---` 分隔线
- 最后一条之后也有 `---`（一致性优于美观，避免特判）

不包含：YAML frontmatter、来源 URL、时间戳、source 类型标识。最简洁、最易在任意笔记 app 直接使用。

### 3.4 实现位置

`src/sidepanel/index.ts` 新增模块级函数：

```ts
function buildMemosMarkdown(memos: Memo[]): string {
    return memos
        .map(m => `# ${m.title}\n\n${m.content}\n`)
        .join("\n---\n\n") + (memos.length > 0 ? "\n---\n" : "");
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

按钮事件挂载：在 `init()` 里加：

```ts
const memoExportBtn = document.getElementById("memo-export") as HTMLButtonElement;
memoExportBtn.addEventListener("click", async () => {
    const all = await getMemos();
    const filtered = all.filter(m => memoMatches(m, memoQuery));
    exportMemos(filtered);
});
```

`renderMemoList` 末尾根据 `filtered.length` 设 disabled：

```ts
memoExportBtn.disabled = filtered.length === 0;
```

`setView` 扩展：备忘录 Tab 时显示 `memoExportBtn`，其他 view 时隐藏。

### 3.5 不做的事（YAGNI）

- ❌ 选中条目导出（多选 UI）— 用搜索过滤代替
- ❌ JSON 备份导出 — 留 v0.7
- ❌ Markdown 反向导入 — 留 v0.7
- ❌ 自定义文件名 — 日期足够
- ❌ 自定义 MD 模板 — 极简模板能覆盖 95% 用例

---

## 4. 文件结构（最终态变化）

```
src/
├── manifest.ts                 # 修改（rename）
├── background/service-worker.ts # 修改（rename）
├── content/index.ts            # 修改（rename）
├── content/qa-card.ts          # 修改（rename）
├── shared/storage.ts           # 修改（rename）
├── sidepanel/
│   ├── index.html              # 修改（rename + 加 export 按钮）
│   ├── index.ts                # 修改（rename + buildMemosMarkdown + exportMemos）
│   └── sidepanel.css           # 微调（export 按钮样式与搜索框对齐）
├── options/
│   └── index.html              # 修改（rename）
README.md                       # 修改（rename）
tests/unit/
└── sidepanel-export.test.ts    # 新增（buildMemosMarkdown 纯函数测试）
```

---

## 5. 测试

### 5.1 单元测试（新增）

`tests/unit/sidepanel-export.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import { buildMemosMarkdown } from "../../src/sidepanel/index";  // 需要 export
```

注意：`buildMemosMarkdown` 必须从 `sidepanel/index.ts` 导出（命名 export）才能 import。

测试用例：
- 空数组 → 返回空字符串 `""`
- 单条 → `# {title}\n\n{content}\n\n---\n`
- 多条 → 每条之间有 `---`，结尾也有 `---`
- 标题含特殊字符（`# / *`）→ 不转义（Markdown 原样保留——简洁优于安全）
- 内容含多行 → 换行保留

不测 Blob / `URL.createObjectURL` / anchor.click（jsdom 兼容性差），仅手测。

### 5.2 既有测试不破

`npm run test` 应继续显示 143 + 5 新增 = 148 个测试通过（预计）。

`memo-storage.test.ts` 等不动；rename 仅是字面量替换，不影响逻辑。

### 5.3 手测清单

- 备忘录 Tab 加载 → 看到 `[导出]` 按钮（搜索框右侧、清空按钮左侧）
- 列表为空 → 按钮 disabled
- 列表非空 → 点 `[导出]` → 浏览器下载 `memos-2026-05-08.md`
- 文件内容正确：每条以 `# title` 开头，正文保持原换行，`---` 分隔
- 搜索过滤后再导出 → 只包含过滤后条目
- 切到「翻译」「问答」Tab → `[导出]` 按钮隐藏；切回「备忘录」Tab → 出现
- 切到「备忘录」详情页 → `[导出]` 按钮隐藏（已被 `clearBtn.hidden` 同款逻辑约束）
- 检查 `edge://extensions/` 中插件名显示为「工具插件」
- 受限页通知文案「无法在此页面...（受限页面）」标题为「工具插件」
- 控制台日志前缀全部为 `[工具插件]`，无 `[翻译插件]` 残留

---

## 6. 错误处理

| 来源 | 表现 | 处理 |
|---|---|---|
| `Blob` 构造失败 | 极罕见（>2GB 字符串等） | catch + toast「导出失败」 |
| `URL.createObjectURL` 失败 | 罕见 | 同上 |
| 用户取消下载对话框 | 浏览器自身处理 | 不感知 |
| 列表为空时点击 | 按钮 disabled，无法点 | 不发生 |

---

## 7. 里程碑（实现计划用）

1. **M1 重命名**：subagent 跑 grep + replace 一次性提交；包含验证「无 `翻译插件` 字面量残留」。
2. **M2 导出 UI**（HTML + CSS）：按钮加在搜索框旁；样式与搜索框对齐。
3. **M3 exportMemos + TDD**：先写 `buildMemosMarkdown` 单测；后写实现 + Blob 下载逻辑；按钮事件挂载。
4. **M4 README + 合并 + tag v0.6.0**。

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

---

## 8. 与既有版本的兼容性

- **数据**：完全不动 `storage.local.{history, qa_sessions, memos, cache, settingsLocal}` 与 `storage.sync.settingsSync`。用户升级 v0.5 → v0.6 数据零迁移，零丢失。
- **Settings**：无新字段。
- **manifest 改动**：仅 `name` / `description` / `action.default_title` 三个字符串字段。Edge 重新加载扩展即可生效。
- **GitHub Actions**：release.yml 中 zip 文件名继续用 `edge-translate-extension-${TAG}.zip`（仓库名一致），无需改 workflow。
- **UI**：用户手测时唯一感知到的变化是 Edge 扩展列表里名字从「翻译插件」变成「工具插件」+ 侧边栏顶部多了一个「导出」按钮。
