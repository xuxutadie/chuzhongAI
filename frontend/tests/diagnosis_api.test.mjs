import assert from "node:assert/strict";
import test from "node:test";
import { diagnosisApi, needsInitialDiagnosis, interviewFor, emptyFields, answerLabel } from "../app/diagnosis/model.ts";

test("访谈提供十四个基础问题并按学生回答追加追问", () => {
  assert.equal(interviewFor(emptyFields).length, 14);
  const fields = { ...emptyFields, weak_topics: "几何与图形", learning_details: { progress: "比例" } };
  const rows = interviewFor(fields);
  assert.ok(rows.some(row => row.field === "geometry_detail"));
  assert.ok(!rows.some(row => row.field === "calculation_detail"));
  assert.equal(answerLabel(fields, "progress"), "比例");
});

test("首次建档和续答会触发引导，已有报告不要求重复建档", () => {
  const state = { profile: { confirmed: false }, supported: true, history: [] };
  assert.equal(needsInitialDiagnosis(state), true);
  assert.equal(needsInitialDiagnosis({ ...state, profile: { confirmed: true } }), true);
  assert.equal(needsInitialDiagnosis({ ...state, profile: { confirmed: true }, history: [{ status: "submitted" }, { status: "active" }] }), false);
  assert.equal(needsInitialDiagnosis({ ...state, profile: { confirmed: true }, supported: false }), false);
});

test("访谈与测评写操作声明 JSON，后端可以解析而不是返回 422", async () => {
  const previous = globalThis.fetch;
  let sent;
  globalThis.fetch = async (path, init) => { sent = { path, init }; return new Response(JSON.stringify({ revision: 1 })); };
  try {
    await diagnosisApi("/profile", { revision: 0, fields: { nickname: "测试" } }, "PUT");
    assert.equal(new Headers(sent.init.headers).get("content-type"), "application/json");
    assert.equal(sent.init.method, "PUT");
    assert.equal(sent.init.credentials, "same-origin");
    assert.equal(JSON.parse(sent.init.body).fields.nickname, "测试");
  } finally { globalThis.fetch = previous; }
});
