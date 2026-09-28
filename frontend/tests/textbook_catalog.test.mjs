import test from "node:test";
import assert from "node:assert/strict";

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
