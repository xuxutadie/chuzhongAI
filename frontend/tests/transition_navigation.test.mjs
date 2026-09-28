import assert from "node:assert/strict";
import test from "node:test";
import { isSubjectEnabled, isHiddenSubjectPath } from "../app/subject-visibility.js";
import { workspaceNavigationGroups } from "../app/components/workspace_navigation_model.js";

test("数学单科开关保留数学并关闭语文英语入口", () => {
  assert.equal(isSubjectEnabled("数学"), true);
  assert.equal(isSubjectEnabled("英语"), false);
  assert.equal(isHiddenSubjectPath("/subjects/english/g7u-u1"), true);
  assert.equal(isHiddenSubjectPath("/tasks/chinese-20"), true);
  assert.equal(isHiddenSubjectPath("/subjects/math"), false);
});
test("主导航收拢为五个入口", () => {
  assert.deepEqual(workspaceNavigationGroups.flatMap(g => g.items).map(i => i.href),
    ["/dashboard", "/subjects/math", "/wrong-questions", "/reports", "/assistant"]);
});
