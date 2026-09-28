import logging

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.services.ai_runtime_config import AIRuntimeError
from app.teacher_knowledge.worker import application_lifespan
from app.services.student_workspace_service import (
    AIRequestRateLimitError,
    AuthenticationRateLimitError,
    CourseContextRequiredError,
    StudentWorkspaceError,
)

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    app = FastAPI(
        lifespan=application_lifespan,
        title=settings.app_name,
        version="0.1.0",
        description="AI初中学习教练系统第一阶段基础 API 服务"
    )
    if settings.requires_bootstrap_setup_code and not settings.bootstrap_setup_code:
        logger.warning(
            "APP_ENV=%s 但未设置 BOOTSTRAP_SETUP_CODE；首次教师账号创建将被安全拒绝。",
            settings.app_env,
        )
    elif not settings.requires_bootstrap_setup_code:
        logger.warning(
            "当前为 %s 模式，仅可绑定本机 127.0.0.1；局域网或公网部署前必须改为 "
            "APP_ENV=production 并设置 BOOTSTRAP_SETUP_CODE。",
            settings.app_env,
        )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:3002", "http://localhost:3002"],
        allow_credentials=False,
        allow_methods=["POST"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_, error: RequestValidationError) -> JSONResponse:
        """校验失败只返回字段位置和原因，不能把密码/API Key 原始输入回显。"""

        return JSONResponse(
            status_code=422,
            content={"detail": [
                {"loc": item["loc"], "msg": item["msg"], "type": item["type"]}
                for item in error.errors()
            ]},
        )

    @app.exception_handler(StudentWorkspaceError)
    async def handle_student_workspace_error(_, error: StudentWorkspaceError) -> JSONResponse:
        """将账号/工作台业务错误统一为前端可直接显示的 JSON。"""

        headers = None
        if isinstance(error, (AuthenticationRateLimitError, AIRequestRateLimitError)):
            headers = {"Retry-After": str(error.retry_after_seconds)}
        content = {"detail": str(error)}
        if isinstance(error, CourseContextRequiredError):
            # 让 BFF/UI 明确进入选课流程，而不是把 409 误当作普通任务冲突后回退默认内容。
            content["course_context_required"] = True
        return JSONResponse(
            status_code=error.status_code,
            content=content,
            headers=headers,
        )

    @app.exception_handler(AIRuntimeError)
    async def handle_ai_runtime_error(_, error: AIRuntimeError) -> JSONResponse:
        """AI/OCR 异常统一返回可行动提示，不暴露服务端密钥或原始错误。"""

        return JSONResponse(
            status_code=error.status_code,
            content={"detail": str(error)},
        )

    app.include_router(api_router, prefix=settings.api_v1_prefix)
    return app


app = create_app()
