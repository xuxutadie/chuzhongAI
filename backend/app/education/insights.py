"""明确授权的跨校历史只读视图；每次输出重新检查授权修订。"""
from app.services.teacher_insights import TeacherInsights, has_table
from .policy import require_context, require_history
from .errors import EducationError


class ScopedTeacherInsights(TeacherInsights):
    def __init__(self, repository, identity, context):
        super().__init__(repository)
        self.identity = identity
        self.context = context

    def _authorize(self, db, teacher_id, student_id):
        if teacher_id != self.identity.user_id:
            raise EducationError('未找到可访问的学生记录', 404)
        return require_history(db, self.identity, self.context, student_id)

    def students(self, *, name='', offset=0, limit=20):
        with self.repository.read() as db:
            require_context(db, self.identity, self.context)
            query = '''FROM education_student_grants g JOIN users u ON u.id=g.student_id
                JOIN admin_account_states a ON a.user_id=u.id WHERE g.teacher_membership_id=?
                AND g.state='active' AND a.state='active' AND u.role='student' AND instr(u.display_name,?)>0'''
            args = [self.context.membership_id, name]
            total = db.execute('SELECT count(*) '+query,args).fetchone()[0]
            rows = db.execute('SELECT u.id,u.display_name,u.grade,g.id AS grant_id,g.revision AS grant_revision,g.updated_at AS authorized_at '
                + query + ' ORDER BY g.created_at,g.id LIMIT ? OFFSET ?',args+[limit,offset]).fetchall()
            result = {'items':[dict(row) for row in rows], 'total':total}
        # 离开旧快照后复核，防止处理期间撤销后仍输出名单。
        with self.repository.read() as db:
            require_context(db, self.identity, self.context)
            for row in rows:
                require_history(db, self.identity, self.context, row['id'], row['grant_revision'])
        return result

    def assessment(self, teacher_id, student_id, attempt_id):
        with self.repository.read() as db:
            self._authorize(db, teacher_id, student_id)
            found = has_table(db, 'diagnosis_attempts') and db.execute(
                "SELECT 1 FROM diagnosis_attempts WHERE id=? AND user_id=? AND status='submitted'", (attempt_id,student_id)).fetchone()
            if not found: raise EducationError('未找到可访问的测评',404)
        return super().assessment(teacher_id,student_id,attempt_id)

    def history(self, teacher_id, student_id, kind, offset=0, limit=20):
        if kind != 'learning':
            return super().history(teacher_id,student_id,'reports' if kind=='assessments' else kind,offset,limit)
        with self.repository.read() as db:
            self._authorize(db,teacher_id,student_id)
            if not has_table(db,'daily_learning_routes'): return {'items':[], 'total':0}
            rows = db.execute('''SELECT study_date,state_json,updated_at FROM daily_learning_routes
                WHERE user_id=? ORDER BY study_date DESC LIMIT ? OFFSET ?''',(student_id,limit,offset)).fetchall()
            total = db.execute('SELECT count(*) FROM daily_learning_routes WHERE user_id=?',(student_id,)).fetchone()[0]
            return {'items':[self._route(row) for row in rows], 'total':total}

    def read(self, method, student_id, *args, **kwargs):
        allowed = ('overview','history','assessment','report_pdf','wrong_question','wrong_image')
        if method not in allowed: raise ValueError('未知只读操作')
        with self.repository.read() as db:
            before = self._authorize(db,self.identity.user_id,student_id)['revision']
        result = getattr(self,method)(self.identity.user_id,student_id,*args,**kwargs)
        with self.repository.read() as db:
            require_history(db,self.identity,self.context,student_id,before)
        return result
