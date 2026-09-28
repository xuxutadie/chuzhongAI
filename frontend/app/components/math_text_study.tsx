import type { MathKnowledgePackage, MathQuestion } from "../math-learning/types";

export function MathTextStudy({ pack, reviewQuestions, onComplete }: {
  pack: MathKnowledgePackage;
  reviewQuestions: MathQuestion[];
  onComplete: () => void;
}) {
  return (
    <section className="math-text-study" aria-label="知识点讲解与错题复盘">
      <section className="math-study-guide">
        <h2>按这几步理解</h2>
        <ol>{pack.learningGuide?.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {pack.learningGuide?.pitfalls.length ? <>
          <h3>容易出错的地方</h3>
          <ul>{pack.learningGuide.pitfalls.map((pitfall) => <li key={pitfall}>{pitfall}</li>)}</ul>
        </> : null}
      </section>
      {reviewQuestions.length ? <section className="math-study-review">
        <h2>回到刚才做错的题</h2>
        {reviewQuestions.map((question, index) => {
          const correctIds = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer];
          const answer = question.options?.filter((option) => correctIds.includes(option.id)).map((option) => option.text).join("；");
          return <article className="math-study-example" key={question.id}>
            <span>错题 {index + 1} · {question.capabilityTag}</span>
            <h3>{question.prompt}</h3>
            <ul aria-label="原题选项">
              {question.options?.map(option => <li key={option.id}>{option.id.toUpperCase()} · {option.text}</li>)}
            </ul>
            <p><strong>正确答案：</strong>{answer}</p>
            <p><strong>怎样想：</strong>{question.explanation}</p>
          </article>;
        })}
      </section> : <p>本轮没有找到需要展开的错题，请先复习上方步骤，再完成过关测试。</p>}
      <p>读懂讲解不等于已经掌握，下一步会用另一组题检查。</p>
      <button type="button" onClick={onComplete}>我已复习，准备重新测试</button>
    </section>
  );
}
