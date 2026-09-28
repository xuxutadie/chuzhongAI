import type {
  MathKnowledgePackage,
  MathQuestion,
  MathResponseType,
  MathVisualSpec
} from "./types";
import { validateVisualPresentation } from "./visual-presentation.js";

export type ValidationResult = { ok: true } | { ok: false; errors: string[] };

const responseTypes = new Set<MathResponseType>([
  "single-choice",
  "true-false",
  "multi-choice",
  "interactive"
]);

const visualKinds = new Set<MathVisualSpec["kind"]>([
  "solid-model",
  "folding-net",
  "cross-section",
  "orthographic-view"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasVisualPrompt(prompt: string) {
  return /如下图|观察图|看图|图中/.test(prompt);
}

function validateVisual(value: unknown, errors: string[]) {
  if (!isRecord(value) || !hasText(value.kind) || !visualKinds.has(value.kind as MathVisualSpec["kind"])) {
    errors.push("visual.kind 不在允许范围内");
    return;
  }

  const solids = ["cube", "cuboid", "cylinder", "cone", "sphere"];
  if (value.kind === "solid-model" && (!hasText(value.solid) || !solids.includes(value.solid))) {
    errors.push("立体模型缺少有效 solid");
  }
  if (value.kind === "folding-net" && !hasText(value.netId)) {
    errors.push("展开图缺少 netId");
  }
  if (
    value.kind === "cross-section" &&
    (!hasText(value.solid) || !solids.includes(value.solid) || !hasText(value.planePreset))
  ) {
    errors.push("截面图缺少有效 solid 或 planePreset");
  }
  if (
    value.kind === "orthographic-view" &&
    (!hasText(value.structureId) || !hasText(value.view) || !["front", "left", "top"].includes(value.view))
  ) {
    errors.push("三视图缺少有效 structureId 或 view");
  }
}

export function validateQuestion(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["题目必须是对象"] };
  }

  for (const field of ["id", "knowledgePointId", "capabilityTag", "prompt", "explanation"]) {
    if (!hasText(value[field])) {
      errors.push(`${field} 不能为空`);
    }
  }

  if (!hasText(value.responseType) || !responseTypes.has(value.responseType as MathResponseType)) {
    errors.push("responseType 不在允许范围内");
  }

  if (!hasText(value.difficulty) || !["basic", "advanced", "challenge"].includes(value.difficulty)) {
    errors.push("difficulty 不在允许范围内");
  }

  if (!hasText(value.source) || !["local-reviewed", "ai-generated"].includes(value.source)) {
    errors.push("source 不在允许范围内");
  }

  if (value.visual !== undefined) {
    validateVisual(value.visual, errors);
    if (isRecord(value.visual) && hasText(value.visual.kind) && visualKinds.has(value.visual.kind as MathVisualSpec["kind"])) {
      const presentation = validateVisualPresentation(value.visual as MathVisualSpec);
      if (!presentation.ok) errors.push(presentation.error);
    }
  }
  if (hasText(value.prompt) && hasVisualPrompt(value.prompt) && value.visual === undefined) {
    errors.push("看图题必须提供 visual");
  }

  const responseType = value.responseType as MathResponseType;
  if (["single-choice", "true-false", "multi-choice"].includes(responseType)) {
    if (!Array.isArray(value.options) || value.options.length < 2) {
      errors.push("客观题至少需要2个选项");
    } else {
      const optionIds = new Set(
        value.options
          .filter(isRecord)
          .map((option) => option.id)
          .filter(hasText)
      );
      if (responseType === "multi-choice") {
        if (
          !Array.isArray(value.correctAnswer)
          || value.correctAnswer.length === 0
          || value.correctAnswer.some((answer) => !hasText(answer) || !optionIds.has(answer))
        ) {
          errors.push("正确答案必须引用现有选项");
        }
      } else if (!hasText(value.correctAnswer) || !optionIds.has(value.correctAnswer)) {
        errors.push("正确答案必须引用现有选项");
      }
    }
  }

  if (responseType === "interactive") {
    if (value.visual === undefined) {
      errors.push("互动题必须提供 visual");
    }
    if (
      !isRecord(value.correctAnswer)
      || !hasText(value.correctAnswer.challengeId)
      || value.correctAnswer.passed !== true
    ) {
      errors.push("互动题答案必须包含 challengeId 和 passed=true");
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors: [...new Set(errors)] };
}

export function validateKnowledgePackage(value: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["能力包必须是对象"] };
  }

  for (const field of ["id", "title", "lessonId", "chapterId"]) {
    if (!hasText(value[field])) {
      errors.push(`${field} 不能为空`);
    }
  }

  if (!Array.isArray(value.questions) || value.questions.length < 10) {
    errors.push("能力包至少需要10道题");
  }

  if (Array.isArray(value.questions)) {
    const responseTypeCount = new Set(
      value.questions
        .filter(isRecord)
        .map((question) => question.responseType)
        .filter(hasText)
    ).size;
    const minimumResponseTypes = value.learningMode === "explanation" ? 3 : 4;
    if (responseTypeCount < minimumResponseTypes) {
      errors.push(`能力包至少需要${minimumResponseTypes}种作答方式`);
    }
    for (const question of value.questions) {
      const result = validateQuestion(question);
      if (!result.ok) {
        errors.push(...result.errors.map((error) => `题目校验失败：${error}`));
      }
      if (isRecord(question) && hasText(value.id) && question.knowledgePointId !== value.id) {
        errors.push("题目 knowledgePointId 必须与能力包一致");
      }
    }
  }

  if (value.learningMode === "explanation") {
    const guide = value.learningGuide;
    if (!isRecord(guide) || !Array.isArray(guide.steps) || guide.steps.length < 2
      || !guide.steps.every(hasText) || !Array.isArray(guide.pitfalls)
      || !guide.pitfalls.length || !guide.pitfalls.every(hasText)) {
      errors.push("文字学习能力包需要完整学习步骤和易错提醒");
    }
    if (!Array.isArray(value.retestQuestions) || value.retestQuestions.length < 10) {
      errors.push("文字学习能力包需要至少10道独立过关题");
    } else {
      for (const question of value.retestQuestions) {
        const result = validateQuestion(question);
        if (!result.ok) errors.push(...result.errors);
        if (isRecord(question) && question.knowledgePointId !== value.id) {
          errors.push("过关题 knowledgePointId 必须与能力包一致");
        }
      }
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors: [...new Set(errors)] };
}

export function isMathQuestion(value: unknown): value is MathQuestion {
  return validateQuestion(value).ok;
}

export function isMathKnowledgePackage(value: unknown): value is MathKnowledgePackage {
  return validateKnowledgePackage(value).ok;
}
