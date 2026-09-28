export type SelfCheckReceipt = {
  event_id: number;
  result: 'correct' | 'wrong';
  collection_id: number | null;
  answer: string | string[];
  explanation: string;
};

/** 一次作答固定一个请求编号；网络重试不改答案、不重复记错。 */
export function createSelfCheckAttempt(
  knowledgePointId: string,
  questionId: string,
  send: (payload: Record<string, unknown>) => Promise<SelfCheckReceipt>,
  makeId: () => string,
) {
  let payload: Record<string, unknown> | undefined;
  let pending: Promise<SelfCheckReceipt> | undefined;
  let receipt: SelfCheckReceipt | undefined;
  return {
    submit(answer: string | string[]): Promise<SelfCheckReceipt> {
      if (receipt) return Promise.resolve(receipt);
      if (pending) return pending;
      payload ??= {
        knowledge_point_id: knowledgePointId, question_id: questionId,
        request_id: makeId(), answer: Array.isArray(answer) ? [...answer] : answer,
      };
      pending = send(payload).then(result => { receipt = result; return result; })
        .finally(() => { pending = undefined; });
      return pending;
    },
  };
}
