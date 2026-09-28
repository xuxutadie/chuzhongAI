type Choice = { id: string; text: string };
export type WrongQuestion = {
  prompt: string;
  options?: Choice[];
  answer?: unknown;
  explanation?: string;
};
type AnswerEvent = { id: number; result: string; answer: unknown; occurred_at: string };
const resultLabels: Record<string, string> = {correct:'答对',wrong:'答错',skipped:'跳过',unverified:'待核实'};

function answerText(answer: unknown, options: Choice[]): string {
  if (answer == null || answer === '' || (Array.isArray(answer) && !answer.length)) return '未作答';
  if (Array.isArray(answer)) return answer.map(item => answerText(item, options)).join('、');
  if (typeof answer === 'string') {
    const choice = options.find(item => item.id === answer);
    return choice ? `${choice.id} · ${choice.text}` : answer;
  }
  return typeof answer === 'object' ? JSON.stringify(answer) : String(answer);
}

// 只展示服务端已有快照，不判分、不改写学生原始作答。
export function WrongQuestionSnapshot({question, events}: {question: WrongQuestion; events: AnswerEvent[]}) {
  const options = question.options || [];
  return <>
    {options.length > 0 && <ul aria-label="题目选项">{options.map(option => <li key={option.id}>{`${option.id} · ${option.text}`}</li>)}</ul>}
    <p>{`参考答案：${question.answer == null ? '尚未核实' : answerText(question.answer, options)}`}</p>
    {question.explanation && <p>{question.explanation}</p>}
    <h3>作答与重做记录</h3>
    {events.length ? <ol>{events.map(event => <li key={event.id}>{`${new Date(event.occurred_at).toLocaleString('zh-CN')} · ${resultLabels[event.result] || event.result} · 回答：${answerText(event.answer, options)}`}</li>)}</ol> : <p>暂无系统作答记录；照片上传不等于已经完成重做。</p>}
  </>;
}
