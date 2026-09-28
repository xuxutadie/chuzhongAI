const supportedSolids = new Set(["cube", "cuboid", "cylinder", "cone", "sphere"]);
const supportedCrossSections = {
  cube: new Set(["parallel-base", "diagonal", "vertex", "hexagon"]),
  cuboid: new Set(["parallel-base", "diagonal"]),
  cylinder: new Set(["parallel-base"]),
  cone: new Set(["parallel-base"]),
  sphere: new Set(["center"]),
};

/**
 * 校验题目图形是否能由当前课件准确呈现。
 * 不支持时必须阻止题目进入学习流程，不能静默退回到正方体。
 */
export function validateVisualPresentation(visual) {
  if (visual.kind === "solid-model") {
    return supportedSolids.has(visual.solid)
      ? { ok: true }
      : { ok: false, error: `不支持的立体模型：${visual.solid}` };
  }

  if (visual.kind === "cross-section") {
    const presets = supportedCrossSections[visual.solid];
    if (!presets?.has(visual.planePreset)) {
      return { ok: false, error: `${solidLabel(visual.solid)}截面不支持 ${visual.planePreset}` };
    }
  }

  return { ok: true };
}

/** 将题目图形配置转换为课件的受限展示参数。 */
export function createVisualPresentation(question) {
  if (!question.visual) return null;

  const validation = validateVisualPresentation(question.visual);
  if (!validation.ok) return null;

  const mode = question.responseType === "interactive" ? "challenge" : "preview";
  switch (question.visual.kind) {
    case "solid-model":
      return { mode, section: "shapes", solid: question.visual.solid };
    case "folding-net":
      return { mode, section: "fold", netId: question.visual.netId };
    case "cross-section":
      return {
        mode,
        section: "cut",
        solid: question.visual.solid,
        planePreset: question.visual.planePreset,
      };
    case "orthographic-view":
      return {
        mode,
        section: "views",
        structureId: question.visual.structureId,
        view: question.visual.view,
      };
    default:
      return null;
  }
}

function solidLabel(solid) {
  return ({ cube: "正方体", cuboid: "长方体", cylinder: "圆柱", cone: "圆锥", sphere: "球" })[solid] ?? solid;
}
