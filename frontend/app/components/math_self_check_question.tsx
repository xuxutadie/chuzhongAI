"use client";

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import type { MathQuestion } from '../math-learning/types';
import { actionId, learningPost } from '../learning-route/api';
import { MathInteractionQuestion } from './math_interaction_question';
import { createSelfCheckAttempt, type SelfCheckReceipt } from './self_check_attempt';
import styles from './self_check.module.css';

export function MathSelfCheckQuestion({ question, knowledgePointId, index }: {
  question: MathQuestion; knowledgePointId: string; index: number;
}) {
  const [answer, setAnswer] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<SelfCheckReceipt | null>(null);
  const active = useRef(true);
  const submitting = useRef(false);
  const attempt = useRef<ReturnType<typeof createSelfCheckAttempt> | null>(null);
  const firstOption = useRef<HTMLInputElement>(null);
  const groupId = useId();
  const multiple = question.responseType === 'multi-choice';
  const correctIds = receipt ? (Array.isArray(receipt.answer) ? receipt.answer : [receipt.answer]) : [];
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);

  async function submit() {
    if (submitting.current || receipt || !answer.length) return;
    submitting.current = true;
    setBusy(true); setLocked(true); setError('');
    attempt.current ??= createSelfCheckAttempt(knowledgePointId, question.id,
      payload => learningPost<SelfCheckReceipt>('/self-check/answers', payload), actionId);
    try {
      const result = await attempt.current.submit(multiple ? answer : answer[0]);
      if (active.current) setReceipt(result);
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : '提交失败，请重试');
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }

  function retryQuestion() {
    attempt.current = null;
    setAnswer([]); setReceipt(null); setLocked(false); setError('');
    // 等选择控件重新启用后，把键盘焦点送回题目。
    requestAnimationFrame(() => firstOption.current?.focus());
  }

  return <article className={styles.card} aria-busy={busy}>
    <span className={styles.badge}>练习 {index + 1} · {multiple ? '多选' : question.responseType === 'true-false' ? '判断' : '单选'}</span>
    <h3>{question.prompt}</h3>
    {question.visual ? <MathInteractionQuestion question={question} unavailableLabel="重新加载图形" /> : null}
    <fieldset disabled={locked} className={styles.choices}>
      <legend>{multiple ? '可选择多个答案，选好后提交' : '点击一个选项，再提交检查'}</legend>
      {question.options?.map((option, optionIndex) => <label key={option.id}
        className={styles.option} data-selected={answer.includes(option.id)}>
        <input ref={optionIndex === 0 ? firstOption : undefined} type={multiple ? 'checkbox' : 'radio'}
          name={groupId} value={option.id} checked={answer.includes(option.id)}
          onChange={() => setAnswer(current => multiple
            ? current.includes(option.id) ? current.filter(id => id !== option.id) : [...current, option.id]
            : [option.id])} />
        <span className={styles.letter}>{option.id.toUpperCase()}</span><span>{option.text}</span>
        {receipt && correctIds.includes(option.id) ? <span className={styles.answerTag}>正确选项</span> : null}
      </label>)}
    </fieldset>
    {!receipt ? <div className={styles.actions}>
      <button type="button" className="workspace-button" disabled={busy || !answer.length} onClick={() => void submit()}>
        {busy ? '正在检查…' : error ? '重试提交' : '提交检查'}
      </button>
      {!locked ? <span>提交后显示答案与解析</span> : null}
    </div> : null}
    {error ? <p role="alert" className={styles.error}>{error}。本次选项已保留，请重试提交。</p> : null}
    {receipt ? <div role="status" className={styles.feedback} data-result={receipt.result}>
      <strong>{receipt.result === 'correct' ? '✓ 回答正确' : '再想一想，这次还没有答对'}</strong>
      <p>正确答案：{question.options?.filter(option => correctIds.includes(option.id)).map(option => `${option.id.toUpperCase()} · ${option.text}`).join('；')}</p>
      <p>{receipt.explanation}</p>
      {receipt.result === 'wrong' ? receipt.collection_id
        ? <p>已加入错题集，可继续理解与巩固。<Link href={`/wrong-questions/${receipt.collection_id}`}>查看这道错题 →</Link></p>
        : <p>作答记录已保存；这道题未重新加入错题集。</p> : null}
      <button type="button" className="workspace-button secondary" onClick={retryQuestion}>再练一次</button>
    </div> : null}
  </article>;
}
