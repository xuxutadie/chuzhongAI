import { StudentPageShell } from '../../components/student_page_shell';
import { WrongQuestionLearning } from '../../components/wrong_question_learning';
import styles from '../../learning-route/route.module.css';
import { notFound } from 'next/navigation';
export default async function WrongQuestionPage({params}:{params:Promise<{questionId:string}>}){
  const id=Number((await params).questionId);if(!Number.isSafeInteger(id)||id<1)notFound();
  return <StudentPageShell eyebrow="错题集" title="一步步弄懂这道题" description="理解、变式、拓展，再按间隔复习。"><div className={styles.page}><WrongQuestionLearning questionId={id}/></div></StudentPageShell>;
}
