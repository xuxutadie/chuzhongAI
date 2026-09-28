/**
 * 根据设备能力选择星轨渲染预算，避免装饰动画影响学习页面的可读性。
 */
export function getStarOrbitSettings({ viewportWidth, prefersReducedMotion }) {
  const isCompact = viewportWidth < 640;

  return {
    starCount: isCompact ? 180 : 360,
    pixelRatioCap: isCompact ? 1.25 : 1.5,
    motionEnabled: !prefersReducedMotion
  };
}

/**
 * 首页背景的粒子数量独立于局部星轨，确保整页氛围不会挤占学习操作的性能预算。
 */
export function getDashboardParticleSettings({ viewportWidth, prefersReducedMotion }) {
  const isCompact = viewportWidth < 640;

  return {
    particleCount: isCompact ? 260 : 680,
    pixelRatioCap: isCompact ? 1.25 : 1.5,
    motionEnabled: !prefersReducedMotion
  };
}
