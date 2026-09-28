import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('章节复习可以独立进入，不覆盖当天任务或写入成长值', () => {
  const source = fs.readFileSync(new URL('../app/components/math_curriculum_review.tsx', import.meta.url), 'utf8');
  assert.match(source, /mathKnowledgePackages/);
  assert.match(source, /章节/);
  assert.match(source, /知识点/);
  assert.match(source, /MathSelfCheckQuestion/);
  assert.match(source, /不改变今日任务/);
  assert.doesNotMatch(source, /completeTask|saveCourseContext|saveWorkspaceEntry/);
  const page = fs.readFileSync(new URL('../app/subjects/math/review/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /StudentPageShell/);
  assert.match(page, /MathCurriculumReview/);
});
