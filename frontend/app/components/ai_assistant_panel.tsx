type AiAssistantPanelProps = {
  question: string;
  reply: string;
  error: string;
  isAsking: boolean;
  onQuestionChange: (value: string) => void;
  onAsk: () => void;
};

const suggestedQuestions = [
  "这道数学题我第一步不会写，能提示我吗？",
  "分数和百分数总弄混，能用图帮我理解吗？",
  "六升七数学应该先复习哪些基础？"
];

export function AiAssistantPanel({
  question,
  reply,
  error,
  isAsking,
  onQuestionChange,
  onAsk
}: AiAssistantPanelProps) {
  return (
    <section className="module assistant" id="assistant" aria-label="向 AI 教练提问">
      <div className="assistant-layout">
        <label htmlFor="student-question">把不会的题目或不懂的地方写下来</label>
        <textarea
          id="student-question"
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="例如：这道一次函数题我看不懂条件，第一步应该做什么？"
          rows={5}
        />
        <button disabled={isAsking} type="button" onClick={onAsk}>
          {isAsking ? "AI 老师正在思考" : "问 AI 老师"}
        </button>
        <div className="assistant-suggestions" aria-label="提问示例">
          <span>不知道怎么问？可以试试：</span>
          <div>
            {suggestedQuestions.map((suggestion) => (
              <button key={suggestion} onClick={() => onQuestionChange(suggestion)} type="button">
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="assistant-error" role="alert">{error}</p> : null}
        <div className="assistant-reply" role="status" aria-live="polite">
          {reply || "还没有回答。写下题目和你已经尝试的步骤，点击“问 AI 老师”后，回答会显示在这里。"}
        </div>
      </div>
    </section>
  );
}
