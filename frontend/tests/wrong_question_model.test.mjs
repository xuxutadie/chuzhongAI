import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWrongQuestionPayload,
  getWrongQuestionImagePath,
  splitKnowledgePoints,
  validateWrongQuestionDraft,
  validateWrongQuestionFile,
} from "../app/wrong-questions/wrong_question_model.js";

test("错题保存始终要求学生确认非空题干，不能仅凭图片自动入库", () => {
  assert.equal(
    validateWrongQuestionDraft({ questionText: "  " }),
    "请先确认或填写题目文字，再保存到错题集。"
  );
});

test("上传预检只接受三种图片且限制为 5MB", () => {
  assert.equal(
    validateWrongQuestionFile({ type: "image/gif", size: 120 }),
    "请选择 JPG、PNG 或 WebP 图片。"
  );
  assert.equal(
    validateWrongQuestionFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }),
    "图片不能超过 5MB，请裁剪题目区域后重试。"
  );
  assert.equal(validateWrongQuestionFile({ type: "image/webp", size: 1024 }), "");
});

test("知识点输入会去重拆分，保存负载不含本地图片或示例数据", () => {
  const payload = buildWrongQuestionPayload({
    subject: "数学",
    questionText: "  解方程 2x + 3 = 9  ",
    knowledgePointsText: "一元一次方程、移项， 一元一次方程",
    errorReason: "  移项时符号写错  ",
    sourceUploadId: "upload-123",
  });

  assert.deepEqual(payload, {
    subject: "数学",
    question_text: "解方程 2x + 3 = 9",
    knowledge_points: ["一元一次方程", "移项"],
    error_reason: "移项时符号写错",
    source_upload_id: "upload-123",
  });
  assert.deepEqual(splitKnowledgePoints("圆柱、 体积，圆柱"), ["圆柱", "体积"]);
});

test("错题图片只使用同源受保护资源路径", () => {
  assert.equal(getWrongQuestionImagePath(42), "/api/student/wrong-questions/42/image");
  assert.equal(getWrongQuestionImagePath("42/evil"), "/api/student/wrong-questions/42%2Fevil/image");
});
