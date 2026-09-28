import type { MathQuestion, MathVisualSpec, ShapeLessonSection } from "./types";

export type VisualPresentation = {
  mode: "preview" | "challenge";
  section: ShapeLessonSection;
  solid?: "cube" | "cuboid" | "cylinder" | "cone" | "sphere";
  planePreset?: string;
  netId?: string;
  structureId?: string;
  view?: "front" | "left" | "top";
};

export type VisualPresentationValidation = { ok: true } | { ok: false; error: string };

export function validateVisualPresentation(visual: MathVisualSpec): VisualPresentationValidation;
export function createVisualPresentation(question: Pick<MathQuestion, "visual" | "responseType">): VisualPresentation | null;
