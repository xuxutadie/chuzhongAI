export type StudentBatchEntry = {
  username: string;
  displayName: string;
  password: string;
  grade: string;
};

/** 简易名单而非通用 CSV：每行一个学生，支持表格复制，错误不回显密码。 */
export function parseStudentBatch(value: string): StudentBatchEntry[] {
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) throw new Error("请先填写学生名单。");
  if (lines.length > 50) throw new Error("每批最多创建 50 名学生，请分批提交。");
  const usernames = new Set<string>();
  return lines.map((line, index) => {
    const fields = line.split(/[\t,，]/);
    const row = `第 ${index + 1} 行`;
    if (fields.length < 3 || fields.length > 4) {
      throw new Error(`${row}格式不正确，请填写账号、称呼、独立初始密码、年级（可选）。`);
    }
    const [rawUsername, rawName, password, rawGrade = ""] = fields;
    const username = rawUsername.trim();
    const displayName = rawName.trim();
    const grade = rawGrade.trim();
    if (username.length < 3 || username.length > 64 || /\s/.test(username)) {
      throw new Error(`${row}账号须为 3 至 64 个非空白字符。`);
    }
    if (!displayName || displayName.length > 40) throw new Error(`${row}称呼须为 1 至 40 个字符。`);
    if (password.length < 8 || password.length > 256) throw new Error(`${row}密码须为 8 至 256 个字符。`);
    if (grade.length > 24) throw new Error(`${row}年级不能超过 24 个字符。`);
    if (usernames.has(username.toLowerCase())) throw new Error(`${row}账号在本批名单中重复。`);
    usernames.add(username.toLowerCase());
    return { username, displayName, password, grade };
  });
}
