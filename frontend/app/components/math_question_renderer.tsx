"use client";

import { useRef, type KeyboardEvent } from "react";

import { MathInteractionQuestion } from "./math_interaction_question";
import type {
  InteractionResultMessage,
  MathKnowledgePackage,
  MathQuestion,
  QuestionAttempt,
} from "../math-learning/types";

type MathQuestionRendererProps = {
  pack: MathKnowledgePackage;
  question: MathQuestion;
  answer: QuestionAttempt["answer"] | null;
  onAnswer: (answer: QuestionAttempt["answer"]) => void;
  onInteractionPassed: (result: InteractionResultMessage) => void;
  onUnavailable: () => void;
};

export function MathQuestionRenderer({
  pack,
  question,
  answer,
  onAnswer,
  onInteractionPassed,
  onUnavailable,
}: MathQuestionRendererProps) {
  const selected = Array.isArray(answer) ? answer : [];
  const showVisual = question.visual && question.responseType !== "interactive";
  const singleChoiceOptions = question.options ?? [];
  const singleChoiceOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function toggleMultiple(optionId: string) {
    const next = selected.includes(optionId)
      ? selected.filter((id) => id !== optionId)
      : [...selected, optionId];
    onAnswer(next);
  }

  function handleSingleChoiceKeyDown(event: KeyboardEvent<HTMLButtonElement>, optionIndex: number) {
    if (!singleChoiceOptions.length) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (optionIndex + 1) % singleChoiceOptions.length;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (optionIndex - 1 + singleChoiceOptions.length) % singleChoiceOptions.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = singleChoiceOptions.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextOption = singleChoiceOptions[nextIndex];
    if (!nextOption) return;
    onAnswer(nextOption.id);
    singleChoiceOptionRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="math-question-body">
      <div className="math-question-meta">
        <span>{question.difficulty === "basic" ? "基础" : question.difficulty === "advanced" ? "进阶" : "挑战"}</span>
        <strong>{question.capabilityTag}</strong>
      </div>
      <h2>{question.prompt}</h2>

      {showVisual ? (
        <MathInteractionQuestion
          key={question.id}
          question={question}
          onUnavailable={onUnavailable}
        />
      ) : null}

      {question.responseType === "interactive" ? (
        <MathInteractionQuestion
          key={question.id}
          question={question}
          onPassed={onInteractionPassed}
          onUnavailable={onUnavailable}
        />
      ) : null}

      {question.responseType === "single-choice" || question.responseType === "true-false" ? (
        <div className="math-answer-options" role="radiogroup" aria-label="请选择一个答案，可用方向键切换">
          {singleChoiceOptions.map((option, index) => (
            <button
              type="button"
              role="radio"
              aria-checked={answer === option.id}
              className={answer === option.id ? "is-selected" : ""}
              key={option.id}
              ref={(element) => {
                singleChoiceOptionRefs.current[index] = element;
              }}
              tabIndex={answer === option.id || (!answer && index === 0) ? 0 : -1}
              onClick={() => onAnswer(option.id)}
              // 原生 button 会在 Enter 或空格键时触发 click，避免手动监听造成重复作答。
              onKeyDown={(event) => handleSingleChoiceKeyDown(event, index)}
            >
              <span>{option.id.toUpperCase()}</span>
              <strong>{option.text}</strong>
            </button>
          ))}
        </div>
      ) : null}

      {question.responseType === "multi-choice" ? (
        <>
          <p className="math-multi-note">这道题可以选择多个答案。</p>
          <div className="math-answer-options" aria-label="请选择所有正确答案">
            {question.options?.map((option) => (
              <button
                type="button"
                aria-pressed={selected.includes(option.id)}
                className={selected.includes(option.id) ? "is-selected" : ""}
                key={option.id}
                onClick={() => toggleMultiple(option.id)}
              >
                <span>{option.id.toUpperCase()}</span>
                <strong>{option.text}</strong>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {question.responseType === "interactive" && answer ? (
        <div className="math-interaction-confirmed" role="status">互动挑战已完成，可以进入下一题。</div>
      ) : null}
    </div>
  );
}
