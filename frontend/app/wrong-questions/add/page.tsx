import { StudentPageShell } from "../../components/student_page_shell";
import { WrongQuestionWorkspace } from "../../components/wrong_question_workspace";

export default function AddWrongQuestionPage() {
  return <StudentPageShell eyebrow="错题集" title="添加一道错题" description="拍照、选择图片，或直接输入题目。识别后请先核对，再保存。">
    <WrongQuestionWorkspace showRecords={false} />
  </StudentPageShell>;
}
