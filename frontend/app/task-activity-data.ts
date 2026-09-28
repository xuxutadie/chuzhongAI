export type ActivityQuestion = {
  id: string;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
};

export type GuidedTaskActivity = {
  taskId: string;
  subject: "英语" | "语文";
  title: string;
  intro: string;
  steps: [string, string, string];
  studyTitle: string;
  studyParagraphs: string[];
  studyItems?: Array<{ term: string; meaning: string; example: string }>;
  questions: ActivityQuestion[];
  /** 完成任务前至少需要答对的自测题数量。 */
  minimumCorrectCount: number;
  reflectionPrompt: string;
  reflectionPlaceholder: string;
  reflectionMinLength: number;
};

const activities: Record<string, GuidedTaskActivity> = {
  "english-20": {
    taskId: "english-20",
    subject: "英语",
    title: "核心词汇与短文复述",
    intro: "先认识 5 个词，再完成 3 道自测，最后用自己的话复述。",
    steps: ["认识词汇", "完成自测", "短文复述"],
    studyTitle: "今天先掌握这 5 个词",
    studyParagraphs: [
      "阅读每个例句时，先猜词义，再看中文解释。不要一次背很多遍。"
    ],
    studyItems: [
      { term: "habit", meaning: "习惯", example: "Reading is a good habit." },
      { term: "review", meaning: "复习", example: "I review my notes after class." },
      { term: "progress", meaning: "进步", example: "Small steps bring progress." },
      { term: "achieve", meaning: "实现；达到", example: "We can achieve our goals." },
      { term: "confident", meaning: "自信的", example: "Practice makes me confident." }
    ],
    questions: [
      {
        id: "english-q1",
        prompt: "I read for twenty minutes every day. Reading has become a good ____.",
        options: ["habit", "progress", "review"],
        answer: "habit",
        explanation: "每天重复做的事情会形成 habit（习惯）。"
      },
      {
        id: "english-q2",
        prompt: "“I review my notes after class.” 中 review 的意思是？",
        options: ["预习", "复习", "记录"],
        answer: "复习",
        explanation: "review 表示重新看已经学过的内容。"
      },
      {
        id: "english-q3",
        prompt: "哪句话表达“练习让我更自信”？",
        options: ["Practice makes me confident.", "I achieve my notes.", "Progress is a habit."],
        answer: "Practice makes me confident.",
        explanation: "confident 是“自信的”，make me confident 表示“让我更自信”。"
      }
    ],
    minimumCorrectCount: 2,
    reflectionPrompt: "用中文或简单英语复述：为什么每天的小练习能带来进步？",
    reflectionPlaceholder: "例如：每天复习会形成好习惯，我会越来越自信……",
    reflectionMinLength: 12
  },
  "chinese-20": {
    taskId: "chinese-20",
    subject: "语文",
    title: "阅读理解精练",
    intro: "先读短文，再回到原文找依据，最后把理由写完整。",
    steps: ["阅读短文", "回文找依据", "写完整理由"],
    studyTitle: "雨后的操场",
    studyParagraphs: [
      "雨停以后，操场边的梧桐叶亮得像刚擦过。几个同学绕开积水跑向教室，只有小林停下来，把被风吹倒的值日牌扶正。",
      "他发现排水口被落叶堵住了，便蹲下来一点点清理。水流重新动起来，沿着地面的浅沟慢慢退去。路过的同学也加入进来，有人捡树叶，有人提醒大家小心湿滑。",
      "上课铃响时，他们的鞋边沾着泥点，操场却重新露出了整洁的地面。老师没有批评他们迟到，只说：愿意为大家多做一步，也是一种成长。"
    ],
    questions: [
      {
        id: "chinese-q1",
        prompt: "小林最先停下来的直接原因是什么？",
        options: ["发现值日牌被风吹倒", "想在操场玩水", "老师让他留下值日"],
        answer: "发现值日牌被风吹倒",
        explanation: "第一段写到小林停下来，把被风吹倒的值日牌扶正。"
      },
      {
        id: "chinese-q2",
        prompt: "短文主要想说明什么？",
        options: ["雨后的操场很危险", "主动为集体做事也是成长", "迟到一定不会被批评"],
        answer: "主动为集体做事也是成长",
        explanation: "结尾老师的话点明中心：愿意为大家多做一步，也是一种成长。"
      },
      {
        id: "chinese-q3",
        prompt: "“水流重新动起来”说明小林的做法产生了什么结果？",
        options: ["排水恢复，积水开始退去", "雨又下大了", "同学们停止帮忙"],
        answer: "排水恢复，积水开始退去",
        explanation: "联系下一句“沿着地面的浅沟慢慢退去”就能找到依据。"
      }
    ],
    minimumCorrectCount: 2,
    reflectionPrompt: "请用“人物做了什么 + 产生什么结果 + 说明什么品质”的顺序写一句完整答案。",
    reflectionPlaceholder: "小林……，结果……，这说明他……",
    reflectionMinLength: 18
  }
};

export function getTaskActivity(taskId: string) {
  return activities[taskId] ?? null;
}

export function isActivityAnswerCorrect(question: ActivityQuestion, answer: string) {
  return question.answer === answer;
}

/**
 * 课程题目更新后，旧草稿中已不存在的题目或选项不能参与完成判定。
 */
export function sanitizeGuidedTaskAnswers(
  activity: GuidedTaskActivity,
  answers: Record<string, string>,
) {
  return Object.fromEntries(
    activity.questions.flatMap((question) => {
      const answer = answers[question.id];
      return typeof answer === "string" && question.options.includes(answer)
        ? [[question.id, answer]]
        : [];
    }),
  ) as Record<string, string>;
}

/**
 * 引导任务必须同时满足：所有题已作答、达到最低正确数、完成反思。
 * 这样不会把“只写了总结但没有掌握内容”误记为完成。
 */
export function canCompleteGuidedTask(
  activity: GuidedTaskActivity,
  answers: Record<string, string>,
  reflection: string,
) {
  const answeredAllQuestions = activity.questions.every((question) => Boolean(answers[question.id]));
  const correctCount = activity.questions.filter((question) =>
    isActivityAnswerCorrect(question, answers[question.id] ?? ""),
  ).length;

  return (
    answeredAllQuestions
    && correctCount >= activity.minimumCorrectCount
    && reflection.trim().length >= activity.reflectionMinLength
  );
}
