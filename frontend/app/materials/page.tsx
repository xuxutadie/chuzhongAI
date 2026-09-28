import { StudentPageShell } from "../components/student_page_shell";
import { MaterialsWorkspace } from "../components/materials_workspace";

export default function MaterialsPage() {
  return (
    <StudentPageShell
      eyebrow="数学资源"
      title="数学教材"
      description="对照课堂，查阅例题。选择需要的教材即可打开。"
    >
      <MaterialsWorkspace />
    </StudentPageShell>
  );
}
