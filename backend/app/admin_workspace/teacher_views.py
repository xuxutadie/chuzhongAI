"""教师资料与知识库只读视图，排除凭证与原始文件位置。"""
import json
from app.services.teacher_insights import has_table
from .repository import require_actor, public_account
from .accounts import validate_page
from .errors import AdminError
from app.education.runtime import cutover_enabled

RESOURCES={'textbooks':'tk_textbooks','chapters':'tk_chapters','questions':'tk_questions',
           'question-versions':'tk_question_versions','question-sets':'tk_question_sets'}
DISPLAY_FIELDS=('title','grade','edition','semester','subject','status','current_version_id','prompt',
                'response_type','options','answer','explanation','rubric','needs_figure','scope','difficulty',
                'purpose','question_version_ids','knowledge_point_ids','prerequisite_ids','summary','text','diagram')


def display_item(row):
    try:
        data=json.loads(row['data'])
        if not isinstance(data,dict): raise ValueError()
    except (TypeError,ValueError):
        raise AdminError('资料格式异常，请联系维护人员',503) from None
    return {k:row[k] for k in ('id','parent_id','revision','archived','created_at','updated_at')} | {'data':{k:data[k] for k in DISPLAY_FIELDS if k in data}}


class AdminTeacherViews:
    def __init__(self,repo): self.repo=repo

    def overview(self,actor_id,target_id):
        with self.repo.read() as db:
            require_actor(db,actor_id)
            account=public_account(db,target_id)
            row=db.execute('SELECT school_name,teaching_classes_json FROM teacher_profiles WHERE user_id=?',(target_id,)).fetchone() if has_table(db,'teacher_profiles') else None
            return {'account':account,'school_name':row['school_name'] if row else '',
                    'teaching_classes':json.loads(row['teaching_classes_json']) if row else []}

    def students(self,actor_id,target_id,offset=0,limit=20):
        validate_page(offset,limit)
        with self.repo.read() as db:
            require_actor(db,actor_id); public_account(db,target_id)
            if cutover_enabled(db):
                query = ''' FROM education_student_grants g
                    JOIN education_memberships m ON m.id=g.teacher_membership_id
                    JOIN education_spaces s ON s.id=m.space_id
                    JOIN users u ON u.id=g.student_id
                    JOIN admin_account_states a ON a.user_id=u.id
                    WHERE m.user_id=? AND m.state='active' AND s.state='active'
                    AND m.role IN ('teacher','school_admin') AND g.state='active'
                    AND u.role='student' AND a.state='active' '''
                total=db.execute('SELECT count(DISTINCT g.student_id)'+query,(target_id,)).fetchone()[0]
                rows=db.execute('SELECT DISTINCT g.student_id'+query+' ORDER BY g.student_id LIMIT ? OFFSET ?',
                                (target_id,limit,offset)).fetchall()
                return {'items':[public_account(db,r[0]) for r in rows],'total':total,'offset':offset,'limit':limit}
            if not has_table(db,'teacher_student_links'):
                raise AdminError('教师功能需要完成数据库升级',503)
            args=(target_id,)
            query=" FROM teacher_student_links WHERE teacher_id=? AND status='active'"
            total=db.execute('SELECT count(*)'+query,args).fetchone()[0]
            rows=db.execute('SELECT student_id'+query+' ORDER BY student_id LIMIT ? OFFSET ?',args+(limit,offset)).fetchall()
            return {'items':[public_account(db,r[0]) for r in rows],'total':total,'offset':offset,'limit':limit}

    def _table(self,db,resource):
        if resource not in RESOURCES: raise AdminError('资料类型不存在',404)
        if not has_table(db,'tk_schema_versions') or not db.execute('SELECT 1 FROM tk_schema_versions WHERE version=1').fetchone():
            raise AdminError('知识库需要完成数据库升级',503)
        return RESOURCES[resource]

    def knowledge(self,actor_id,target_id,resource,offset=0,limit=20):
        validate_page(offset,limit)
        with self.repo.read() as db:
            require_actor(db,actor_id); public_account(db,target_id)
            table=self._table(db,resource)
            total=db.execute(f'SELECT count(*) FROM {table} WHERE owner_id=? AND archived=0',(target_id,)).fetchone()[0]
            rows=db.execute(f'SELECT * FROM {table} WHERE owner_id=? AND archived=0 ORDER BY created_at DESC,id LIMIT ? OFFSET ?',(target_id,limit,offset)).fetchall()
            return {'items':[display_item(row) for row in rows],'total':total,'offset':offset,'limit':limit}

    def knowledge_detail(self,actor_id,target_id,resource,resource_id):
        with self.repo.read() as db:
            require_actor(db,actor_id); public_account(db,target_id)
            table=self._table(db,resource)
            row=db.execute(f'SELECT * FROM {table} WHERE id=? AND owner_id=?',(resource_id,target_id)).fetchone()
            if row is None: raise AdminError('未找到该教师的资料',404)
            result=display_item(row)
            version_id=result['data'].get('current_version_id')
            version_table={'questions':'tk_question_versions','chapters':'tk_chapter_versions'}.get(resource)
            if version_id and version_table:
                version=db.execute(f'SELECT * FROM {version_table} WHERE id=? AND owner_id=? AND parent_id=?',(version_id,target_id,resource_id)).fetchone()
                if version: result['current_version']=display_item(version)
            if resource=='question-sets':
                result['questions']=[]
                for version_id in result['data'].get('question_version_ids',[]):
                    version=db.execute('SELECT * FROM tk_question_versions WHERE id=? AND owner_id=?',(version_id,target_id)).fetchone()
                    if version: result['questions'].append(display_item(version))
            return result
