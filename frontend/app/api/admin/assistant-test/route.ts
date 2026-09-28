/**
 * 旧版浏览器直连模型测试已停用。
 * 正式 AI 服务会通过后端受保护配置接入，不能把密钥或临时会话放入学生端。
 */
export async function POST() {
  return Response.json(
    { detail: "旧版 AI 测试已停用。请由教师在安全配置完成后使用正式 AI 助手。" },
    { status: 410 },
  );
}
