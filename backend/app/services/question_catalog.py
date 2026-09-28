"""读取共享审核题库，转换原先只有 passed 的互动题为明确作答题。"""
import json
from pathlib import Path
from app.services.question_evidence import normalize_question

ROOT = Path(__file__).resolve().parents[3]/'shared'/'curriculum'/'g7-upper'
PACKAGES = {p['id']:p for number in range(1,7)
            for p in json.loads((ROOT/f'chapter-{number}.json').read_text(encoding='utf-8'))['packages']}
QUESTIONS = {q['id']:q for p in PACKAGES.values() for bank in ('questions','retestQuestions') for q in p.get(bank,[])}

# 原课件的“已通过”布尔值无法独立判分；每日路线改用同目标、可核验的明确问题。
INTERACTIVE_CHECKS = {
 'solid-09':('正方体有多少条棱？',['6','8','12'],'c'),
 'solid-10':('圆柱有几个圆形底面？',['1','2','3'],'b'),
 'fold-09':('正方体展开图由几个正方形组成？',['4','6','8'],'b'),
 'fold-10':('正方体中，一个面有几个相对的面？',['1','2','4'],'a'),
 'section-09':('平面截去正方体的一个角，切口可以是什么图形？',['圆形','三角形','七边形'],'b'),
 'section-10':('正方体的平面截面最多可以有几条边？',['4','6','8'],'b'),
 'views-09':('主视图、左视图共有的是物体的哪一种尺寸？',['长','宽','高'],'c'),
 'views-10':('俯视图反映物体哪两个方向的尺寸？',['长和宽','长和高','宽和高'],'a'),
}


def find_question(question_id):
    return QUESTIONS.get(question_id)


def route_questions(pack, retest=False):
    questions = pack.get('retestQuestions') if retest else None
    result = []
    for original in questions or pack['questions']:
        q = normalize_question(original)
        if q['response_type']=='interactive':
            prompt,options,answer = INTERACTIVE_CHECKS[q['id']]
            q.update(id='ai-route-'+q['id'],prompt=prompt,options=[{'id':chr(97+i),'text':text} for i,text in enumerate(options)],
                     answer=answer,response_type='single-choice',visual=None,
                     explanation=f"{prompt} 正确答案是：{options[ord(answer)-97]}。")
        result.append(q)
    return result
