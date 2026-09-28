# 分组式侧栏导航轮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变现有中文导航、路由和手机端可访问性的前提下，为桌面端侧栏提供分组式弧形导航轮。

**Architecture:** 新增一个纯 JavaScript 焦点计算模块，负责按当前路由初始化焦点、处理上下移动并限制边界。新增一个客户端 `CurvedNavigationGroup` 组件，将每个导航分组作为独立的键盘、滚轮和拖拽交互区域；`StudentNav` 仅将导航数据和当前路径传入。CSS 负责桌面端的曲线透视与手机端的扁平回退。

**Tech Stack:** Next.js App Router、React 19、TypeScript、现有 Node.js 测试运行器、CSS。

---

### Task 1: 为焦点移动规则建立测试和纯函数

**Files:**
- Create: `frontend/app/components/curved_navigation_model.js`
- Create: `frontend/app/components/curved_navigation_model.d.ts`
- Create: `frontend/tests/curved_navigation_model.test.mjs`

- [x] **Step 1: 写入失败测试，定义当前路径和键盘移动行为**

```js
import assert from "node:assert/strict";
import test from "node:test";

import { getInitialFocusIndex, moveFocusIndex } from "../app/components/curved_navigation_model.js";

const items = [{ href: "/dashboard" }, { href: "/profile" }, { href: "/reports" }];

test("当前路径决定分组的初始焦点", () => {
  assert.equal(getInitialFocusIndex(items, "/profile"), 1);
  assert.equal(getInitialFocusIndex(items, "/unknown"), 0);
});

test("焦点在首尾停止，不会越界", () => {
  assert.equal(moveFocusIndex(0, -1, items.length), 0);
  assert.equal(moveFocusIndex(1, 1, items.length), 2);
  assert.equal(moveFocusIndex(2, 1, items.length), 2);
});
```

- [x] **Step 2: 运行测试，确认因模块不存在而失败**

Run: `node --test tests/curved_navigation_model.test.mjs`

Expected: FAIL，提示找不到 `curved_navigation_model.js`。

- [x] **Step 3: 实现最小焦点计算模块及其 TypeScript 声明**

```js
export function getInitialFocusIndex(items, pathname) {
  const index = items.findIndex((item) => item.href === pathname);
  return index >= 0 ? index : 0;
}

export function moveFocusIndex(index, delta, itemCount) {
  const lastIndex = Math.max(itemCount - 1, 0);
  return Math.min(Math.max(index + delta, 0), lastIndex);
}
```

```ts
export interface CurvedNavigationItem {
  href: string;
  label: string;
  shortLabel: string;
  tone?: "blue" | "mint" | "gold";
}

export function getInitialFocusIndex(items: CurvedNavigationItem[], pathname: string): number;
export function moveFocusIndex(index: number, delta: number, itemCount: number): number;
```

- [x] **Step 4: 运行测试，确认通过**

Run: `node --test tests/curved_navigation_model.test.mjs`

Expected: PASS，2 个测试通过。

### Task 2: 实现单分组弧形导航轮组件

**Files:**
- Create: `frontend/app/components/curved_navigation_group.tsx`
- Modify: `frontend/app/components/student_nav.tsx`

- [x] **Step 1: 在组件中使用焦点模型，并以当前路由初始化状态**

```tsx
const [focusIndex, setFocusIndex] = useState(() => getInitialFocusIndex(items, pathname));

useEffect(() => {
  setFocusIndex(getInitialFocusIndex(items, pathname));
}, [items, pathname]);
```

- [x] **Step 2: 为方向键、滚轮和拖拽增加统一的焦点移动入口**

```tsx
const changeFocus = useCallback((delta: number) => {
  setFocusIndex((current) => moveFocusIndex(current, delta, items.length));
}, [items.length]);

const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  changeFocus(event.key === "ArrowUp" ? -1 : 1);
};
```

- [x] **Step 3: 将每项保留为 `Link`，由组件计算稳定的视觉 CSS 变量**

```tsx
<Link
  className={item.tone ? `nav-link nav-link-${item.tone}` : "nav-link"}
  href={item.href}
  aria-current={isActive ? "page" : undefined}
  style={{
    "--nav-translate-x": `${-Math.min(Math.abs(index - focusIndex) * 7, 18)}px`,
    "--nav-translate-y": `${(index - focusIndex) * 3}px`,
    "--nav-rotation": `${(index - focusIndex) * 3.5}deg`,
    "--nav-opacity": String(Math.max(0.48, 1 - Math.abs(index - focusIndex) * 0.22)),
    "--nav-blur": `${Math.min(Math.abs(index - focusIndex) * 0.45, 1.2)}px`
  } as React.CSSProperties}
>
  <span className="nav-indicator" aria-hidden="true" />
  <span>{item.label}</span>
</Link>
```

- [x] **Step 4: 在 `StudentNav` 中用组件替代原有的分组链接循环**

```tsx
<CurvedNavigationGroup
  group={group}
  key={group.label}
  pathname={pathname}
/>
```

- [x] **Step 5: 运行类型检查，确认组件声明和 JSX 类型正确**

Run: `pnpm run type-check`

Expected: PASS，退出码为 0。

### Task 3: 加入桌面弧形样式与手机端回退

**Files:**
- Modify: `frontend/app/globals.css`

- [x] **Step 1: 给分组导航轮添加固定高度和受控裁切区域**

```css
.curved-navigation-group {
  position: relative;
  min-height: 132px;
  overflow: hidden;
}

.curved-navigation-list {
  position: relative;
  min-height: 104px;
  outline: none;
}
```

- [x] **Step 2: 用组件输出的 CSS 变量呈现弧线、淡化、虚化与高亮，而不遮挡可点击文字**

```css
.curved-navigation-list .nav-link {
  transform: translate(var(--nav-translate-x), var(--nav-translate-y)) rotate(var(--nav-rotation));
  opacity: var(--nav-opacity);
  filter: blur(var(--nav-blur));
  transition: transform 180ms ease, opacity 180ms ease, filter 180ms ease;
}

.curved-navigation-list .nav-link[aria-current="page"] {
  opacity: 1;
  filter: none;
}
```

- [x] **Step 3: 在窄屏断点取消变形，恢复现有横向扁平导航效果**

```css
@media (max-width: 760px) {
  .curved-navigation-group,
  .curved-navigation-list {
    display: contents;
  }

  .curved-navigation-list .nav-link {
    transform: none;
    opacity: 1;
    filter: none;
  }
}
```

- [x] **Step 4: 在桌面和手机宽度手动检查当前页高亮、入口可读性和无重叠**

Run: 打开 `http://127.0.0.1:3002/dashboard`，检查 1440px 与 390px 宽度。

Expected: 桌面端每组具有弧形焦点效果；手机端所有导航仍可横向滚动和点击。

### Task 4: 全量验证

**Files:**
- Verify: `frontend/tests/curved_navigation_model.test.mjs`
- Verify: `frontend/tests/workspace_navigation_model.test.mjs`
- Verify: `frontend/app/components/student_nav.tsx`

- [x] **Step 1: 运行模型和既有导航测试**

Run: `node --test tests/curved_navigation_model.test.mjs tests/workspace_navigation_model.test.mjs`

Expected: PASS，所有测试通过。

- [x] **Step 2: 运行 TypeScript 检查**

Run: `pnpm run type-check`

Expected: PASS，退出码为 0。

- [x] **Step 3: 在浏览器中检查所有 11 个导航链接和控制台**

Run: 依次点击学习总览、学科学习、学习工具和 AI 教练分组中的入口。

Expected: 每个入口进入原有路由，当前页保留 `aria-current="page"`，控制台无错误。

### 交付说明

- 不新增依赖，不改动 `workspace_navigation_model.js` 的导航文字或路由。
- 不执行 Git 提交，遵循项目约束。
