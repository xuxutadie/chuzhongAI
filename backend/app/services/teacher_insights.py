"""教师只读学情：每次在同一事务验证有效关联，不创建任务、不调用模型。"""
import json
from pydantic import ValidationError
from app.schemas.stored_diagnosis_report import StoredDiagnosisReport
from datetime import datetime, timedelta, timezone
from app.schemas.transition_diagnosis import ProfileFields
from app.services.teacher_links import require_link, require_legacy_links
from app.services.student_workspace_service import ResourceNotFoundError, ResourceConflictError
from app.services.transition_diagrams import corrected_question_display
from app.services.wrong_question_queries import list_collection, collection_detail


def has_table(db, name):
    return db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def select_fields(value, keys):
    return {key: value[key] for key in keys if key in value}


def profile_fields(value):
    return select_fields(value, ProfileFields.model_fields)


class TeacherInsights:
    def __init__(self, repository):
        self.repository = repository

    @staticmethod
    def _authorize(db, teacher_id, student_id):
        # 普通教师始终验证关联；管理员只读服务单独覆盖权限策略。
        return require_link(db, teacher_id, student_id)

    @staticmethod
    def _profile(db, student_id):
        row = db.execute('SELECT display_name,grade FROM users WHERE id=? AND role=?', (student_id, 'student')).fetchone()
        if not row:
            raise ResourceNotFoundError('未找到可访问的学生记录')
        profile = db.execute('SELECT fields_json FROM diagnosis_profiles WHERE user_id=?', (student_id,)).fetchone() if has_table(db, 'diagnosis_profiles') else None
        fields = profile_fields(json.loads(profile['fields_json'])) if profile else {}
        return {'display_name': row['display_name'], 'fields': fields}

    @staticmethod
    def _last_activity(db, student_id):
        values = []
        for table, column in [('question_answer_events','occurred_at'), ('diagnosis_attempts','submitted_at'), ('daily_tasks','completed_at')]:
            if has_table(db, table):
                value = db.execute(f'SELECT MAX({column}) FROM {table} WHERE user_id=?', (student_id,)).fetchone()[0]
                if value:
                    values.append(value)
        return max(values) if values else None

    def students(self, teacher_id, filters=None, offset=0, limit=20):
        filters = filters or {}
        with self.repository.read() as db:
            require_legacy_links(db)
            # 学校与班级只能筛选已有授权的学生，绝不查询未关联名单。
            join = 'LEFT JOIN diagnosis_profiles p ON p.user_id=u.id' if has_table(db, 'diagnosis_profiles') else "LEFT JOIN (SELECT NULL user_id,'{}' fields_json) p ON 0"
            query = f"""FROM teacher_student_links l JOIN users u ON l.student_id=u.id {join}
                WHERE l.teacher_id=? AND l.status='active' AND u.role='student'"""
            params = [teacher_id]
            for key, field in [('school','school_name'), ('class_name','class_name'), ('grade','grade')]:
                if filters.get(key):
                    query += f" AND json_extract(p.fields_json,'$.{field}')=?"
                    params.append(filters[key])
            if filters.get('name'):
                query += " AND instr(u.display_name,?)>0"
                params.append(filters['name'])
            total = db.execute('SELECT count(*) ' + query, params).fetchone()[0]
            rows = db.execute('SELECT u.id,l.id link_id,l.linked_at ' + query + ' ORDER BY l.linked_at DESC,u.id LIMIT ? OFFSET ?', params+[min(limit,100),offset]).fetchall()
            items = []
            for row in rows:
                profile = self._profile(db, row['id'])
                items.append(dict(row) | {'display_name': profile['display_name'],
                    **{k: profile['fields'].get(k, '') for k in ('school_name','class_name','grade')},
                    'last_activity': self._last_activity(db, row['id'])})
            return {'items': items, 'total': total}

    @staticmethod
    def _stored_report(row):
        if row['status'] != 'submitted':
            return None, '尚未交卷'
        if not row['report_json']:
            return None, '已交卷，但报告缺失，请联系管理员核查原始记录。'
        try:
            report = json.loads(row['report_json'])
            StoredDiagnosisReport.model_validate(report)
            return report, None
        except (ValueError, TypeError, ValidationError):
            return None, '已交卷，但报告损坏，请联系管理员核查原始记录。'

    @classmethod
    def _assessment_summary(cls, row):
        report, notice = cls._stored_report(row)
        return {'id': row['id'], 'status': row['status'], 'created_at': row['created_at'], 'submitted_at': row['submitted_at'],
                'score': report['score'] if report else None, 'priority': report.get('priority', []) if report else [],
                'report_available': report is not None, 'report_notice': notice}

    @staticmethod
    def _route(row):
        state = json.loads(row['state_json'])
        return {'date': row['study_date'], 'steps': [{'step': i+1, 'status': step['status']} for i, step in enumerate(state['steps'])],
                'updated_at': row['updated_at']}

    def overview(self, teacher_id, student_id):
        with self.repository.read() as db:
            link = self._authorize(db, teacher_id, student_id)
            latest = db.execute("SELECT * FROM diagnosis_attempts WHERE user_id=? AND status='submitted' ORDER BY submitted_at DESC LIMIT 1", (student_id,)).fetchone() if has_table(db,'diagnosis_attempts') else None
            date = datetime.now(timezone(timedelta(hours=8))).date().isoformat()
            today = db.execute('SELECT study_date,state_json,updated_at FROM daily_learning_routes WHERE user_id=? AND study_date=?', (student_id,date)).fetchone() if has_table(db,'daily_learning_routes') else None
            return {'student_id': student_id, 'link_id': link['id'], 'profile': self._profile(db, student_id),
                    'latest_assessment': self._assessment_summary(latest) if latest else None,
                    'today': self._route(today) if today else None, 'last_activity': self._last_activity(db,student_id)}

    def history(self, teacher_id, student_id, kind, offset=0, limit=20):
        with self.repository.read() as db:
            self._authorize(db, teacher_id, student_id)
            if kind in ('assessments','reports'):
                if not has_table(db,'diagnosis_attempts'):
                    return {'items': [], 'total': 0}
                clause = "user_id=?" + (" AND status='submitted'" if kind == 'reports' else '')
                total = db.execute('SELECT count(*) FROM diagnosis_attempts WHERE '+clause,(student_id,)).fetchone()[0]
                rows = db.execute('SELECT * FROM diagnosis_attempts WHERE '+clause+' ORDER BY created_at DESC LIMIT ? OFFSET ?', (student_id,limit,offset)).fetchall()
                return {'items':[self._assessment_summary(row) for row in rows], 'total':total}
            if kind == 'learning':
                if not has_table(db,'daily_learning_routes'):
                    return {'items': [], 'total': 0}
                start = (datetime.now(timezone(timedelta(hours=8))).date() - timedelta(days=6)).isoformat()
                rows = db.execute('SELECT study_date,state_json,updated_at FROM daily_learning_routes WHERE user_id=? AND study_date>=? ORDER BY study_date DESC', (student_id,start)).fetchall()
                return {'items':[self._route(row) for row in rows[offset:offset+limit]], 'total':len(rows)}
            if kind == 'wrong-questions':
                if has_table(db, 'wrong_question_learning'):
                    result = list_collection(db,student_id,limit=limit,offset=offset)
                    return {'items':result['items'],'total':result['total']}
                rows = db.execute('SELECT id,question_text,created_at,updated_at FROM wrong_questions WHERE user_id=? ORDER BY updated_at DESC LIMIT ? OFFSET ?', (student_id,limit,offset)).fetchall()
                total = db.execute('SELECT count(*) FROM wrong_questions WHERE user_id=?',(student_id,)).fetchone()[0]
                return {'items':[dict(row) for row in rows], 'total':total}
            raise ValueError('未知的学情分区')

    def assessment(self, teacher_id, student_id, attempt_id):
        with self.repository.read() as db:
            self._authorize(db,teacher_id,student_id)
            row = db.execute('SELECT * FROM diagnosis_attempts WHERE id=? AND user_id=?',(attempt_id,student_id)).fetchone() if has_table(db,'diagnosis_attempts') else None
            if row is None:
                raise ResourceNotFoundError('未找到可访问的测评')
            result = self._assessment_summary(row)
            if row['status'] != 'submitted':
                return result
            report, notice = self._stored_report(row)
            if report is None:
                raise ResourceConflictError(notice)
            report = select_fields(report, ('score','distribution','dimensions','evidence','priority','interpretation','interpretation_mode','notice','version'))
            report['evidence'] = [corrected_question_display(select_fields(q, ('id','dimension','text','options','stage','difficulty','diagram','answer','explanation','chosen','state'))) for q in report.get('evidence',[])]
            return result | {'profile': profile_fields(json.loads(row['profile_json'])), 'report': report, 'version':row['version']}

    def report_pdf(self, teacher_id, student_id, attempt_id):
        result = self.assessment(teacher_id,student_id,attempt_id)
        if result['status'] != 'submitted':
            raise ResourceConflictError('交卷后才能查看报告')
        from app.services.transition_pdf import render_report
        content = render_report(result)
        # 渲染可能耗时，输出前再次检查解除状态。
        with self.repository.read() as db:
            self._authorize(db,teacher_id,student_id)
        return content

    def wrong_question(self, teacher_id, student_id, question_id):
        with self.repository.read() as db:
            self._authorize(db,teacher_id,student_id)
            row = db.execute('SELECT id,question_text,knowledge_points_json,error_reason,analysis_summary,analysis_status,created_at,updated_at,source_image IS NOT NULL OR source_upload_id IS NOT NULL has_image FROM wrong_questions WHERE id=? AND user_id=?', (question_id,student_id)).fetchone()
            if row is None:
                raise ResourceNotFoundError('未找到可访问的错题')
            base = dict(row)
            base['knowledge_points'] = json.loads(base.pop('knowledge_points_json'))
            base['has_image'] = bool(base['has_image'])
            if has_table(db,'wrong_question_learning'):
                suppressed = db.execute('SELECT suppressed FROM wrong_question_learning WHERE user_id=? AND wrong_question_id=?', (student_id,question_id)).fetchone()
                if suppressed and suppressed[0]:
                    raise ResourceNotFoundError('未找到可访问的错题')
                detail = collection_detail(db,student_id,question_id)
                detail['question'] = select_fields(detail['question'],('id','prompt','answer','options','knowledge_points','explanation','diagram'))
                return base | select_fields(detail,('question','events','stage','analysis','analysis_stale'))
            return base | {'question':{'prompt':base['question_text']},'events':[],'stage':'pending_verification','analysis':None}

    def wrong_image(self, teacher_id, student_id, question_id):
        with self.repository.read() as db:
            self._authorize(db,teacher_id,student_id)
            row = db.execute('SELECT source_image,source_upload_id FROM wrong_questions WHERE id=? AND user_id=?',(question_id,student_id)).fetchone()
            if not row:
                raise ResourceNotFoundError('未找到可访问的图片')
            if has_table(db,'wrong_question_learning'):
                state = db.execute('SELECT suppressed FROM wrong_question_learning WHERE wrong_question_id=? AND user_id=?',(question_id,student_id)).fetchone()
                if state and state[0]:
                    raise ResourceNotFoundError('未找到可访问的图片')
            if row['source_upload_id']:
                image = db.execute('SELECT image_data,media_type FROM wrong_question_uploads WHERE id=? AND user_id=?',(row['source_upload_id'],student_id)).fetchone()
                if image:
                    return bytes(image['image_data']), image['media_type']
            elif row['source_image'] is not None:
                return bytes(row['source_image']), 'image/jpeg'
            raise ResourceNotFoundError('未找到可访问的图片')
