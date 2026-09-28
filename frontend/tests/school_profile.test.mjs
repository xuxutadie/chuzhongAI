import test from "node:test";
import assert from "node:assert/strict";
import { emptyFields, interviewFor, needsSchoolSupplement } from "../app/diagnosis/model.ts";

test("学校班级逐问且允许如实待定", () => {
  const rows = interviewFor(emptyFields);
  assert.deepEqual(rows.slice(0, 5).map(row => row.field), ["nickname", "grade", "school_name", "class_name", "textbook"]);
  assert.ok(rows[2].options.includes("暂未入学"));
  assert.ok(rows[3].options.includes("待分班"));
});
test("旧档案只补资料，不要求重新访谈", () => {
  assert.equal(needsSchoolSupplement({ confirmed: true, fields: {}, revision: 1 }), true);
  assert.equal(needsSchoolSupplement({ confirmed: false, fields: {}, revision: 0 }), false);
  assert.equal(needsSchoolSupplement({ confirmed: true, fields: { school_name: "学校", class_name: "一班" } }), false);
});
