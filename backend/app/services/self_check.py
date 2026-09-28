"""章节自查：只写入独立作答证据与错题集，不启动或推进每日任务。"""
import json
from app.services.question_catalog import PACKAGES
from app.services.question_evidence import normalize_question
from app.services.wrong_question_collection import WrongQuestionCollection, utc_now
from app.services.student_workspace_service import ResourceConflictError, ResourceNotFoundError


class SelfCheck:
    def __init__(self, repository):
        self.repository = repository
        self.collection = WrongQuestionCollection(repository)

    def submit(self, user_id, knowledge_point_id, question_id, request_id, answer):
        pack = PACKAGES.get(knowledge_point_id)
        original = next((q for q in pack['questions'] if q['id'] == question_id), None) if pack else None
        if not original:
            raise ResourceNotFoundError('未找到本知识点的自查题，请刷新后重试')
        if original['responseType'] not in ('single-choice', 'multi-choice', 'true-false'):
            raise ResourceConflictError('这道题需要在互动课件中操作，不能作为选择题提交')

        key = f'self-check:{request_id}'
        with self.repository.transaction() as db:
            previous = db.execute('SELECT * FROM learning_question_assignments WHERE user_id=? AND source=? AND source_ref=?', (user_id, 'self_check', key)).fetchone()
            # 网络重试始终使用首次提交的可信题目快照，不能用同一编号覆盖另一题。
            if previous:
                context = json.loads(previous['context_json'])
                if previous['question_key'] != question_id or context.get('knowledge_point_id') != knowledge_point_id:
                    raise ResourceConflictError('本次提交已经关联另一道题，请刷新后重试')
                snapshot = json.loads(previous['private_snapshot_json'])
            else:
                snapshot = normalize_question(original)

            options = {option['id'] for option in snapshot['options']}
            if snapshot['response_type'] == 'multi-choice':
                valid = isinstance(answer, list) and bool(answer) and all(isinstance(x, str) and x in options for x in answer) and len(answer) == len(set(answer))
                if valid:
                    answer = sorted(answer)
            else:
                valid = isinstance(answer, str) and answer in options
            if not valid:
                raise ResourceConflictError('请先选择本题提供的有效答案')

            assigned = self.collection.assign(db, user_id=user_id, source='self_check', source_ref=key,
                                             snapshot=snapshot, context={'knowledge_point_id': knowledge_point_id})
            receipt = self.collection.record(db, user_id=user_id, event_key=key, assignment_id=assigned,
                                             answer=answer, occurred_at=utc_now())
            return {**receipt, 'answer': snapshot['answer'], 'explanation': snapshot['explanation']}
