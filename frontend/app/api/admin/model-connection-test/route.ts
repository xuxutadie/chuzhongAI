/** 安全配置不再接受浏览器提交的 API Key。 */
export async function POST() {
  return Response.json(
    { detail: "旧版浏览器连接测试已停用。请在后端环境配置中填写密钥，再由教师查看配置状态。" },
    { status: 410 },
  );
}
