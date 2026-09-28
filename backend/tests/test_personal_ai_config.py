"""个人 API 的权限、密钥隔离和加密持久化回归测试。"""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from pydantic import ValidationError

from app.core.config import Settings
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.schemas.personal_ai_config import PersonalAIConfigStatus, PersonalAIConfigUpdate
from app.services.ai_runtime_config import AIRuntimeError
from app.services.personal_ai_config_service import PersonalAIConfigService
from app.services.personal_api_vault import PersonalAPIVault, WindowsDPAPICipher


class ScopeCheckingTestCipher:
    """仅供跨平台单元测试的密文替身，真实加密另测 Windows DPAPI。"""

    available = True

    def __init__(self):
        self.sealed = {}

    def encrypt(self, plaintext, entropy):
        token = os.urandom(48)
        self.sealed[token] = (plaintext, entropy)
        return token

    def decrypt(self, ciphertext, entropy):
        plaintext, expected = self.sealed[ciphertext]
        if entropy != expected:
            raise ValueError("wrong scope")
        return plaintext


class PersonalAIConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repository = StudentWorkspaceRepository(Path(self.temp.name) / "accounts.sqlite3")
        self.teacher = self.repository.create_user(username="teacher", password_hash="test-only", display_name="老师", role="admin", created_by=None)
        self.student = self.repository.create_user(username="personal", password_hash="test-only", display_name="自主学生", role="student", created_by=None)
        self.other = self.repository.create_user(username="other", password_hash="test-only", display_name="另一学生", role="student", created_by=None)
        self.managed = self.repository.create_user(username="managed", password_hash="test-only", display_name="班级学生", role="student", created_by=self.teacher["id"])
        self.cipher = ScopeCheckingTestCipher()
        self.vault = PersonalAPIVault(self.repository.database_path, cipher=self.cipher)
        self.shared = Settings(_env_file=None, llm_enabled=True, llm_provider="OpenAI", llm_api_base_url="https://api.openai.com/v1", llm_api_key="shared-test-key-only", llm_model="shared-model", ocr_enabled=True, ocr_provider="openai_compatible_vision", ocr_api_base_url="https://api.openai.com/v1", ocr_api_key="shared-ocr-test-only", ocr_model="shared-vision")
        self.service = PersonalAIConfigService(self.repository, vault=self.vault, configured_settings=self.shared)
        self.payload = {"enabled": True, "provider": "OpenAI", "api_base_url": "https://api.openai.com/v1", "model": "test-model", "api_key": "personal-test-key-only"}

    def test_personal_student_never_falls_back_to_shared_keys(self):
        runtime = self.service.runtime_config(self.student)
        self.assertFalse(runtime.llm.enabled)
        self.assertEqual(runtime.llm.api_key, "")
        self.assertFalse(runtime.ocr.configured)

    def test_managed_uses_shared_and_cannot_save_personal_even_if_client_claims_personal(self):
        forged = {**self.managed, "created_by": None, "ai_access_mode": "personal"}
        self.assertEqual(self.service.get_status(forged)["mode"], "managed")
        self.assertEqual(self.service.runtime_config(forged).llm.api_key, self.shared.llm_api_key)
        with self.assertRaises(AIRuntimeError):
            self.service.save(forged, "llm", self.payload)
        with self.assertRaises(AIRuntimeError):
            self.service.clear(forged, "llm")

    def test_managed_status_never_discloses_server_endpoint_credentials(self):
        self.shared.llm_api_base_url = "https://server-user:server-secret@api.openai.com/v1?token=private-server-token"
        status = self.service.get_status(self.managed)
        self.assertIsNone(status["llm"]["api_base_url"])
        self.assertIsNone(status["ocr"]["api_base_url"])
        self.assertTrue(status["llm"]["has_api_key"])
        self.assertNotIn("server-secret", json.dumps(status))
        self.assertNotIn("private-server-token", json.dumps(status))

    def test_save_returns_no_secret_and_second_student_cannot_read_it(self):
        result = self.service.save(self.student, "llm", self.payload)
        PersonalAIConfigStatus.model_validate(result)
        self.assertTrue(result["llm"]["configured"])
        self.assertTrue(result["llm"]["has_api_key"])
        self.assertNotIn(self.payload["api_key"], json.dumps(result))
        self.assertNotIn("shared-test-key-only", json.dumps(self.service.get_status(self.managed)))
        self.assertFalse(self.service.get_status(self.other)["llm"]["has_api_key"])
        self.assertEqual(self.service.runtime_config(self.other).llm.api_key, "")

    def test_persists_encrypted_configuration_across_service_restart(self):
        self.service.save(self.student, "llm", self.payload)
        files = [path for path in self.vault.directory.rglob("*") if path.is_file()]
        self.assertEqual(len(files), 1)
        for path in files:
            self.assertNotIn(self.payload["api_key"].encode(), path.read_bytes())
            self.assertNotIn(self.payload["model"].encode(), path.read_bytes())
        restarted = PersonalAIConfigService(self.repository, vault=PersonalAPIVault(self.repository.database_path, cipher=self.cipher), configured_settings=self.shared)
        self.assertEqual(restarted.runtime_config(self.student).llm.api_key, self.payload["api_key"])

    def test_blank_key_only_preserves_key_for_same_provider_and_address(self):
        self.service.save(self.student, "llm", self.payload)
        self.service.save(self.student, "llm", {**self.payload, "model": "changed-model", "api_key": ""})
        self.assertEqual(self.service.runtime_config(self.student).llm.api_key, self.payload["api_key"])
        with self.assertRaises(AIRuntimeError):
            self.service.save(self.student, "llm", {**self.payload, "provider": "DeepSeek", "api_base_url": "https://api.deepseek.com/v1", "api_key": None})
        self.assertEqual(self.service.runtime_config(self.student).llm.provider, "OpenAI")

    def test_only_exact_official_endpoints_are_allowed(self):
        for url in ["http://api.openai.com/v1", "https://127.0.0.1/v1", "https://api.openai.com.evil.test/v1", "https://api.openai.com/v1?next=https://evil.test", "https://api.openai.com/v1/../evil", "https://api.openai.com/v1/", "https://api.deepseek.com/v1", "https://user:pass@api.openai.com/v1"]:
            with self.subTest(url=url), self.assertRaises(AIRuntimeError):
                self.service.save(self.student, "llm", {**self.payload, "api_base_url": url})
        with self.assertRaises(AIRuntimeError):
            self.service.save(self.student, "llm", {**self.payload, "provider": "自定义兼容接口"})

    def test_ocr_is_isolated_and_normalized_for_runtime(self):
        self.service.save(self.student, "llm", self.payload)
        self.service.save(self.student, "ocr", {**self.payload, "model": "vision-model", "api_key": "vision-test-key-only"})
        runtime = self.service.runtime_config(self.student)
        self.assertEqual(runtime.ocr.provider, "openai_compatible_vision")
        self.assertEqual(self.service.get_status(self.student)["ocr"]["provider"], "OpenAI")
        self.service.clear(self.student, "llm")
        runtime = self.service.runtime_config(self.student)
        self.assertFalse(runtime.llm.enabled)
        self.assertEqual(runtime.llm.api_key, "")
        self.assertTrue(runtime.ocr.configured)

    def test_invalid_identity_or_capability_is_denied(self):
        for identity in [{"id": "../1"}, {"id": True}, {"id": -1}, {"id": 999999}, {"id": 2 ** 100}]:
            with self.subTest(identity=identity), self.assertRaises(AIRuntimeError):
                self.service.get_status(identity)
        for capability in ["../llm", "other", "__dict__"]:
            with self.subTest(capability=capability), self.assertRaises(AIRuntimeError):
                self.service.save(self.student, capability, self.payload)
        with self.assertRaises(AIRuntimeError):
            self.service.save(self.teacher, "llm", self.payload)

    def test_ciphertext_is_bound_to_user_and_database_scope(self):
        self.service.save(self.student, "llm", self.payload)
        source = next(self.vault.directory.glob("*.dpapi"))
        self.vault._path(self.other["id"]).write_bytes(source.read_bytes())
        with self.assertRaises(AIRuntimeError):
            self.service.get_status(self.other)
        another = PersonalAPIVault(Path(self.temp.name) / "another.sqlite3", cipher=self.cipher)
        another.directory.mkdir()
        another._path(self.student["id"]).write_bytes(source.read_bytes())
        with self.assertRaises(AIRuntimeError):
            another.load(self.student["id"])

    def test_atomic_failure_keeps_previous_configuration_and_no_plaintext_temp(self):
        self.service.save(self.student, "llm", self.payload)
        with patch("app.services.personal_api_vault.os.replace", side_effect=OSError("private failure")):
            with self.assertRaises(AIRuntimeError):
                self.service.save(self.student, "llm", {**self.payload, "api_key": "changed-test-key"})
        self.assertEqual(self.service.runtime_config(self.student).llm.api_key, self.payload["api_key"])
        self.assertEqual(len(list(self.vault.directory.iterdir())), 1)

    def test_unavailable_cipher_fails_closed_without_plaintext_write(self):
        self.cipher.available = False
        self.assertEqual(self.service.get_status(self.student)["storage"], "unavailable")
        with self.assertRaises(AIRuntimeError):
            self.service.save(self.student, "llm", self.payload)
        self.assertFalse(self.vault.directory.exists())

    def test_schema_rejects_extra_fields_and_header_injection(self):
        for payload in [{**self.payload, "owner_id": self.other["id"]}, {**self.payload, "api_key": "test\r\nsecret"}, {**self.payload, "enabled": "true"}]:
            with self.subTest(payload_keys=list(payload)), self.assertRaises(ValidationError):
                PersonalAIConfigUpdate.model_validate(payload)

    def test_windows_dpapi_round_trip_and_wrong_entropy_rejected(self):
        cipher = WindowsDPAPICipher()
        if not cipher.available:
            with self.assertRaises(AIRuntimeError):
                cipher.encrypt(b"test-only-secret", b"scope-1")
            return
        ciphertext = cipher.encrypt(b"test-only-secret", b"scope-1")
        self.assertNotIn(b"test-only-secret", ciphertext)
        self.assertEqual(cipher.decrypt(ciphertext, b"scope-1"), b"test-only-secret")
        with self.assertRaises(AIRuntimeError):
            cipher.decrypt(ciphertext, b"scope-2")

    def test_personal_runtime_has_self_configuration_guidance(self):
        runtime = self.service.runtime_config(self.student)
        for config in (runtime.llm, runtime.ocr):
            with self.assertRaises(AIRuntimeError) as context:
                config.require_configured(manual_guidance="联系老师")
            self.assertIn("AI 设置", str(context.exception))
            self.assertNotIn("联系老师", str(context.exception))

    def test_real_vault_restart_and_tampered_ciphertext_fail_closed(self):
        if not WindowsDPAPICipher().available:
            self.assertEqual(PersonalAPIVault(self.repository.database_path).storage, "unavailable")
            return
        service = PersonalAIConfigService(self.repository, configured_settings=self.shared)
        service.save(self.student, "llm", self.payload)
        restarted = PersonalAIConfigService(self.repository, configured_settings=self.shared)
        self.assertEqual(restarted.runtime_config(self.student).llm.api_key, self.payload["api_key"])
        path = restarted.vault._path(self.student["id"])
        self.assertNotIn(self.payload["api_key"].encode(), path.read_bytes())
        path.write_bytes(path.read_bytes()[:-10] + b"tampered!!")
        with self.assertRaises(AIRuntimeError) as context:
            restarted.runtime_config(self.student)
        self.assertNotIn(self.payload["api_key"], str(context.exception))

    def test_corrupt_vault_requires_admin_recovery_without_suggesting_simple_resave(self):
        self.service.save(self.student, "llm", self.payload)
        path = self.vault._path(self.student["id"])
        path.write_bytes(b"corrupted-test-ciphertext")
        for operation in [lambda: self.service.get_status(self.student), lambda: self.service.save(self.student, "llm", self.payload), lambda: self.service.clear(self.student, "llm")]:
            with self.assertRaises(AIRuntimeError) as context:
                operation()
            self.assertIn("联系管理员恢复或重置加密配置", str(context.exception))
            self.assertNotIn("重新配置", str(context.exception))
        self.assertEqual(path.read_bytes(), b"corrupted-test-ciphertext")


if __name__ == "__main__":
    unittest.main()
