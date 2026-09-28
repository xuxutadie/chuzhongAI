import assert from "node:assert/strict";
import test from "node:test";

import {
  getDashboardParticleSettings,
  getStarOrbitSettings
} from "../app/components/star_orbit_model.js";

test("移动端降低星点数量并限制像素密度", () => {
  assert.deepEqual(
    getStarOrbitSettings({ viewportWidth: 390, prefersReducedMotion: false }),
    {
      starCount: 180,
      pixelRatioCap: 1.25,
      motionEnabled: true
    }
  );
});

test("减少动态效果时停止星轨动画", () => {
  assert.equal(
    getStarOrbitSettings({ viewportWidth: 1440, prefersReducedMotion: true }).motionEnabled,
    false
  );
});

test("首页背景在移动端使用更轻量的粒子预算", () => {
  assert.deepEqual(
    getDashboardParticleSettings({ viewportWidth: 390, prefersReducedMotion: false }),
    {
      particleCount: 260,
      pixelRatioCap: 1.25,
      motionEnabled: true
    }
  );
});
