# 工具插件 v0.6.1 设计稿：站点兼容性修复

**日期**：2026-05-08
**版本目标**：v0.6.1（patch release）
**前置版本**：v0.6.0（更名 + 备忘录导出）

---

## 0. 背景与目标

v0.6.0 在多数网站工作良好，但部分中文内容站（zhihu pin、jishuzhan 文章页、xmsumi 详情页、hermes-agent 落地页等）划词后**工具栏不出现**或**根本无法选中文字**。三类常见原因：

1. 站点在主体元素上 `e.stopPropagation()` 阻止事件冒泡到 `document` —— 我们的 `mouseup` 监听收不到
2. 主内容包在跨域 iframe 中，content script 没注入子 frame
3. 站点用 `user-select: none` 禁止选区，浏览器层面就形不成 selection

v0.6.1 一次性修这三类，最小代码改动 + 默认行为保持。

---

## 1. 架构

无新架构。三处改动：
- 事件监听切换到 capture 阶段（绕过 stopPropagation）
- manifest 加 `all_frames: true`（注入 iframe）
- 设置加 `forceSelectable` 开关 + content script 注入 CSS 覆盖（默认关）

---

## 2. 改动详情

### 2.1 capture 阶段监听

`src/content/index.ts` 中 4 处 `document.addEventListener`：

```ts
document.addEventListener("mouseup", () => {
    setTimeout(() => { void maybeShowToolbar(); }, 0);
});

document.addEventListener("selectionchange", () => { /* ... */ });

document.addEventListener("mousedown", (e) => { /* ... */ }, true);  // 注意这一处已经是 capture: true

window.addEventListener("scroll", () => {
    toolbar.hide();
}, true);  // 已经是 capture: true
```

加 `{ capture: true }` 给前两个（`mouseup`、`selectionchange`）；后两个已经是 capture 阶段了。

`mousedown` 已是 capture 但传的是布尔 `true`，保留。

完成后所有 4 个监听都在事件捕获阶段执行，站点的 `stopPropagation` 在 bubble 阶段阻止不到我们。

### 2.2 manifest all_frames

`src/manifest.ts`：

```ts
content_scripts: [
    {
        matches: ["<all_urls>"],
        js: ["src/content/index.ts"],
        run_at: "document_idle",
        all_frames: true,    // 新增
    },
],
```

每个 iframe（含跨域 iframe）独立注入 content script。性能：每个 iframe 多 ~25KB gzipped 脚本，毫秒级初始化。

> 注：FloatingCard / QACard / Toast 都用 `position: fixed`，在 iframe 内的 fixed 定位会以 iframe 视口为基准，不会跑出 iframe 边界——这是期望行为。

### 2.3 forceSelectable 设置

#### 类型增量

`src/shared/types.ts`：

```ts
// Settings 类型末尾追加
forceSelectable: boolean;
```

`DEFAULT_SETTINGS` 末尾追加：

```ts
forceSelectable: false,
```

#### 内容脚本

`src/content/index.ts` 顶部（在 import 之后、其他变量之前）追加：

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

注：`style` 标签总是注入（无 class 时不生效，零开销）；`class` 只有设置开启时才加。设置变更需刷新页面生效（不监听 onChanged，简化）。

#### 设置页

`src/options/index.html` 在「行为」section 内、`enableHoverButton` checkbox 之后追加：

```html
<label class="checkbox-label">
    <input id="forceSelectable" type="checkbox" />
    强制页面可选（覆盖站点的禁复制 CSS；遇到禁复制页面才打开。可能影响按钮拖动等交互。设置后需刷新页面生效）
</label>
```

`src/options/index.ts`：
- `inputs` 对象加 `forceSelectable: $<HTMLInputElement>("forceSelectable")`
- `fillForm` 加 `inputs.forceSelectable.checked = s.forceSelectable;`
- `readForm` 返回对象加 `forceSelectable: inputs.forceSelectable.checked,`

---

## 3. 文件结构（最终态）

```
src/
├── manifest.ts             # 修改：加 all_frames: true
├── shared/types.ts         # 修改：加 forceSelectable
├── content/index.ts        # 修改：capture + injectForceSelectableStyle
├── options/index.html      # 修改：加 forceSelectable checkbox
└── options/index.ts        # 修改：inputs/fillForm/readForm
README.md                   # 修改：文档新设置 + 兼容性说明
```

无新文件、无新依赖。

---

## 4. 测试

### 4.1 不新增测试文件

- 既有 `toolbar.test.ts`、`qa-card.test.ts` 直接 dispatch 事件，不 stopPropagation，capture 改动对它们透明。
- `storage.test.ts` 中的 `DEFAULT_SETTINGS` 比较自动包含 `forceSelectable: false`。
- `all_frames` 是 manifest 改动，无运行时单元测试可写。
- `injectForceSelectableStyle` 是 DOM 副作用函数，最有意义的测试是模拟 contenteditable 元素 + style 注入断言；不写自动化，纳入手测清单。

### 4.2 既有测试不破

`npm run test` 应继续显示 148 个测试通过。

### 4.3 手测清单（v0.6.1 必跑）

加载 `dist/` 到 Edge：

- 访问 [zhihu.com/pin/任意ID]、[jishuzhan.net/article/任意ID] —— 划词后工具栏出现（capture 修了 stopPropagation）
- iframe 测试：访问任意带 iframe 内容的页面（如包嵌套了 codepen / 知乎专栏 iframe 的页面），在 iframe 里划词 → 工具栏出现
- 设置页关闭 forceSelectable（默认状态）→ user-select:none 的页面仍然选不出文字（行为保持）
- 设置页打开 forceSelectable → 刷新页面 → 之前选不出的页面现在能选了
- forceSelectable 开启状态下访问普通页面 → 行为正常，按钮 / 拖动等交互不被破坏（如有破坏现象记录下来）
- 设置页关闭后刷新 → 恢复默认行为
- 普通站点（v0.6 已经能用的）继续工作正常，无回退

### 4.4 已知未修问题

下列情况 v0.6.1 仍**不能**解决，告知用户：
- Service Worker 冷启动延迟（首次访问可能需要点一次让 SW 唤醒）
- 站点用 `document.write` 重写整个 document
- 站点用 closed Shadow DOM 包裹整个内容
- canvas 渲染的文字（无 selection）

---

## 5. 错误处理

| 来源 | 表现 | 处理 |
|---|---|---|
| `(document.head \|\| document.documentElement).appendChild` 失败 | 极罕见（无 head + 无 html）| 静默忽略（content script 整体可能也已经无法工作）|
| `getPublicSettings()` 失败 | 已被 storage 内 withTimeout 吞掉 | 不加 forceSelectable class，相当于设置默认关 |
| `forceSelectable` class 与站点自身 class 冲突 | `fy-force-` 前缀降低概率，几乎不会 | 不处理 |
| iframe 沙盒（sandbox 属性无 allow-same-origin） | content script 注入失败 | Edge 自动跳过，无 toast 提示 |

---

## 6. 兼容性

- **Settings**：新增 `forceSelectable: false`，老用户首次升级 `getSettings()` merge `DEFAULT_SETTINGS` 行为零变化。
- **manifest 改动**：仅 `content_scripts[0]` 加 `all_frames: true`。Edge 重载扩展生效。
- **storage**：不动数据。
- **API**：无破坏性变更。

---

## 7. 里程碑

1. **M1 capture 阶段**：T1 — 修 4 个 `document.addEventListener` + 1 commit
2. **M2 all_frames**：T2 — manifest 加 1 行 + 1 commit
3. **M3 forceSelectable 设置**：T3 — types / content / options + 1 commit
4. **M4 收尾**：T4 README + 合并 + 打 v0.6.1 标签

每完成一里程碑跑 `npm run typecheck && npm test && npm run build`，全绿才进下一里程碑。

整体执行时间预计 < 1 小时。
