"""只在临时副本演练归属映射、回滚与凭证附件备份。"""
import copy
import json
import unittest
from uuid import uuid4
from education_test_support import EducationFixture
from app.teacher_knowledge.schema import migrate_knowledge_schema
from app.teacher_knowledge.repository import KnowledgeRepository


class MigrationTests(EducationFixture, unittest.TestCase):
    def setUp(self):
        super().setUp()
        with self.repo.transaction() as db: migrate_knowledge_schema(db)
        self.knowledge = KnowledgeRepository(self.path)
        self.book = self.knowledge.create('textbooks', self.teacher, {'title':'合成教材'})
        self.chapter = self.knowledge.create('chapters', self.teacher, {'title':'合成章节'}, parent_id=self.book['id'])

    def mapping(self):
        from app.education.migration import inventory
        space = str(uuid4())
        return {'version':1, 'source_fingerprint':inventory(self.path)['fingerprint'], 'admin_id':self.actor,
                'spaces':[{'id':space,'name':'验收学校','kind':'school'}],
                'members':[{'space_id':space,'user_id':self.teacher,'role':'school_admin'}],
                'resources':[{'table':t,'id':v['id'],'owner_id':self.teacher,'space_id':space}
                             for t,v in [('textbooks',self.book),('chapters',self.chapter)]]}

    def test_migration_is_atomic_preserves_business_and_requires_acceptance(self):
        from app.education.migration import apply_mapping, business_fingerprint, map_digest
        mapping = self.mapping()
        with self.repo.read() as db: before = business_fingerprint(db)
        with self.repo.transaction() as db:
            result = apply_mapping(db, mapping)
            self.assertEqual(before, business_fingerprint(db))
            self.assertEqual(db.execute('SELECT count(*) FROM education_memberships').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM education_student_grants').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT count(*) FROM sessions').fetchone()[0],0)
            self.assertEqual(db.execute('SELECT space_id FROM tk_chapters').fetchone()[0],mapping['spaces'][0]['id'])
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(),[])
        self.assertEqual(result['mapping_digest'],map_digest(mapping))
        self.assertEqual(len(result['invitations']),1)
        with self.repo.transaction() as db:
            self.assertTrue(apply_mapping(db,mapping)['already_applied'])

    def test_bad_reference_mapping_and_stale_inventory_roll_back_everything(self):
        from app.education.migration import apply_mapping
        mapping=self.mapping(); mapping['resources']=mapping['resources'][1:]
        with self.assertRaisesRegex(ValueError,'引用'):
            with self.repo.transaction() as db: apply_mapping(db,mapping)
        with self.repo.read() as db:
            self.assertNotIn('space_id',[r[1] for r in db.execute('PRAGMA table_info(tk_files)')])
            self.assertFalse(db.execute('SELECT 1 FROM education_schema_versions WHERE version=2').fetchone())
        mapping=self.mapping(); mapping['source_fingerprint']='0'*64
        with self.assertRaisesRegex(ValueError,'盘点'):
            with self.repo.transaction() as db: apply_mapping(db,mapping)

    def test_unmapped_resources_stay_quarantined_and_old_jobs_cancel(self):
        from app.education.migration import apply_mapping
        from app.teacher_knowledge.jobs import KnowledgeJobs
        KnowledgeJobs(self.knowledge).enqueue(self.teacher,'import',{'units':[{}]},'old-request')
        mapping=self.mapping(); mapping['resources']=[]
        with self.repo.transaction() as db:
            apply_mapping(db,mapping)
            self.assertEqual(db.execute('SELECT count(*) FROM tk_textbooks WHERE space_id IS NULL').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT state FROM tk_jobs').fetchone()[0],'cancelled')

    def test_snapshot_is_verified_and_rehearsal_never_changes_source(self):
        from app.education.migration import snapshot, verify_snapshot, rehearse, inventory
        root=self.path.parent
        private=root/('.'+self.path.name+'.personal-api'); private.mkdir(); (private/'synthetic.enc').write_bytes(b'not-real-credentials')
        before=inventory(self.path)['fingerprint']; mapping=self.mapping()
        with self.assertRaisesRegex(ValueError,'停机'): snapshot(self.path,root/'unsafe',maintenance_confirmed=False)
        backup=snapshot(self.path,root/'backup',maintenance_confirmed=True)
        self.assertTrue(verify_snapshot(backup)['verified'])
        result=rehearse(backup,root/'rehearsal',mapping)
        self.assertTrue(result['integrity_ok'])
        self.assertEqual(inventory(self.path)['fingerprint'],before)
        copied=root/'backup'/private.name/'synthetic.enc'; copied.write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError,'备份'): verify_snapshot(backup)

    def test_wrong_admin_unknown_fields_and_unmapped_owner_are_rejected(self):
        from app.education.migration import apply_mapping
        for change in ({'admin_id':self.student},{'unexpected':True},{'members':[]}):
            mapping=self.mapping(); mapping.update(change)
            with self.assertRaises(ValueError):
                with self.repo.transaction() as db: apply_mapping(db,mapping)
