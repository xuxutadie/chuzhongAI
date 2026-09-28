"use client";
import { useRouter } from 'next/navigation';
import { StudentPageShell } from '../../components/student_page_shell';
import { DailyWrongReview } from '../../components/daily_wrong_review';
import styles from '../../learning-route/route.module.css';
export default function ReviewPage(){const router=useRouter();return <StudentPageShell eyebrow="错题集" title="今天的错题复习" description="只完成今天安排的当前阶段，不用一次做完全部练习。"><div className={styles.page}><DailyWrongReview completionLabel="返回错题集" onComplete={async()=>{router.push('/wrong-questions')}}/></div></StudentPageShell>}
