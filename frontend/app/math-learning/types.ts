export type MathDifficulty = "basic" | "advanced" | "challenge";
export type MathResponseType = "single-choice" | "true-false" | "multi-choice" | "interactive";
export type MathQuestionSource = "local-reviewed" | "ai-generated";
export type ShapeLessonSection = "shapes" | "fold" | "cut" | "views";

export type MathVisualSpec =
  | { kind: "solid-model"; solid: "cube" | "cuboid" | "cylinder" | "cone" | "sphere" }
  | { kind: "folding-net"; netId: string; targetFace?: string }
  | {
      kind: "cross-section";
      solid: "cube" | "cuboid" | "cylinder" | "cone" | "sphere";
      planePreset: string;
    }
  | { kind: "orthographic-view"; structureId: string; view: "front" | "left" | "top" };

export type InteractionExpectedAnswer = {
  challengeId: string;
  passed: true;
};

export type MathQuestionOption = {
  id: string;
  text: string;
};

export type MathQuestion = {
  id: string;
  knowledgePointId: string;
  capabilityTag: string;
  difficulty: MathDifficulty;
  responseType: MathResponseType;
  prompt: string;
  options?: MathQuestionOption[];
  correctAnswer: string | string[] | InteractionExpectedAnswer;
  explanation: string;
  visual?: MathVisualSpec;
  source: MathQuestionSource;
};

export type MathKnowledgePackage = {
  id: string;
  subject: "数学";
  grade: 7;
  semester: "上册" | "下册";
  textbookVersion: "北师大版";
  chapterId: string;
  title: string;
  lessonId: string;
  learningMode?: "interactive" | "explanation";
  learningGuide?: { steps: string[]; pitfalls: string[] };
  retestQuestions?: MathQuestion[];
  interaction?: {
    section: ShapeLessonSection;
    supportedDifficulties: MathDifficulty[];
  };
  capabilityTags: string[];
  questions: MathQuestion[];
};

export type InteractionResultMessage = {
  type: "math-interaction-result";
  lessonId: "g7-upper-shapes";
  knowledgePointId: string;
  section: ShapeLessonSection;
  difficulty: MathDifficulty;
  challengeId: string;
  passed: boolean;
  attempts: number;
};

export type QuestionAttempt = {
  questionId: string;
  knowledgePointId: string;
  capabilityTag: string;
  answer: string | string[] | InteractionExpectedAnswer;
  correct: boolean;
  valid: boolean;
  round: 1 | 2 | 3;
  answeredAt: string;
};

export type MathRoundScore = {
  round: number;
  score: number;
  weakTags: string[];
};

export type MathLearningPhase =
  | "diagnostic"
  | "diagnosis"
  | "learning"
  | "retest"
  | "passed"
  | "needs-help";

export type MathLearningSession = {
  id: string;
  localDate: string;
  selectedKnowledgePointIds: string[];
  currentIndex: number;
  round: 1 | 2 | 3;
  phase: MathLearningPhase;
  answers: QuestionAttempt[];
  interactionResults: InteractionResultMessage[];
  scores: MathRoundScore[];
  roundQuestions: Record<string, MathQuestion[]>;
};

export type MathDiagnosisItem = {
  capabilityTag: string;
  correct: number;
  total: number;
  rate: number;
  status: "掌握" | "需巩固" | "未理解";
};

export type MathDiagnosis = {
  score: number;
  passed: boolean;
  items: MathDiagnosisItem[];
  weakTags: string[];
  primaryIssue: string | null;
};
