import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("错题上传 BFF 保留二进制图片与 MIME，不将图片转为文本", () => {
  const source = read("../app/api/student/wrong-questions/uploads/route.ts");

  assert.match(source, /request\.body\?\.getReader\(\)/);
  assert.match(source, /totalBytes > MAX_WRONG_QUESTION_IMAGE_BYTES/);
  assert.match(source, /reader\.cancel\(\)/);
  assert.match(source, /Content-Type/);
  assert.match(source, /wrong-questions\/uploads/);
  assert.match(source, /content-length/i);
  assert.match(source, /5 \* 1024 \* 1024/);
  assert.doesNotMatch(source, /request\.arrayBuffer\(\)/);
  assert.equal(/await\s+request\.text\(\)/.test(source), false);
});

test("后端限流响应会向浏览器保留 Retry-After 等待提示", () => {
  const source = read("../app/api/_backend.ts");
  const authenticatedResponse = source.slice(source.indexOf("export async function createAuthenticatedResponse"));

  assert.match(source, /response\.headers\.get\("retry-after"\)/i);
  assert.match(source, /headers\.set\("Retry-After"/);
  assert.match(authenticatedResponse, /preserveRetryAfter\(response, nextResponse\)/);
});

test("通用受保护 JSON 代理也限制无 Content-Length 的请求体", () => {
  const source = read("../app/api/_backend.ts");

  assert.match(source, /MAX_AUTHENTICATED_JSON_BYTES/);
  assert.match(source, /request\.body\?\.getReader\(\)/);
  assert.match(source, /RequestBodyTooLargeError/);
  assert.doesNotMatch(source, /body: hasBody \? await request\.text\(\)/);
});

test("错题图片和 OCR 均走同源受保护 BFF", () => {
  const stagedImage = read("../app/api/student/wrong-questions/uploads/[uploadId]/image/route.ts");
  const stagedUpload = read("../app/api/student/wrong-questions/uploads/[uploadId]/route.ts");
  const savedImage = read("../app/api/student/wrong-questions/[questionId]/image/route.ts");
  const ocr = read("../app/api/student/ocr/recognize/route.ts");

  assert.match(stagedImage, /relayAuthenticatedBinaryRequest/);
  assert.match(stagedUpload, /relayAuthenticatedRequest/);
  assert.match(stagedUpload, /DELETE/);
  assert.match(savedImage, /relayAuthenticatedBinaryRequest/);
  assert.match(ocr, /relayAuthenticatedRequest/);
  assert.match(ocr, /\/ocr\/recognize/);
});

test("已保存错题图片会带上非秘密的预期账号护栏，避免旧标签页读取新账号 Cookie", () => {
  const card = read("../app/components/wrong_question_record_card.tsx");
  const api = read("../app/student-api.ts");

  assert.match(card, /buildProtectedImageUrl\(getWrongQuestionImagePath\(record\.id\)\)/);
  assert.match(api, /expected_user_id/);
});

test("错题列表将受控分页参数转发给服务端，并提供加载更多入口", () => {
  const route = read("../app/api/student/wrong-questions/route.ts");
  const workspace = read("../app/components/wrong_question_workspace.tsx");

  assert.match(route, /searchParams/);
  assert.match(route, /limit/);
  assert.match(route, /offset/);
  assert.match(workspace, /加载更多/);
  assert.match(workspace, /loadMoreRecords/);
  assert.match(workspace, /listGenerationRef/);
  assert.match(workspace, /await loadServerData\(\)/);
});

test("换图或移除期间的旧上传和旧 OCR 不能覆盖当前草稿", () => {
  const workspace = read("../app/components/wrong_question_workspace.tsx");

  assert.match(workspace, /selectionVersionRef/);
  assert.match(workspace, /discardStagedUpload\(upload\.uploadId\)/);
  assert.match(workspace, /selectionVersion !== selectionVersionRef\.current/);
  assert.match(workspace, /activeUploadIdRef\.current !== recognizingUploadId/);
});

test("OCR 晚到时不会覆盖学生刚手动修改的题干，而是等待学生确认应用", () => {
  const workspace = read("../app/components/wrong_question_workspace.tsx");

  assert.match(workspace, /questionTextVersionRef/);
  assert.match(workspace, /questionTextVersionAtStart/);
  assert.match(workspace, /pendingOcrResult/);
  assert.match(workspace, /应用识别结果/);
  assert.match(workspace, /questionTextVersionRef\.current !== questionTextVersionAtStart/);
});

test("错题页面不再保存 Base64、localStorage 或展示示例记录", () => {
  const source = read("../app/components/wrong_question_workspace.tsx");
  const card = read("../app/components/wrong_question_record_card.tsx");

  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("FileReader"), false);
  assert.equal(source.includes("exampleRecords"), false);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /识别图片中的题目/);
  assert.match(card, /确认删除/);
});
