import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getTextbookById, textbookCatalog } from "../app/materials/textbook_catalog.js";

test("资料中心收录七年级语数外上下册共六本教材", () => {
  assert.equal(textbookCatalog.length, 6);
  assert.deepEqual(
    [...new Set(textbookCatalog.map((book) => book.subject))].sort(),
    ["数学", "英语", "语文"].sort()
  );
});

test("只能通过教材编号取得白名单内的 PDF", () => {
  assert.equal(getTextbookById("math-7-upper")?.semester, "上册");
  assert.equal(getTextbookById("../../secret"), null);
});

test("云端教材支持私有挂载，且在访问文件前验证登录和白名单", () => {
  const source = readFileSync(new URL("../app/api/materials/[bookId]/route.ts", import.meta.url), "utf8");
  assert.ok(source.includes("process.env.MATERIALS_DIRECTORY"));
  assert.ok(source.indexOf("await verifyAuthenticatedSession()") < source.indexOf("await stat(filePath)"));
  assert.ok(source.indexOf("if (!textbook)") < source.indexOf("await stat(filePath)"));
  assert.ok(source.includes('"Cache-Control": "private,'));
});
