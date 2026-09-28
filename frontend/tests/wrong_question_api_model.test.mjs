import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeIntegrationStatus,
  normalizeWrongQuestionPage,
  normalizeWrongQuestions,
} from "../app/student-api.ts";

test("服务端错题列表只保留文本元数据和 hasImage 标识，不接收图片字节", () => {
  const questions = normalizeWrongQuestions({
    questions: [
      {
        id: 12,
        subject: "数学",
        question_text: "求圆柱体积",
        knowledge_points: ["圆柱", "体积"],
        error_reason: "单位换算错误",
        analysis_summary: null,
        analysis_status: "not_requested",
        has_image: true,
        created_at: "2026-09-05T08:00:00Z",
        updated_at: "2026-09-05T08:00:00Z",
        image_data: "must-not-be-carried",
      },
    ],
  });

  assert.deepEqual(questions, [{
    id: 12,
    subject: "数学",
    questionText: "求圆柱体积",
    knowledgePoints: ["圆柱", "体积"],
    errorReason: "单位换算错误",
    analysisSummary: null,
    analysisStatus: "not_requested",
    hasImage: true,
    createdAt: "2026-09-05T08:00:00Z",
    updatedAt: "2026-09-05T08:00:00Z",
  }]);
});

test("错题列表保留服务端分页元数据，不能把首页误当成全部记录", () => {
  const page = normalizeWrongQuestionPage({
    questions: [{
      id: 13,
      subject: "英语",
      question_text: "Choose the correct word.",
      knowledge_points: [],
      error_reason: null,
      analysis_summary: null,
      analysis_status: "not_requested",
      has_image: false,
      created_at: "2026-09-05T08:00:00Z",
      updated_at: "2026-09-05T08:00:00Z",
    }],
    total: 73,
    limit: 50,
    offset: 0,
  });

  assert.equal(page.total, 73);
  assert.equal(page.limit, 50);
  assert.equal(page.offset, 0);
  assert.equal(page.questions.length, 1);
});

test("能力状态解析不会把异常响应误认为已配置", () => {
  assert.deepEqual(normalizeIntegrationStatus({
    ocr: { enabled: true, configured: true, provider: "vision", model: "vision-1" },
    llm: { enabled: false, configured: false },
  }), {
    ocr: { enabled: true, configured: true, provider: "vision", model: "vision-1" },
    llm: { enabled: false, configured: false, provider: null, model: null },
  });
  assert.deepEqual(normalizeIntegrationStatus({}), {
    ocr: { enabled: false, configured: false, provider: null, model: null },
    llm: { enabled: false, configured: false, provider: null, model: null },
  });
});
