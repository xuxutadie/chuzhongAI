from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.api.routes.student_workspace import AdminUser
from app.core.config import settings
from app.schemas.model_test import (
    AssistantTestRequest,
    AssistantTestResponse,
    ModelConnectionTestRequest,
    ModelConnectionTestResponse,
)
from app.schemas.math_question_generation import (
    MathQuestionGenerationRequest,
    MathQuestionGenerationResponse,
)
from app.services.math_question_generation_service import (
    MathQuestionGenerationError,
    MathQuestionGenerationService,
)
from app.services.model_connection_test_service import ModelConnectionTestError, ModelConnectionTestService
from app.services.model_test_session_store import ModelTestSessionStore


router = APIRouter(prefix="/admin")
model_test_sessions = ModelTestSessionStore()


def get_model_connection_test_service() -> ModelConnectionTestService:
    return ModelConnectionTestService()


ModelConnectionTestDependency = Annotated[
    ModelConnectionTestService,
    Depends(get_model_connection_test_service),
]


def get_math_question_generation_service() -> MathQuestionGenerationService:
    return MathQuestionGenerationService(ModelConnectionTestService())


MathQuestionGenerationDependency = Annotated[
    MathQuestionGenerationService,
    Depends(get_math_question_generation_service),
]


@router.post("/model-connection-test", response_model=ModelConnectionTestResponse)
def run_model_connection_test(
    payload: ModelConnectionTestRequest,
    service: ModelConnectionTestDependency,
    admin: AdminUser,
) -> ModelConnectionTestResponse:
    """开发环境下测试临时模型凭据，不保存也不记录密钥。"""

    del admin

    if settings.app_env != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测试入口未启用")

    try:
        result = service.test_connection(payload)
        return ModelConnectionTestResponse(
            **result,
            test_session_id=model_test_sessions.create(payload),
        )
    except ModelConnectionTestError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post("/assistant-test", response_model=AssistantTestResponse)
def ask_assistant_test(
    payload: AssistantTestRequest,
    service: ModelConnectionTestDependency,
    admin: AdminUser,
    test_session_id: Annotated[str | None, Header(alias="X-Model-Test-Session")] = None,
) -> AssistantTestResponse:
    """调用 30 分钟内有效的本地测试凭据，不写入数据库或日志。"""

    del admin

    if settings.app_env != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测试入口未启用")

    session = model_test_sessions.get(test_session_id or "")
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先在模型配置页完成连接测试")

    try:
        return AssistantTestResponse(**service.answer_assistant_question(session, payload.question))
    except ModelConnectionTestError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.post("/math-question-generation-test", response_model=MathQuestionGenerationResponse)
def generate_math_question_test(
    payload: MathQuestionGenerationRequest,
    service: MathQuestionGenerationDependency,
    admin: AdminUser,
    test_session_id: Annotated[str | None, Header(alias="X-Model-Test-Session")] = None,
) -> MathQuestionGenerationResponse:
    """使用管理员临时模型会话生成一题，并执行严格结构校验。"""

    del admin

    if settings.app_env != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="测试入口未启用")

    session = model_test_sessions.get(test_session_id or "")
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先在模型配置页完成连接测试")

    try:
        return service.generate(session, payload)
    except (MathQuestionGenerationError, ModelConnectionTestError) as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
