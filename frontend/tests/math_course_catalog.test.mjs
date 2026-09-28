import assert from "node:assert/strict";
import test from "node:test";

const catalogUrl = new URL("../app/math-learning/course-catalog.ts", import.meta.url);
const packUrl = new URL("../app/math-learning/chapter1-shapes-pack.ts", import.meta.url);

test("课程目录只展示已导入的教材、册别、章节和知识点", async () => {
  const { getAvailableCourses } = await import(catalogUrl.href);
  const { chapter1ShapePackages } = await import(packUrl.href);
  assert.deepEqual(getAvailableCourses(chapter1ShapePackages), [{
    subject: "数学",
    textbookVersion: "北师大版",
    grade: 7,
    semester: "上册",
    chapters: [{
      id: "g7u-chapter-1",
      title: "第一章 丰富的图形世界",
      knowledgePointIds: [
        "g7u-shapes-solid",
        "g7u-shapes-folding",
        "g7u-shapes-section",
        "g7u-shapes-views",
      ],
    }],
  }]);
});
