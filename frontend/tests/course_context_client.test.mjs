import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("课程目录与当前课程选择均经受保护的同源 BFF 转发", () => {
  const catalogRoute = read("../app/api/student/course-catalog/route.ts");
  const contextRoute = read("../app/api/student/course-context/route.ts");

  assert.match(catalogRoute, /"\/me\/course-catalog"/);
  assert.match(contextRoute, /"\/me\/course-context"/);
  assert.match(contextRoute, /export async function PUT/);
});

test("客户端把课程上下文作为真实任务数据，并识别必须先选课程的 409", () => {
  const api = read("../app/student-api.ts");

  assert.match(api, /CourseContextRequiredError/);
  assert.match(api, /course_context_required/);
  assert.match(api, /normalizeCourseCatalog/);
  assert.match(api, /normalizeCourseContext/);
  assert.match(api, /getCourseCatalog/);
  assert.match(api, /saveCourseContext/);
  assert.match(api, /courseContext/);
  assert.match(read("../app/components/course_context_selector.tsx"), /await refreshLearningData\(\)/);
  assert.match(read("../app/components/course_context_selector.tsx"), /当前已开始的数学任务会按原来的课程快照继续/);
});

test("学习进度在未选择课程时不回退成演示任务，并支持刷新真实任务", () => {
  const provider = read("../app/components/learning_progress_provider.tsx");

  assert.match(provider, /CourseContextRequiredError/);
  assert.match(provider, /setCourseContextRequired\(true\)/);
  assert.match(provider, /refreshLearningData/);
  assert.doesNotMatch(provider, /const localTasks = fallbackTodayTasks\(\);[\s\S]{0,160}courseContextRequired/);
});

test("学生默认首页在无课程上下文时直接提供真实课程选择入口", () => {
  const dashboard = read("../app/components/student_dashboard.tsx");

  assert.match(dashboard, /courseContextRequired/);
  assert.match(dashboard, /<CourseContextSelector required \/>/);
  assert.match(dashboard, /先选择今天的课程内容/);
});

test("数学工作台用服务端稳定任务 ID 读取冻结课程快照，而不是猜测页面路径或本地默认教材", () => {
  const math = read("../app/components/math_learning_workspace.tsx");

  assert.match(math, /DAILY_MATH_TASK_ID/);
  assert.match(math, /tasks\.find\(\(task\) => task\.id === DAILY_MATH_TASK_ID\)/);
  assert.match(math, /taskCourseContext\.knowledgePoints/);
  assert.doesNotMatch(math, /availableCourses\[0\]/);
  assert.doesNotMatch(math, /getAvailableCourses/);
});
