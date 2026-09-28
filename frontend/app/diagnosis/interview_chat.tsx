"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { buildChatTurns } from "./interview_chat_model";
import type { ProfileFields } from "./model";
import { RobotAvatar } from "./robot_avatar";
import { createTypingTimeline, typingFrame } from "./typewriter_model";
import styles from "./interview.module.css";

type Props = { draft: ProfileFields; field: string; question: string; loading: boolean; busy: boolean; animated: boolean; questionActions?: ReactNode };

export function InterviewChat({ draft, field, question, loading, busy, animated, questionActions }: Props) {
  const [questions, setQuestions] = useState<Record<string, string>>({});
  const thread = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastField = useRef("");
  useEffect(() => { setQuestions(previous => previous[field] === question ? previous : { ...previous, [field]: question }); }, [field, question]);
  useEffect(() => {
    // 主动发送进入下一问时跟随；阅读旧消息时不被 AI 回应抢走滚动位置。
    if (thread.current && (lastField.current !== field || nearBottom.current)) {
      thread.current.scrollTop = thread.current.scrollHeight;
      nearBottom.current = true;
    }
    lastField.current = field;
  }, [field, question]);
  useEffect(() => {
    const node = thread.current;
    if (!node) return;
    // 窄屏换行、旋转屏幕或键盘改变高度时，保持最新问题可见。
    const observer = new ResizeObserver(() => {
      if (nearBottom.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => observer.disconnect();
  }, []);
  const turns = buildChatTurns(draft, questions);
  return <div ref={thread} className={styles.thread} role="region" aria-label="访谈聊天记录" tabIndex={0}
    onScroll={event => { const node = event.currentTarget; nearBottom.current = node.scrollHeight - node.clientHeight - node.scrollTop < 100; }}>
    <div className={styles.messages}>
      <p className={styles.chatNotice}>先聊聊你，再一起找到学习的起点。<br />回答会随账号保存，重新进入时按已保存资料恢复问答摘要。</p>
      {turns.map(turn => <div className={styles.turn} key={turn.field}>
        <div className={styles.aiRow}><RobotAvatar state="resting" /><div className={styles.messageContent}><span className={styles.sender}>学习教练</span><p className={styles.aiBubble}>{turn.question}</p></div></div>
        <div className={styles.studentRow}><div className={styles.messageContent}><span className={styles.sender}>你</span><p className={styles.studentBubble}>{turn.answer}</p></div><span className={styles.studentAvatar} aria-hidden="true">我</span></div>
      </div>)}
      <ActiveQuestion key={`${field}:${question}`} question={question} loading={loading} busy={busy} animated={animated} questionActions={questionActions} />
    </div>
  </div>;
}

function ActiveQuestion({ question, loading, busy, animated, questionActions }: Omit<Props, "draft" | "field">) {
  const timeline = useMemo(() => createTypingTimeline(question), [question]);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(preference.matches);
    sync();
    preference.addEventListener("change", sync);
    return () => preference.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (reducedMotion === null) return;
    // 一旦跳过或关闭动画，本条消息不再从头播放。切题卸载时清理计时器。
    if (!animated || reducedMotion || busy) { setFinished(true); return; }
    if (finished) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const duration = performance.now() - start;
      setElapsed(duration);
      if (duration >= timeline.duration) setFinished(true);
    }, 32);
    return () => window.clearInterval(timer);
  }, [timeline, animated, reducedMotion, busy, finished]);
  const frame = typingFrame(timeline, elapsed, finished || !animated || reducedMotion === true || busy);
  const state = !animated || reducedMotion ? "resting" : busy ? "listening" : frame.typing ? "speaking" : loading ? "thinking" : "listening";
  return <div className={`${styles.aiRow} ${styles.activeQuestion}`}>
    <RobotAvatar state={state} />
    <div className={styles.messageContent}>
      <span className={styles.sender}>学习教练 <span className={styles.robotStatus}>{busy ? "正在记下你的回答" : frame.typing ? "正在输入…" : loading ? "正在组织问题…" : "轮到你啦"}</span></span>
      <p className={styles.aiBubble}>
        {/* 屏幕阅读器一次读取全文，避免每个字符触发重复播报。 */}
        <span className={styles.screenReaderOnly} aria-live="polite" aria-atomic="true">{question}</span>
        <span aria-hidden="true" data-typing={frame.typing}>{frame.text}{frame.typing && <span className={styles.typingCursor} />}</span>
      </p>
      {frame.typing && <button type="button" className={styles.showAll} onClick={() => setFinished(true)}>立即显示全文</button>}
      {questionActions}
    </div>
  </div>;
}
