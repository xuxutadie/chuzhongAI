import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChatTurns } from '../app/diagnosis/interview_chat_model.ts';
import { emptyFields } from '../app/diagnosis/model.ts';

test('按已保存的回答顺序恢复左右问答，不显示尚未保存的输入', () => {
  const turns = buildChatTurns({ ...emptyFields, nickname: '小林', grade: '六年级', answered_fields: ['grade', 'nickname'] });
  assert.deepEqual(turns.map(turn => [turn.field, turn.answer]), [['grade', '六年级'], ['nickname', '小林']]);
  assert.ok(turns.every(turn => turn.question.length > 0));
});

test('跳过也保留一轮对话，重复字段和未知字段不生成假消息', () => {
  const turns = buildChatTurns({ ...emptyFields, answered_fields: ['exam', 'exam', 'unknown'] });
  assert.equal(turns.length, 1);
  assert.equal(turns[0].answer, '暂不填写');
});

test('本轮实际提问优先，刷新后使用对应资料问题恢复摘要', () => {
  const fields = { ...emptyFields, nickname: '小林', answered_fields: ['nickname'] };
  assert.equal(buildChatTurns(fields, { nickname: '我该怎么称呼你呀？' })[0].question, '我该怎么称呼你呀？');
  assert.ok(buildChatTurns(fields)[0].question);
  assert.deepEqual(buildChatTurns(emptyFields), []);
});

test('已答追问不因后续修改困难选项而消失，成绩保留满分单位', () => {
  const fields = { ...emptyFields, weak_topics: '', exam_score: 86, exam_total: 100,
    learning_details: { geometry_detail: '找不到底和高' }, answered_fields: ['geometry_detail', 'exam'] };
  assert.deepEqual(buildChatTurns(fields).map(turn => turn.answer), ['找不到底和高', '86 / 100 分']);
});
