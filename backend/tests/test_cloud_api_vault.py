"""云端凭证须可迁移、不可跨账号/学校读取，异常时拒绝覆盖。"""
import base64
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.services.personal_api_vault import AESGCMCipher, PersonalAPIVault, PersonalAPIStorageError
from app.teacher_knowledge.vault import SchoolAPIVault


class CloudVaultTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.key = base64.b64encode(os.urandom(32)).decode()
        self.env = patch.dict(os.environ, {
            'API_VAULT_BACKEND': 'aes_gcm', 'API_VAULT_KEY': self.key,
            'API_VAULT_CONTEXT': 'synthetic-deployment-1',
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.vault = PersonalAPIVault(self.root / 'accounts.db')
        self.payload = {'llm': {'api_key': 'synthetic-private-key'}}

    def test_roundtrip_random_nonce_and_no_plaintext(self):
        self.assertEqual(self.vault.storage, 'aes_gcm')
        self.vault.update(1, lambda _: self.payload)
        first = self.vault._path(1).read_bytes()
        self.vault.update(1, lambda old: old)
        second = self.vault._path(1).read_bytes()
        self.assertNotEqual(first, second)
        self.assertNotIn(b'synthetic-private-key', second)
        self.assertEqual(PersonalAPIVault(self.root / 'accounts.db').load(1), self.payload)

    def test_move_to_new_mount_preserves_configuration(self):
        self.vault.update(1, lambda _: self.payload)
        other = PersonalAPIVault(self.root / 'new-mount' / 'accounts.db')
        shutil.copytree(self.vault.directory, other.directory)
        self.assertEqual(other.load(1), self.payload)

    def test_copied_ciphertext_cannot_cross_account_school_or_context(self):
        self.vault.update(1, lambda _: self.payload)
        ciphertext = self.vault._path(1).read_bytes()
        self.vault._path(2).write_bytes(ciphertext)
        with self.assertRaises(PersonalAPIStorageError):
            self.vault.load(2)
        school = SchoolAPIVault(self.root / 'accounts.db', '00000000-0000-0000-0000-000000000001')
        school.directory.mkdir(parents=True)
        school._path(1).write_bytes(ciphertext)
        with self.assertRaises(PersonalAPIStorageError):
            school.load(1)
        school._path(1).unlink()
        school.update(1, lambda _: self.payload)
        other = SchoolAPIVault(self.root / 'accounts.db', '00000000-0000-0000-0000-000000000002')
        shutil.copytree(school.directory, other.directory)
        with self.assertRaises(PersonalAPIStorageError):
            other.load(1)
        with patch.dict(os.environ, {'API_VAULT_CONTEXT': 'another-deployment'}):
            with self.assertRaises(PersonalAPIStorageError):
                PersonalAPIVault(self.root / 'accounts.db').load(1)

    def test_wrong_key_tampering_and_legacy_fail_without_overwrite(self):
        self.vault.update(1, lambda _: self.payload)
        path = self.vault._path(1)
        original = path.read_bytes()
        with patch.dict(os.environ, {'API_VAULT_KEY': base64.b64encode(os.urandom(32)).decode()}):
            with self.assertRaises(PersonalAPIStorageError):
                PersonalAPIVault(self.root / 'accounts.db').update(1, lambda _: {})
        self.assertEqual(path.read_bytes(), original)
        for broken in (original[:-1] + bytes([original[-1] ^ 1]), b'legacy-dpapi-ciphertext'):
            path.write_bytes(broken)
            with self.assertRaises(PersonalAPIStorageError):
                self.vault.update(1, lambda _: {})
            self.assertEqual(path.read_bytes(), broken)

    def test_missing_invalid_key_context_or_backend_fail_closed(self):
        for override in ({'API_VAULT_KEY': ''}, {'API_VAULT_KEY': 'invalid'},
                         {'API_VAULT_KEY': base64.b64encode(b'short').decode()},
                         {'API_VAULT_CONTEXT': ''}, {'API_VAULT_BACKEND': 'unknown'}):
            with self.subTest(override=list(override)), patch.dict(os.environ, override):
                with self.assertRaises(PersonalAPIStorageError):
                    PersonalAPIVault(self.root / 'accounts.db').update(1, lambda _: self.payload)
        self.assertFalse(self.vault.directory.exists())

    def test_cipher_binds_additional_data(self):
        cipher = AESGCMCipher(self.key)
        sealed = cipher.encrypt(b'private', b'account-a')
        self.assertEqual(cipher.decrypt(sealed, b'account-a'), b'private')
        with self.assertRaises(PersonalAPIStorageError):
            cipher.decrypt(sealed, b'account-b')
