"""自主注册学生使用个人 API，教师创建的学生只使用学校统一配置。"""

from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.core.config import Settings, settings
from app.repositories.student_workspace_repository import StudentWorkspaceRepository
from app.schemas.personal_ai_config import PersonalAIConfigUpdate
from app.services.ai_runtime_config import AIRuntimeConfig, AIRuntimeError, ProviderRuntimeConfig
from app.services.model_connection_test_service import ModelConnectionTestService
from app.services.personal_api_vault import PersonalAPIVault


class PersonalAIConfigPermissionError(AIRuntimeError):
    status_code = 403


class PersonalAIConfigService:
    """每次依据仓储中的真实账号归属授权，忽略客户端声称的角色与模式。"""

    def __init__(self, repository: StudentWorkspaceRepository, *, vault: PersonalAPIVault | None = None, configured_settings: Settings | None = None) -> None:
        self.repository = repository
        self.vault = vault or PersonalAPIVault(repository.database_path)
        self.settings = configured_settings or settings

    def _identity(self, user: dict[str, Any]) -> tuple[dict[str, Any], str]:
        user_id = user.get("id")
        if type(user_id) is not int or not 0 < user_id <= 9_223_372_036_854_775_807:
            raise PersonalAIConfigPermissionError("账号不可用，请重新登录。")
        stored_user = self.repository.get_user_by_id(user_id)
        if stored_user is None:
            raise PersonalAIConfigPermissionError("账号不可用，请重新登录。")
        mode = "personal" if stored_user["role"] == "student" and stored_user["created_by"] is None else "managed"
        return stored_user, mode

    @staticmethod
    def _require_capability(capability: str) -> None:
        if capability not in {"llm", "ocr"}:
            raise AIRuntimeError("不支持的 AI 配置项目。")

    def _require_personal(self, user: dict[str, Any]) -> dict[str, Any]:
        stored_user, mode = self._identity(user)
        if mode != "personal":
            raise PersonalAIConfigPermissionError("此账号由教师统一提供 AI 服务，无需也不能设置个人 API。")
        return stored_user

    @staticmethod
    def _validate_payload(payload: dict[str, Any]) -> dict[str, Any]:
        try:
            validated = PersonalAIConfigUpdate.model_validate(payload).model_dump()
        except ValidationError:
            # Pydantic 原始错误可携带输入内容，不能向接口返回完整错误对象。
            raise AIRuntimeError("AI 配置格式不正确，请检查服务商、模型和密钥。") from None
        provider = validated["provider"]
        if provider not in ModelConnectionTestService.default_base_urls:
            raise AIRuntimeError("请选择当前支持的官方模型服务商。")
        if validated["api_base_url"] != ModelConnectionTestService.default_base_urls[provider]:
            raise AIRuntimeError("个人 API 仅支持所选服务商的官方 HTTPS 接口地址。")
        validated["model"] = validated["model"].strip()
        if not validated["model"]:
            raise AIRuntimeError("请输入模型名称或推理接入点。")
        validated["api_key"] = (validated["api_key"] or "").strip()
        return validated

    def get_status(self, user: dict[str, Any]) -> dict[str, Any]:
        stored_user, mode = self._identity(user)
        providers = [{"provider": provider, "api_base_url": url} for provider, url in ModelConnectionTestService.default_base_urls.items()]
        if mode == "managed":
            runtime = AIRuntimeConfig(self.settings)
            capabilities = {name: self._status(getattr(runtime, name)) for name in ("llm", "ocr")}
        else:
            saved = self.vault.load(stored_user["id"])
            capabilities = {name: self._status(self._personal_provider(saved.get(name), name), public_provider=(saved.get(name) or {}).get("provider"), expose_base_url=True) for name in ("llm", "ocr")}
        return {"mode": mode, "storage": self.vault.storage, **capabilities, "providers": providers}

    @staticmethod
    def _status(config: ProviderRuntimeConfig, *, public_provider: str | None = None, expose_base_url: bool = False) -> dict[str, Any]:
        # 统一配置可能含网关凭据或内部地址，只有个人已验证的官方 URL 可公开。
        return {"enabled": config.enabled, "configured": config.configured, "provider": public_provider or config.provider or None, "model": config.model or None, "api_base_url": (config.api_base_url or None) if expose_base_url else None, "has_api_key": bool(config.api_key)}

    def save(self, user: dict[str, Any], capability: str, payload: dict[str, Any]) -> dict[str, Any]:
        stored_user = self._require_personal(user)
        self._require_capability(capability)
        validated = self._validate_payload(payload)

        def update(saved: dict[str, Any]) -> dict[str, Any]:
            previous = saved.get(capability) or {}
            if not validated["api_key"]:
                if previous.get("provider") != validated["provider"] or previous.get("api_base_url") != validated["api_base_url"] or not previous.get("api_key"):
                    raise AIRuntimeError("首次保存或切换服务商时，请填写新的 API Key。")
                validated["api_key"] = previous["api_key"]
            saved[capability] = validated
            return saved

        self.vault.update(stored_user["id"], update)
        return self.get_status(user)

    def clear(self, user: dict[str, Any], capability: str) -> dict[str, Any]:
        stored_user = self._require_personal(user)
        self._require_capability(capability)

        def update(saved: dict[str, Any]) -> dict[str, Any]:
            saved.pop(capability, None)
            return saved

        self.vault.update(stored_user["id"], update)
        return self.get_status(user)

    def _personal_provider(self, saved: dict[str, Any] | None, capability: str) -> ProviderRuntimeConfig:
        # 从空值构造，不允许个人账号缺少配置时回落到学校/服务器密钥。
        values = self._validate_payload(saved) if saved else {"enabled": False, "provider": "", "api_base_url": "", "api_key": "", "model": ""}
        return ProviderRuntimeConfig(enabled=values["enabled"], provider=("openai_compatible_vision" if capability == "ocr" and values["provider"] else values["provider"]), api_base_url=values["api_base_url"], api_key=values["api_key"], model=values["model"], capability_name="AI 学习服务" if capability == "llm" else "OCR 识题服务", personal=True)

    def runtime_config(self, user: dict[str, Any]) -> AIRuntimeConfig:
        stored_user, mode = self._identity(user)
        runtime = AIRuntimeConfig(self.settings)
        if mode == "personal":
            saved = self.vault.load(stored_user["id"])
            runtime.llm = self._personal_provider(saved.get("llm"), "llm")
            runtime.ocr = self._personal_provider(saved.get("ocr"), "ocr")
        return runtime
