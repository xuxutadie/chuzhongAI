import { notFound } from "next/navigation";
import { StudentPageShell } from "../../../components/student_page_shell";
import { LanguageUnitSession } from "../../../components/language_unit_session";
import { findLanguageUnit } from "../../../language-learning/curriculum";

export default async function EnglishUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const found = findLanguageUnit(unitId);
  if (!found || found.book.subject !== "英语") notFound();
  return <StudentPageShell eyebrow="英语单元学习" title={found.unit.title} description={found.unit.focus}>
    <LanguageUnitSession book={found.book} unit={found.unit} />
  </StudentPageShell>;
}
