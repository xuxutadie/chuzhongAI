import assert from "node:assert/strict";
import test from "node:test";

import {
  createNavigationWheelItems,
  getInitialNavigationFocusIndex,
  moveNavigationFocusIndex
} from "../app/components/single_navigation_wheel_model.js";
import { workspaceNavigationGroups } from "../app/components/workspace_navigation_model.js";

test("单一导航轨道保留分组标记和全部中文入口顺序", () => {
  const items = createNavigationWheelItems(workspaceNavigationGroups);
  const markers = items.filter((item) => item.type === "marker");
  const links = items.filter((item) => item.type === "link");

  assert.equal(markers.length, 4);
  assert.equal(links.length, 5);
  assert.deepEqual(
    items.slice(0, 3).map((item) => item.label),
    ["学习总览", "学习首页", "学科学习"]
  );
  assert.deepEqual(items.slice(-3).map((item) => item.label), ["诊断报告", "AI 教练", "AI 教练"]);
});

test("焦点只停留在可跳转的链接上", () => {
  const items = createNavigationWheelItems(workspaceNavigationGroups);
  const dashboardIndex = getInitialNavigationFocusIndex(items, "/dashboard");
  const profileIndex = moveNavigationFocusIndex(items, dashboardIndex, 1);

  assert.equal(items[dashboardIndex].label, "学习首页");
  assert.equal(items[profileIndex].label, "数学学习");
  assert.equal(items[moveNavigationFocusIndex(items, dashboardIndex, -1)].label, "学习首页");
});
