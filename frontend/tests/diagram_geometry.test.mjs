import test from "node:test";
import assert from "node:assert/strict";
import { sectorPath } from "../app/diagnosis/diagram_geometry.ts";

test("篮球扇区从顶部顺时针到右侧，其他部分使用大圆弧", () => {
  assert.equal(sectorPath(130, 125, 85, -90, 0), "M 130 125 L 130 40 A 85 85 0 0 1 215 125 Z");
  assert.match(sectorPath(130, 125, 85, 0, 270), /A 85 85 0 1 1/);
});
