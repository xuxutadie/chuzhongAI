"""部署只能启动已校验、已启用学校隔离的持久化数据库。"""
import unittest
import os
import base64
from unittest.mock import patch

from education_test_support import EducationFixture
from app.deployment_preflight import verify_database, verify_release
from app.core.config import Settings
from app.education.migration import apply_mapping, inventory
from app.education.errors import EducationError


class DeploymentPreflightTests(EducationFixture, unittest.TestCase):
    def test_missing_database_is_not_created(self):
        missing = self.path.parent / 'missing.db'
        with self.assertRaisesRegex(ValueError, '数据库'):
            verify_database(missing, self.path.parent)
        self.assertFalse(missing.exists())

    def test_database_outside_persistent_root_is_rejected(self):
        with self.assertRaisesRegex(ValueError, '持久化'):
            verify_database(self.path, self.path.parent / 'another-volume')

    def test_legacy_database_is_not_silently_upgraded(self):
        with self.assertRaises(EducationError):
            verify_database(self.path, self.path.parent)
        with self.repo.read() as db:
            self.assertFalse(db.execute('SELECT 1 FROM education_schema_versions WHERE version=2').fetchone())

    def test_cutover_database_passes_read_only_check(self):
        mapping = {'version':1, 'source_fingerprint':inventory(self.path)['fingerprint'],
                   'admin_id':self.actor, 'spaces':[], 'members':[], 'resources':[]}
        with self.repo.transaction() as db:
            apply_mapping(db, mapping)
        self.assertTrue(verify_database(self.path, self.path.parent)['isolation_enabled'])

    def test_full_release_checks_encrypted_files_and_fonts(self):
        mapping = {'version':1, 'source_fingerprint':inventory(self.path)['fingerprint'],
                   'admin_id':self.actor, 'spaces':[], 'members':[], 'resources':[]}
        with self.repo.transaction() as db:
            apply_mapping(db, mapping)
        configured = Settings(_env_file=None, app_env='production', student_workspace_database_path=str(self.path))
        with patch.dict(os.environ, {'API_VAULT_BACKEND':'aes_gcm',
                'API_VAULT_KEY':base64.b64encode(os.urandom(32)).decode(),
                'API_VAULT_CONTEXT':'release-test-context'}), \
                patch('app.services.transition_pdf.register_chinese_font') as font, \
                patch('app.services.transition_pdf.register_number_font'):
            from app.services.personal_api_vault import PersonalAPIVault, PersonalAPIStorageError
            vault = PersonalAPIVault(self.path)
            vault.update(1, lambda _: {'llm': {'api_key':'synthetic'}})
            self.assertTrue(verify_release(configured, self.path.parent)['integrity_ok'])
            font.assert_called_once()
            vault._path(1).write_bytes(b'legacy-not-decrypted')
            with self.assertRaises(PersonalAPIStorageError):
                verify_release(configured, self.path.parent)

    def test_release_rejects_development_and_missing_cloud_encryption(self):
        with self.assertRaisesRegex(ValueError, 'production'):
            verify_release(Settings(_env_file=None, app_env='development'), self.path.parent)
        with patch.dict('os.environ', {'API_VAULT_BACKEND':'windows_dpapi'}):
            with self.assertRaisesRegex(ValueError, 'AES'):
                verify_release(Settings(_env_file=None, app_env='production'), self.path.parent)
