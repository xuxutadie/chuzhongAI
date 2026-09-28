/**
 * 未经后端登记答案的变式题不能参与任务判分，因此旧版生成入口停用。
 */
export async function POST() {
  return Response.json(
    { detail: "旧版变式题测试已停用，当前将使用已审核题库完成学习。" },
    { status: 410 },
  );
}
