from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "AI初中学习教练系统"
    app_env: str = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/ai_middle_school_coach"
    llm_provider: str = ""
    llm_api_base_url: str = ""
    llm_api_key: str = ""
    # 正式学生端仅从服务端环境读取 AI/OCR 配置，绝不向浏览器回传密钥。
    llm_enabled: bool = False
    llm_model: str = ""
    ocr_enabled: bool = False
    ocr_provider: str = ""
    ocr_api_base_url: str = ""
    ocr_api_key: str = ""
    ocr_model: str = ""
    # 独立于旧 PostgreSQL 学习记录的学生端 SQLite 数据库。
    student_workspace_database_path: str = str(
        Path(__file__).resolve().parents[2] / "data" / "ai_coach.db"
    )
    session_ttl_hours: int = 12
    app_session_secret: str = ""
    # 仅在生产环境的首次教师账号初始化时使用，绝不回传到浏览器。
    bootstrap_setup_code: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def student_workspace_database_file(self) -> Path:
        """相对数据库路径始终以 backend 目录为基准，避免启动目录改变数据位置。"""

        configured_path = Path(self.student_workspace_database_path)
        if configured_path.is_absolute():
            return configured_path
        return Path(__file__).resolve().parents[2] / configured_path

    @property
    def requires_bootstrap_setup_code(self) -> bool:
        """生产部署必须保护首次管理员创建；本机开发保持零配置启动。"""

        return self.app_env.strip().lower() not in {"development", "dev", "test", "testing"}


settings = Settings()
