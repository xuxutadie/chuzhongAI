/**
 * 仅用于学习服务暂时不可用时的本机路线骨架。
 * 它不包含任何学生画像、成长值或完成记录；真实状态始终以服务端任务为准。
 */
export type LearningTask = {
  id: string;
  subject: "数学" | "英语" | "语文";
  title: string;
  duration: string;
  objective: string;
  feedbackPlaceholder: string;
  learningHref: string;
};

/** 今日数学课堂诊断的可信任务编号。 */
export const DAILY_MATH_TASK_ID = "math-shapes-diagnosis";

/**
 * 离线时仅用于恢复当天尚未提交的本机草稿；不能作为完成、成长值或学习报告的依据。
 */
export const initialTasks: LearningTask[] = [
  {
    id: DAILY_MATH_TASK_ID,
    subject: "数学",
    title: "数学课堂诊断",
    duration: "30分钟",
    objective: "根据今天课堂内容完成图形世界诊断，找出需要巩固的知识点。",
    feedbackPlaceholder: "先判断图形的关键特征，再用诊断结果安排针对学习。",
    learningHref: "/today-learning",
  },
  {
    id: "english-20",
    subject: "英语",
    title: "核心词汇与短文复述",
    duration: "20分钟",
    objective: "学会 5 个学习主题词汇，并用自己的话完成短文复述。",
    feedbackPlaceholder: "写下 3 个还不熟的单词。",
    learningHref: "/tasks/english-20",
  },
  {
    id: "chinese-20",
    subject: "语文",
    title: "阅读理解精练",
    duration: "20分钟",
    objective: "读懂一篇短文，练习找依据并把理由写完整。",
    feedbackPlaceholder: "答题时有没有把理由写完整？",
    learningHref: "/tasks/chinese-20",
  },
];
