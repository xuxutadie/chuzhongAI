import assert from "node:assert/strict";
import test from "node:test";
import { isSameSiteRegistrationRequest } from "../app/api/server-request-origin.ts";

function request(url, headers) { return new Request(url, { method: "POST", headers }); }

test("注册以浏览器实际 Host 判断来源，不被 Next 内部 localhost 地址误拒", () => {
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3001/api/auth/register", { host: "127.0.0.1:3001", origin: "http://127.0.0.1:3001", "sec-fetch-site": "same-origin" })), true);
  assert.equal(isSameSiteRegistrationRequest(request("http://127.0.0.1:3001/api/auth/register", { host: "localhost:3001", origin: "http://localhost:3001" })), true);
});

test("反向代理在内部使用 HTTP 时仍接受外部 HTTPS 的真实同 Host 来源", () => {
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { host: "learn.example.com", origin: "https://learn.example.com" })), true);
});

test("注册仍拒绝外站、null 来源、跨站标记与不同端口", () => {
  for (const origin of ["https://evil.example", "null", "https://learn.example.com:444", "file://learn.example.com", "https://learn.example.com/forged"]) {
    assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { host: "learn.example.com", origin })), false);
  }
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { host: "learn.example.com", origin: "https://learn.example.com", "sec-fetch-site": "cross-site" })), false);
});

test("不信任任意 X-Forwarded-Host 或异常 Host，缺少 Host 时回退请求 URL", () => {
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { host: "learn.example.com", origin: "https://evil.example", "x-forwarded-host": "evil.example" })), false);
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { host: "learn.example.com,evil.example", origin: "https://learn.example.com" })), false);
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { origin: "http://localhost:3000" })), true);
  assert.equal(isSameSiteRegistrationRequest(request("http://localhost:3000/api/auth/register", { origin: "http://127.0.0.1:3000" })), false);
});
