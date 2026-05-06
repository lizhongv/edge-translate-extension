# 划词浮标触发器 设计文档

- 日期：2026-05-06
- 状态：草案，待用户审阅
- 基线版本：v0.2.0（右键菜单 + Alt+T 已稳定运行）
- 分支：`feat/hover-button-trigger`

---

## 1. 概述

在 v0.2.0 的右键菜单 + 快捷键之外，新增**划词浮标**作为第三种触发方式：用户用左键划选文字、松开鼠标后，在选区右下角自动浮现一个小按钮，单击即弹出现有的浮动卡片开始流式翻译。

**为什么做：** 右键 → 选菜单 → 翻译需要两次点击 + 视觉切换；浮标只需一次点击，且在视线焦点附近，是浏览器翻译类扩展最高频用法（沙拉查词、Bing 翻译、欧路词典都是此交互）。

### 1.1 用户视角

1. 用户在网页正文用左键划选一段文字。
2. 鼠标松开后，**选区右下角**出现一个小圆形按钮（24px，扩展图标），不遮挡原文。
3. 用户**单击按钮**即弹出现有浮动卡片，token 流式呈现译文（与右键菜单走同一条路径）。
4. 选区清空 / 滚动页面 / 点击其他地方 → 浮标自动消失。
5. 在 `<input>` / `<textarea>` / `contenteditable` 元素内**不**显示浮标（避免打扰用户编辑自己的内容；这种场景仍可右键触发）。
6. 用户可在选项页一键关闭"启用划词浮标"，关闭后右键和 `Alt+T` 仍正常工作。

### 1.2 范围

**v1（本次）包含：**
- 选区右下角浮标按钮（Shadow DOM 隔离）
- mouseup 触发显示，selectionchange/scroll/外部点击触发隐藏
- 输入框 / 可编辑区域跳过
- 设置开关：`enableHoverButton`，默认 `true`
- 单元测试 + 手动验收清单
- 与现有右键 / Alt+T / 浮动卡片 / 缓存 / 历史 / 侧边栏完全共存

**v1 不包含（明确 YAGNI）：**
- "持久浮标"模式（点击后不消失，可继续选下一段）
- 浮标上的快捷栏（"复制"、"朗读"等多按钮）
- 浮标自动跟随滚动（实现复杂、收益小，直接 hide 后让用户重选更简单）
- 划词后**自动**翻译（无需点击。需要专门 UX 设计，可能 v2）
- 跨 iframe 选区支持（浏览器安全模型限制，复杂，v2 再议）

---

## 2. 架构

引入新模块 `src/content/hover-button.ts`（与 `floating-card.ts` 对等），由 content script 编排器协调。**不修改** background / shared / sidepanel / options 的核心逻辑（仅 options 增加一个开关 UI、shared/types 增加一个布尔字段）。

```
┌──────── 用户在网页（content script 注入） ────────┐
│                                                    │
│   mouseup ─────► content/index.ts 编排器           │
│                       │                            │
│                       ├ 选区为空？ → 跳过           │
│                       ├ 在编辑区？ → 跳过           │
│                       ├ 设置已禁用？ → 跳过         │
│                       │                            │
│                       └ HoverButton.show(rect, cb) │
│                              │                     │
│                       (注入 Shadow DOM 浮标)        │
│                                                    │
│   用户点击浮标 ──► cb() ─► handleTrigger(text)     │
│                              │                     │
│                              └ 复用现有路径：      │
│                                FloatingCard.mount  │
│                                → port → SW         │
│                                → 流式翻译          │
│                                                    │
│   selectionchange/scroll/外部 mousedown            │
│       └─► HoverButton.hide()                       │
│                                                    │
└────────────────────────────────────────────────────┘
```

### 2.1 关键设计决策

1. **独立模块、独立 Shadow DOM**。`HoverButton` 不复用 `FloatingCard`：两者是不同状态机（浮标=待触发态，卡片=已触发态），生命周期独立，强行合并违反单一职责。
2. **复用 `handleTrigger`**。点击浮标后走的代码路径与右键菜单完全一致，避免分叉。
3. **编辑区域跳过**。沿 selection 的 `commonAncestorContainer` 向上遍历 parentNode，遇到 `<input>`、`<textarea>`、或 `el.isContentEditable === true` 即视为编辑区。
4. **隐藏策略简洁**：滚动 / 选区变化 / 外部点击 → 直接 hide，不做"跟随选区位置"的复杂跟踪。用户重选即可。
5. **设置同步策略不变**：`enableHoverButton` 是非敏感字段，写入 `storage.sync`，content script 通过 `getPublicSettings()` 读取。

### 2.2 与 v0.2.0 的兼容性

- 右键菜单：保留所有逻辑不变。
- Alt+T 快捷键：保留所有逻辑不变。
- 浮动卡片 (`FloatingCard`)：不修改，浮标点击后调用同一 mount 路径。
- Background SW / translator / cache / 历史：完全不变。
- Settings：仅追加 `enableHoverButton` 字段（默认 `true`，向后兼容——旧用户首次升级即默认启用）。

---

## 3. 组件与目录结构

### 3.1 新增文件

```
src/content/
├── hover-button.ts           # HoverButton 类（Shadow DOM）
└── hover-button.css          # 浮标样式

tests/unit/
└── hover-button.test.ts      # mount/hide/onClick + isInEditable 测试
```

### 3.2 修改文件

| 文件 | 修改 |
|---|---|
| `src/shared/types.ts` | `Settings` 增加 `enableHoverButton: boolean`；`DEFAULT_SETTINGS` 设为 `true` |
| `src/content/index.ts` | 引入 `HoverButton`；增加 mouseup / selectionchange / scroll / mousedown 监听；编排显示与隐藏 |
| `src/options/index.html` | 在"行为"分区追加复选框 `<input type="checkbox" id="enableHoverButton">` |
| `src/options/index.ts` | `inputs` / `fillForm` / `readForm` 各增加一行处理 `enableHoverButton` |
| `tests/unit/storage.test.ts` | 不需修改（getSettings/setSettings 已经透明处理新字段） |

### 3.3 模块职责

| 模块 | 做什么 | 谁调用 | 依赖 |
|---|---|---|---|
| `HoverButton` 类 | `show(rect, onClick) / hide() / isShown() / destroy()`；管理 Shadow DOM 生命周期 | `content/index.ts` | DOM API |
| `isInEditable(node)` | 沿 parentNode 向上找，判断节点是否在编辑区 | `content/index.ts` | DOM API |
| `content/index.ts` 编排 | 监听全局事件，决定何时 show / hide | （入口） | `HoverButton`, `getPublicSettings`, `getSelectionText/Rect` |

---

## 4. 数据流

### 4.1 显示浮标

```
[用户] 拖选 → 鼠标松开
   │
[document.mouseup listener]
   │  text = getSelectionText()
   │  if (!text || text.length < 2) return
   │  if (settings.enableHoverButton === false) return
   │  if (isInEditable(selection.anchorNode)) return
   │  rect = getSelectionRect()
   │  if (!rect) return
   │  hoverButton.show(rect, () => handleTrigger(text))
```

阈值 `text.length < 2` 是硬编码（防止误触单字符选区，例如双击只选了一个汉字）。这是体感优化，不暴露为设置。

### 4.2 隐藏浮标

```
[document.selectionchange listener]
   │  if (window.getSelection() 为空 || collapsed)
   │      hoverButton.hide()

[document.mousedown listener (capture)]
   │  if (e.composedPath() 不包含浮标 host)
   │      hoverButton.hide()

[window.scroll listener]
   │  hoverButton.hide()

[card 触发后]
   │  hoverButton.hide()  (避免遮挡卡片)
```

### 4.3 点击浮标

```
[用户] 点击浮标按钮
   │
[hover-button.ts] 内部 click handler
   │  e.stopPropagation()  (避免触发外部 mousedown 隐藏逻辑)
   │  onClick()            (= () => handleTrigger(text))
   │  this.hide()
```

### 4.4 数据形状

```ts
// shared/types.ts
type Settings = {
    // ... 既有字段不变 ...
    enableHoverButton: boolean;   // 新增，默认 true
};

// hover-button.ts
type HoverButtonCallbacks = {
    onClick: () => void;
};

class HoverButton {
    show(rect: DOMRect, onClick: () => void): void;
    hide(): void;
    isShown(): boolean;
}
```

---

## 5. 错误处理与边界

| 场景 | 处理 |
|---|---|
| `document.body` 不存在（极端早期注入） | try/catch 包住 `document.body.appendChild`，silently 跳过 |
| 选区跨多个元素 | `getBoundingClientRect()` 返回包围矩形，浮标定位在 `(rect.right - 24, rect.bottom + 4)` |
| 浮标即将超出视口右边 | 改为 `rect.right - cardW - 4` 收回 |
| 浮标即将超出视口下边 | 改贴在选区上方 `rect.top - 28` |
| 选区文本 < 2 字符 | 不显示 |
| Selection.anchorNode 为 null | 当作"非编辑区"处理（保险默认） |
| Shadow DOM 被宿主页面 JS 强制移除 | hide 时 `host?.parentNode?.removeChild(host)` 加 null 检查 |
| 高频 mouseup（页面有滑动选择脚本） | 每次 show 前先 hide，避免叠加多个 host |

---

## 6. 决策记录

### 6.1 为什么独立模块而非扩展 FloatingCard

`FloatingCard` 的核心抽象是 "已被触发的、显示翻译结果的卡片"——状态包括 loading / streaming / done / error / long-confirm。若硬塞进一个 "preview button" 状态，类的语义就变成了"任意 UI 浮层"，单一职责崩溃。独立 `HoverButton` 模块更清晰，未来如果加划词浮标的快捷栏（v2）也容易扩展。

### 6.2 为什么浮标不自动跟随滚动

实现"跟随"需要 `requestAnimationFrame` 持续重算位置，或用 `IntersectionObserver`。复杂度成本远高于"滚动即隐藏，让用户重选"的体感差异。后者已是大多数翻译扩展的标准做法。

### 6.3 为什么 mouseup 触发而非 selectionchange

`selectionchange` 在用户拖动选区过程中持续触发，会导致浮标在拖动中"闪烁出现"。`mouseup` 是清晰的"选择完成"信号。键盘选区（Shift+方向键）暂不支持浮标——v1 牺牲，v2 可加 keyup 监听。

### 6.4 为什么编辑区不显示浮标

编辑场景中"选中文字"的高频意图是剪切/复制/格式化/删除，**不是**翻译。每次选中都跳出浮标会被认为是 bug 而非功能。需要在编辑区翻译时，右键菜单仍可用——零功能损失。

### 6.5 为什么默认开启 `enableHoverButton`

v0.2.0 用户升级到本版本后，最自然的体验是"立刻看到新功能"。如果默认关闭，需要主动找到设置开关，发现率会很低。开启后若觉得烦人，关闭路径明确（设置页一个复选框）。

---

## 7. 测试策略

### 7.1 单元测试（新增 `tests/unit/hover-button.test.ts`）

| 测试用例 | 验证 |
|---|---|
| `show(rect)` 后 host 被加入 document.body | DOM 注入 |
| `hide()` 后 host 被移除 | 清理 |
| `isShown()` 反映状态 | 状态查询 |
| 重复 `show()` 不创建多个 host | 幂等 |
| 点击浮标按钮触发 onClick 回调 | 事件 |
| 点击浮标时 e.stopPropagation 被调用 | 不冒泡 |
| `isInEditable` 对 input/textarea/contenteditable/nested/普通 div 的判定 | 6 个用例 |
| 视口边界：浮标右溢出时 left 收回 | 定位逻辑 |
| 视口边界：浮标下溢出时改贴选区上方 | 定位逻辑 |

预计 ~12 个新用例，全套测试 64 + 12 = 76 个。

### 7.2 storage.test.ts 回归

`enableHoverButton` 字段加入 `Settings`/`DEFAULT_SETTINGS` 后，"returns defaults when nothing stored" 这条测试会比较 `DEFAULT_SETTINGS`——两边同时变化，应自然通过。如果不通过则修测试。

### 7.3 手动验收（追加到 README）

- [ ] 在 https://en.wikipedia.org 段落选词 → 右下角浮标出现 → 单击 → 浮动卡片弹出 → 译文流式显示
- [ ] 在 Gmail compose 输入框选词 → **不**出现浮标；右键仍可翻译
- [ ] 在 GitHub Issue 描述（展示区）选词 → 出现浮标；在 Issue 评论 textarea 选词 → 不出现
- [ ] 在 Notion 页面**阅读模式**选词 → 出现；**编辑模式**（contenteditable）选词 → 不出现
- [ ] 选区清空 → 浮标立即消失
- [ ] 滚动页面 → 浮标消失
- [ ] 点击页面其他位置 → 浮标消失
- [ ] 在选项页关闭"启用划词浮标" → 划词不再出现浮标，右键和 Alt+T 仍正常
- [ ] 浮标样式不被 GitHub / Twitter / Notion 的 CSS 污染（Shadow DOM 验证）
- [ ] 浮标位置：靠近选区右下，不漂浮于屏幕外
- [ ] 视口右边界 / 下边界附近选词，浮标自动收回，不被裁切
- [ ] 单字符选区不显示浮标

---

## 8. 验收标准

v1 视为完成，当：

1. 浮标在主流网站正文区可正常出现并触发翻译（流程 A 全通）
2. 输入框 / 编辑区 / 受限场景不出现浮标
3. 设置页"启用划词浮标"开关功能正常
4. 不引入回归：v0.2.0 全部功能（右键、Alt+T、卡片、缓存、历史、侧边栏）行为不变
5. Vitest 全套通过：≥76 个测试
6. 手动验收清单（§7.3）全部通过
7. 合并 / tag v0.3.0
