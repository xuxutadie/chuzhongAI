import type { MathKnowledgePackage } from "./types";

export type CourseCatalog = Array<{
  subject: "数学";
  textbookVersion: "北师大版";
  grade: 7;
  semester: "上册" | "下册";
  chapters: Array<{
    id: string;
    title: string;
    knowledgePointIds: string[];
  }>;
}>;

/** 只从已导入的能力包生成课程目录，避免展示尚未具备题目的课程。 */
export function getAvailableCourses(packages: MathKnowledgePackage[]): CourseCatalog {
  const groups = new Map<string, CourseCatalog[number]>();
  for (const pack of packages) {
    const groupKey = [pack.subject, pack.textbookVersion, pack.grade, pack.semester].join("|");
    const course = groups.get(groupKey) ?? {
      subject: pack.subject,
      textbookVersion: pack.textbookVersion,
      grade: pack.grade,
      semester: pack.semester,
      chapters: [],
    };
    const chapter = course.chapters.find((item) => item.id === pack.chapterId) ?? {
      id: pack.chapterId,
      title: chapterTitle(pack.chapterId),
      knowledgePointIds: [],
    };
    if (!chapter.knowledgePointIds.includes(pack.id)) chapter.knowledgePointIds.push(pack.id);
    if (!course.chapters.includes(chapter)) course.chapters.push(chapter);
    groups.set(groupKey, course);
  }
  return [...groups.values()];
}

function chapterTitle(chapterId: string) {
  const titles: Record<string, string> = {
    "g7u-chapter-1": "第一章 丰富的图形世界",
    "g7u-chapter-2": "第二章 有理数及其运算",
    "g7u-chapter-3": "第三章 整式及其加减",
    "g7u-chapter-4": "第四章 基本平面图形",
    "g7u-chapter-5": "第五章 一元一次方程",
    "g7u-chapter-6": "第六章 数据的收集与整理",
  };
  return titles[chapterId] ?? chapterId;
}
