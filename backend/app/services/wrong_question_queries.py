"""错题集公开查询；保留旧图片接口和旧整数编号。"""
import json
from app.services.student_workspace_service import ResourceNotFoundError
from app.services.question_evidence import encode


def ensure_learning(db,user_id,question_id):
    row=db.execute('SELECT * FROM wrong_questions WHERE id=? AND user_id=?',(question_id,user_id)).fetchone()
    if not row:
        raise ResourceNotFoundError('未找到你的错题')
    db.execute("INSERT OR IGNORE INTO wrong_question_learning(user_id,wrong_question_id,identity_key) VALUES(?,?,?)",(user_id,question_id,f'upload:{question_id}'))
    return db.execute('SELECT * FROM wrong_question_learning WHERE user_id=? AND wrong_question_id=? AND suppressed=0',(user_id,question_id)).fetchone()


def snapshot_and_events(db,user_id,learning):
    rows=db.execute('''SELECT e.*,a.private_snapshot_json,a.source,a.context_json FROM question_answer_events e
        JOIN wrong_question_event_links x ON x.event_id=e.id
        JOIN learning_question_assignments a ON a.id=e.assignment_id
        WHERE x.learning_id=? AND e.user_id=? ORDER BY e.id''',(learning['id'],user_id)).fetchall()
    original=next((r for r in rows if r['source']!='practice'),None)
    if original and not json.loads(learning['state_json']).get('manual_edit'):
        snapshot=json.loads(original['private_snapshot_json'])
    else:
        q=db.execute('SELECT * FROM wrong_questions WHERE id=? AND user_id=?',(learning['wrong_question_id'],user_id)).fetchone()
        snapshot={'id':f"upload:{q['id']}",'prompt':q['question_text'],'answer':None,'options':[],
                  'knowledge_points':json.loads(q['knowledge_points_json']),'explanation':''}
    events=[{'id':r['id'],'answer':json.loads(r['answer_json']),'result':r['result'],'source':r['source'],
             'occurred_at':r['occurred_at']} for r in rows]
    return snapshot,events


def list_collection(db,user_id,source=None,stage=None,knowledge_point=None,limit=20,offset=0):
    # SQL 内筛选/分页；source 从首条来源得出，不受后来变式事件覆盖。
    base='''SELECT w.id,w.subject,w.question_text,w.created_at,w.updated_at,
        w.knowledge_points_json,(w.source_image IS NOT NULL OR w.source_upload_id IS NOT NULL) AS has_image,
        COALESCE(l.stage,'pending_verification') AS stage,COALESCE(l.wrong_count,0) AS wrong_count,
        COALESCE(l.revision,0) AS revision,l.due_date,
        COALESCE((SELECT a.source FROM wrong_question_event_links x JOIN question_answer_events e ON e.id=x.event_id
            JOIN learning_question_assignments a ON a.id=e.assignment_id WHERE x.learning_id=l.id
            AND e.user_id=w.user_id ORDER BY e.id LIMIT 1),
            CASE WHEN w.source_image IS NOT NULL OR w.source_upload_id IS NOT NULL THEN 'photo' ELSE 'manual' END) AS source,
        (SELECT MAX(e.occurred_at) FROM question_answer_events e JOIN wrong_question_event_links x ON x.event_id=e.id
            WHERE x.learning_id=l.id AND e.user_id=w.user_id AND e.result='wrong') AS last_wrong_at
        FROM wrong_questions w LEFT JOIN wrong_question_learning l ON l.wrong_question_id=w.id AND l.user_id=w.user_id
        WHERE w.user_id=? AND COALESCE(l.suppressed,0)=0'''
    clauses=[]
    params=[user_id]
    for name,value in (('source',source),('stage',stage)):
        if value:
            clauses.append(f'{name}=?')
            params.append(value)
    if knowledge_point:
        clauses.append('EXISTS(SELECT 1 FROM json_each(knowledge_points_json) WHERE value=?)')
        params.append(knowledge_point)
    query=f'SELECT * FROM ({base})'+(' WHERE '+' AND '.join(clauses) if clauses else '')
    total=db.execute(f'SELECT COUNT(*) FROM ({query})',params).fetchone()[0]
    rows=db.execute(query+' ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?',params+[limit,offset]).fetchall()
    items=[]
    for row in rows:
        item=dict(row)
        item['knowledge_points']=json.loads(item.pop('knowledge_points_json'))
        item['has_image']=bool(item['has_image'])
        items.append(item)
    counts={r['stage']:r['n'] for r in db.execute(f'SELECT stage,COUNT(*) n FROM ({query}) GROUP BY stage',params)}
    return {'items':items,'total':total,'counts':counts}


def collection_detail(db,user_id,question_id):
    q=db.execute('SELECT id,question_text,source_image IS NOT NULL OR source_upload_id IS NOT NULL AS has_image FROM wrong_questions WHERE id=? AND user_id=?',(question_id,user_id)).fetchone()
    if not q:
        raise ResourceNotFoundError('未找到你的错题')
    learning=db.execute('SELECT * FROM wrong_question_learning WHERE wrong_question_id=? AND user_id=? AND suppressed=0',(question_id,user_id)).fetchone()
    if not learning:
        return {'id':question_id,'question':{'prompt':q['question_text'],'answer':None},'events':[],'stage':'pending_verification','revision':0,'evidence_version':0,'analysis':None,'has_image':bool(q['has_image'])}
    snapshot,events=snapshot_and_events(db,user_id,learning)
    analysis=db.execute("SELECT * FROM wrong_question_ai_jobs WHERE user_id=? AND learning_id=? AND kind='analysis' AND status='completed' ORDER BY updated_at DESC LIMIT 1",(user_id,learning['id'])).fetchone()
    return {'id':question_id,'question':snapshot,'events':events,'stage':learning['stage'],
            'revision':learning['revision'],'evidence_version':learning['evidence_version'],'has_image':bool(q['has_image']),
            'analysis':json.loads(analysis['result_json']) if analysis else None,
            'analysis_stale':bool(analysis and analysis['evidence_version']!=learning['evidence_version'])}
