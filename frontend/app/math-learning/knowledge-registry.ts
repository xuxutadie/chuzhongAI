import chapter2 from "../../../shared/curriculum/g7-upper/chapter-2.json" with { type: "json" };
import chapter3 from "../../../shared/curriculum/g7-upper/chapter-3.json" with { type: "json" };
import chapter4 from "../../../shared/curriculum/g7-upper/chapter-4.json" with { type: "json" };
import chapter5 from "../../../shared/curriculum/g7-upper/chapter-5.json" with { type: "json" };
import chapter6 from "../../../shared/curriculum/g7-upper/chapter-6.json" with { type: "json" };
import { chapter1ShapePackages } from "./chapter1-shapes-pack.ts";
import type { MathKnowledgePackage } from "./types";

// 新章目录与服务端判分使用同一份受版本控制的静态数据；保留第一章的稳定题号。
export const additionalMathChapters = [chapter2, chapter3, chapter4, chapter5, chapter6];
export const mathKnowledgePackages: MathKnowledgePackage[] = [
  ...chapter1ShapePackages,
  ...additionalMathChapters.flatMap((chapter) => chapter.packages) as MathKnowledgePackage[],
];

export function getMathKnowledgePackage(id: string) {
  return mathKnowledgePackages.find((pack) => pack.id === id) ?? null;
}
