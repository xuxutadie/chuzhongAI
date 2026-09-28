"""使用 Windows 当前运行账号的 DPAPI 加密保存个人 API 配置。

加密对象是完整配置，不仅是密钥。磁盘永远只接收密文，数据库和 API 响应中
均不存放密钥；更换 Windows 运行账号或搬移数据库后必须重新配置。
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import tempfile
import threading
from collections.abc import Callable
from pathlib import Path
from typing import Any, Protocol

from app.services.ai_runtime_config import AIRuntimeError


class PersonalAPIStorageError(AIRuntimeError):
    status_code = 503


class PersonalConfigCipher(Protocol):
    available: bool

    def encrypt(self, plaintext: bytes, entropy: bytes) -> bytes: ...

    def decrypt(self, ciphertext: bytes, entropy: bytes) -> bytes: ...


class WindowsDPAPICipher:
    """不启用 LOCAL_MACHINE，密文仅能由当前 Windows 运行账号解密。"""

    @property
    def available(self) -> bool:
        return os.name == "nt"

    def encrypt(self, plaintext: bytes, entropy: bytes) -> bytes:
        return self._transform(plaintext, entropy, decrypt=False)

    def decrypt(self, ciphertext: bytes, entropy: bytes) -> bytes:
        return self._transform(ciphertext, entropy, decrypt=True)

    def _transform(self, data: bytes, entropy: bytes, *, decrypt: bool) -> bytes:
        if not self.available:
            raise PersonalAPIStorageError("当前服务器不支持个人密钥安全存储，请联系管理员配置受支持的运行环境。")
        from ctypes import wintypes

        class DataBlob(ctypes.Structure):
            _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_ubyte))]

        data_buffer = ctypes.create_string_buffer(data)
        entropy_buffer = ctypes.create_string_buffer(entropy)
        source = DataBlob(len(data), ctypes.cast(data_buffer, ctypes.POINTER(ctypes.c_ubyte)))
        extra_entropy = DataBlob(len(entropy), ctypes.cast(entropy_buffer, ctypes.POINTER(ctypes.c_ubyte)))
        output = DataBlob()
        crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)
        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        transform = crypt32.CryptUnprotectData if decrypt else crypt32.CryptProtectData
        transform.argtypes = [ctypes.POINTER(DataBlob), ctypes.c_void_p, ctypes.POINTER(DataBlob), ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(DataBlob)]
        transform.restype = wintypes.BOOL
        kernel32.LocalFree.argtypes = [ctypes.c_void_p]
        kernel32.LocalFree.restype = ctypes.c_void_p
        try:
            # CRYPTPROTECT_UI_FORBIDDEN 禁止后台服务弹出系统密码交互框。
            succeeded = transform(ctypes.byref(source), None, ctypes.byref(extra_entropy), None, None, 0x1, ctypes.byref(output))
            if not succeeded:
                if decrypt:
                    raise PersonalAPIStorageError("个人 API 配置加密状态异常，请联系管理员恢复或重置加密配置。")
                raise PersonalAPIStorageError("个人 API 配置未能安全加密保存，请稍后重试或联系管理员。")
            return ctypes.string_at(output.pbData, output.cbData)
        finally:
            # 尽早清理 ctypes 临时内存；Python 字符串本身仍遵循解释器生命周期。
            ctypes.memset(data_buffer, 0, ctypes.sizeof(data_buffer))
            if output.pbData:
                ctypes.memset(output.pbData, 0, output.cbData)
                kernel32.LocalFree(ctypes.cast(output.pbData, ctypes.c_void_p))


_VAULT_WRITE_LOCK = threading.RLock()


class PersonalAPIVault:
    """路径仅由可信数据库路径和正整数账号 ID 派生，拒绝符号链接目录。"""

    max_ciphertext_bytes = 65_536

    def __init__(self, database_path: str | Path, *, cipher: PersonalConfigCipher | None = None) -> None:
        self.database_path = Path(database_path).resolve()
        self.directory = self.database_path.parent / f".{self.database_path.name}.personal-api"
        self.cipher = cipher or WindowsDPAPICipher()

    @property
    def storage(self) -> str:
        return "windows_dpapi" if self.cipher.available else "unavailable"

    def _path(self, user_id: int) -> Path:
        if type(user_id) is not int or not 0 < user_id <= 9_223_372_036_854_775_807:
            raise PersonalAPIStorageError("个人配置的账号标识无效，请重新登录。")
        return self.directory / f"user-{user_id}.dpapi"

    def _entropy(self, user_id: int) -> bytes:
        scope = f"student-personal-api-v1\0{os.path.normcase(str(self.database_path))}\0{user_id}"
        return hashlib.sha256(scope.encode("utf-8")).digest()

    def _check_path(self, path: Path) -> None:
        for candidate in (self.directory, path):
            if candidate.is_symlink() or (hasattr(candidate, "is_junction") and candidate.is_junction()):
                raise PersonalAPIStorageError("个人配置存储路径不可用，请联系管理员。")

    def load(self, user_id: int) -> dict[str, Any]:
        path = self._path(user_id)
        with _VAULT_WRITE_LOCK:
            try:
                self._check_path(path)
                if not path.exists():
                    return {}
                if not self.cipher.available:
                    raise PersonalAPIStorageError("当前服务器不能安全读取个人 API 配置，请联系管理员。")
                if path.stat().st_size > self.max_ciphertext_bytes:
                    raise ValueError("oversize vault")
                plaintext = self.cipher.decrypt(path.read_bytes(), self._entropy(user_id))
                payload = json.loads(plaintext.decode("utf-8"))
                if not isinstance(payload, dict) or set(payload) != {"version", "capabilities"} or payload["version"] != 1:
                    raise ValueError("unsupported vault")
                capabilities = payload["capabilities"]
                if not isinstance(capabilities, dict) or not set(capabilities).issubset({"llm", "ocr"}):
                    raise ValueError("invalid capabilities")
                return capabilities
            except PersonalAPIStorageError:
                raise
            except (OSError, ValueError, UnicodeError, KeyError, TypeError) as error:
                raise PersonalAPIStorageError("个人 API 配置加密状态异常，请联系管理员恢复或重置加密配置。") from error

    def update(self, user_id: int, updater: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
        """同进程内串行读改写，防止同时保存 AI 和 OCR 时覆盖另一项。"""

        path = self._path(user_id)
        if not self.cipher.available:
            raise PersonalAPIStorageError("当前服务器不支持个人密钥安全存储，请联系管理员。")
        with _VAULT_WRITE_LOCK:
            capabilities = updater(self.load(user_id))
            temporary_path: Path | None = None
            try:
                self._check_path(path)
                payload = json.dumps({"version": 1, "capabilities": capabilities}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
                # 必须先完成加密，不能把明文交给临时文件或文件日志。
                ciphertext = self.cipher.encrypt(payload, self._entropy(user_id))
                self.directory.mkdir(mode=0o700, parents=False, exist_ok=True)
                self._check_path(path)
                descriptor, filename = tempfile.mkstemp(prefix=".pending-", suffix=".dpapi", dir=self.directory)
                temporary_path = Path(filename)
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(ciphertext)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temporary_path, path)
            except PersonalAPIStorageError:
                raise
            except (OSError, ValueError, TypeError) as error:
                raise PersonalAPIStorageError("个人 API 配置未能安全保存，请稍后重试；原有配置不变。") from error
            finally:
                if temporary_path is not None and temporary_path.exists():
                    temporary_path.unlink()
