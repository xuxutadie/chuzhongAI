"""复用纯学情读取；不借用学生身份、不触发学习任务。"""
import json
from app.services.teacher_insights import TeacherInsights, has_table, profile_fields
from .repository import require_actor, public_account
from .accounts import record_event
from .errors import AdminError


class AdminStudentViews(TeacherInsights):
    @staticmethod
    def _authorize(db, actor_id, target_id):
        require_actor(db, actor_id)
        public_account(db, target_id)
        return {'id': None}

    @staticmethod
    def _profile(db, target_id):
        account = public_account(db, target_id)
        row = db.execute('SELECT fields_json FROM diagnosis_profiles WHERE user_id=?',(target_id,)).fetchone() if has_table(db,'diagnosis_profiles') else None
        return {'display_name':account['display_name'],'fields':profile_fields(json.loads(row[0])) if row else {}}

    def open_view(self,actor_id,target_id,kind,request_id):
        if kind not in ('student','teacher'): raise AdminError('查看类型无效')
        with self.repository.transaction() as db:
            self._authorize(db,actor_id,target_id)
            event_kind='view-'+kind
            prior=db.execute('SELECT target_id,kind FROM admin_action_events WHERE actor_id=? AND request_id=?',(actor_id,str(request_id))).fetchone()
            if prior:
                if prior['target_id']!=target_id or prior['kind']!=event_kind: raise AdminError('请求编号已使用',409)
                return
            record_event(db,actor_id,target_id,event_kind,request_id)
