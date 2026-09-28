"""把不同题库转为可信快照；数学答案不从浏览器采信。"""
import hashlib
import json
import re
from fractions import Fraction
from copy import deepcopy


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def normalize_question(q):
    options = q.get('options', [])
    if isinstance(options, dict):
        options = [{'id': k, 'text': v} for k, v in options.items()]
    return {'id': q['id'], 'prompt': q.get('prompt', q.get('text', '')),
            'options': options, 'answer': q.get('answer', q.get('correctAnswer')),
            'response_type': q.get('response_type', q.get('responseType', 'single-choice')),
            'explanation': q.get('explanation', ''), 'diagram': q.get('diagram'), 'visual': q.get('visual'),
            'knowledge_points': q.get('knowledge_points', [q.get('knowledgePointId', '数学基础')]),
            'capability_tag': q.get('capabilityTag', ''), 'dimension': q.get('dimension')}


def question_identity(question):
    q = normalize_question(question)
    choices = {item['id']: item['text'] for item in q['options']}
    answer = q['answer']
    if isinstance(answer, list):
        answer = sorted(choices.get(x, x) for x in answer)
    elif isinstance(answer, str):
        answer = choices.get(answer, answer)
    content = {'id': q['id'], 'prompt': q['prompt'], 'options': sorted(choices.values()),
               'answer': answer, 'diagram': q['diagram'], 'visual': q['visual']}
    return q['id'] + ':' + hashlib.sha256(encode(content).encode()).hexdigest()


def grade_answer(snapshot, answer):
    if answer is None or answer == '' or answer == []:
        return 'skipped'
    expected = snapshot.get('answer')
    if expected is None or isinstance(expected, dict):
        return 'unverified'
    if snapshot.get('response_type')=='numeric':
        try:
            if not isinstance(answer,str) or len(answer)>60 or not re.fullmatch(r'[-+]?\d{1,12}(?:\.\d{1,12}|/\d{1,12})?',answer.strip().replace('−','-')):
                return 'wrong'
            return 'correct' if Fraction(answer.strip().replace('−','-'))==Fraction(expected) else 'wrong'
        except (ValueError,ZeroDivisionError):
            return 'wrong'
    if isinstance(expected, list):
        same = isinstance(answer, list) and all(isinstance(x, str) for x in answer) and sorted(expected) == sorted(answer)
    else:
        same = type(expected) is type(answer) and expected == answer
    return 'correct' if same else 'wrong'


def public_question(snapshot):
    return deepcopy({k: snapshot[k] for k in ('id','prompt','options','response_type','diagram','visual','knowledge_points','capability_tag') if k in snapshot})
