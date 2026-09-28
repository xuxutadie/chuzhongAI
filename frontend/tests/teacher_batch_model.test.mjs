import assert from "node:assert/strict";
import test from "node:test";
import { parseStudentBatch } from "../app/teacher-batch-model.ts";

test("批量名单支持逗号、中文逗号和从表格复制的制表符", () => {
  assert.deepEqual(parseStudentBatch("stu001,小林,unique-test-pass,初一\nstu002\t小王\tdifferent-test-pass\t初二\nstu003，小张，another-test-pass"), [
    { username: "stu001", displayName: "小林", password: "unique-test-pass", grade: "初一" },
    { username: "stu002", displayName: "小王", password: "different-test-pass", grade: "初二" },
    { username: "stu003", displayName: "小张", password: "another-test-pass", grade: "" },
  ]);
});

test("批量名单拒绝空名单、大小写重复、超过50人和字段缺失", () => {
  assert.throws(() => parseStudentBatch("  "), /名单/);
  assert.throws(() => parseStudentBatch("stu001,小林,passwordA\nSTU001,小王,passwordB"), /重复/);
  assert.throws(() => parseStudentBatch(Array.from({ length: 51 }, (_, i) => `stu${i},小林,password${i}`).join("\n")), /50/);
  assert.throws(() => parseStudentBatch("stu001,小林"), /第 1 行/);
});

test("校验错误只显示行号，不回显名单里的密码", () => {
  const secret = "short";
  assert.throws(() => parseStudentBatch(`stu001,小林,${secret}`), (error) => {
    assert.match(error.message, /第 1 行/);
    assert.equal(error.message.includes(secret), false);
    return true;
  });
});

test("不会悄悄删除合法密码首尾空格", () => {
  assert.equal(parseStudentBatch(" stu001 , 小林 , passwordA , 初一 ")[0].password, " passwordA ");
});
