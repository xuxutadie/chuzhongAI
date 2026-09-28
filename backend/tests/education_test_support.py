"""教育空间测试仅使用临时数据库，不读取真实学生资料。"""
import hashlib
from uuid import uuid4
from admin_test_support import AdminFixture
from app.admin_workspace.accounts import AdminAccounts
from app.education.schema import migrate_education_schema
from app.education.policy import SessionIdentity, SpaceContext


class EducationFixture(AdminFixture):
    def setUp(self):
        super().setUp()
        with self.repo.transaction() as db:
            migrate_education_schema(db)
        self.admin_identity = self.identity(self.auth)
        account = AdminAccounts(self.repo).create_account(self.actor, self.payload(
            username='teacher-one', display_name='教师甲', role='teacher', password=self.password))
        self.teacher = account['id']
        self.teacher_auth = self.workspace.login(username='teacher-one', password=self.password)
        self.teacher_identity = self.identity(self.teacher_auth)
        self.student_auth = self.workspace.login(username='student-one', password=self.password)
        self.student_identity = self.identity(self.student_auth)

    @staticmethod
    def identity(auth):
        return SessionIdentity(auth['user']['id'], hashlib.sha256(auth['access_token'].encode()).hexdigest())

    @staticmethod
    def request(**fields):
        return {'request_id': str(uuid4()), **fields}

    def seed_space(self, user_id=None, role='teacher'):
        space_id, member_id = str(uuid4()), str(uuid4())
        with self.repo.transaction() as db:
            db.execute("INSERT INTO education_spaces(id,name,kind,state,revision,created_at,updated_at) VALUES(?,'同名学校','school','active',1,'now','now')", (space_id,))
            db.execute("INSERT INTO education_memberships(id,space_id,user_id,role,state,revision,created_at,updated_at) VALUES(?,?,?,?,'active',1,'now','now')", (member_id, space_id, user_id or self.teacher, role))
        return SpaceContext(space_id, member_id, 1, 1)

    def seed_grant(self, context):
        grant_id = str(uuid4())
        with self.repo.transaction() as db:
            db.execute("""INSERT INTO education_student_grants(id,student_id,teacher_membership_id,scope,state,revision,created_at,updated_at)
                VALUES(?,?,?,'all_learning_history_read','active',1,'now','now')""", (grant_id, self.student, context.membership_id))
        return grant_id
