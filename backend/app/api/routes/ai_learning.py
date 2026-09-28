"""学生端 AI/OCR、错题上传与服务端变式题接口。"""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status

from app.api.routes.student_workspace import (
    AdminUser,
    CurrentWorkspaceUser,
    StudentUser,
    StudentWorkspaceServiceDependency,
)
from app.schemas.ai_learning import (
    AssistantRequest,
    AssistantResponse,
    CreateWrongQuestionRequest,
    IntegrationStatusResponse,
    OCRRecognitionRequest,
    OCRRecognitionResponse,
    StudentMathVariantQuestionResponse,
    UpdateWrongQuestionRequest,
    WrongQuestionAnalysisResponse,
    WrongQuestionListResponse,
    WrongQuestionResponse,
    WrongQuestionUploadResponse,
)
from app.schemas.math_question_generation import MathQuestionGenerationRequest
from app.schemas.personal_ai_config import PersonalAIConfigStatus, PersonalAIConfigUpdate
from app.schemas.student_workspace import DetailResponse
from app.services.ai_runtime_config import (
    AIResponseFormatError,
    AIRuntimeService,
)
from app.services.ocr_service import OCRService
from app.services.personal_ai_config_service import PersonalAIConfigService
from app.services.student_workspace_service import (
    MAX_WRONG_QUESTION_IMAGE_BYTES,
    PayloadTooLargeError,
    ResourceNotFoundError,
    StudentWorkspaceError,
)


router = APIRouter()


AI_RATE_LIMIT_OPENAPI_RESPONSE = {
    429: {
        "description": "当前学生对该 AI 功能请求过于频繁；请读取 Retry-After 响应头后再重试。",
    }
}


def get_personal_ai_config_service(
    workspace_service: StudentWorkspaceServiceDependency,
) -> PersonalAIConfigService:
    return PersonalAIConfigService(workspace_service.repository)


PersonalAIConfigServiceDependency = Annotated[
    PersonalAIConfigService, Depends(get_personal_ai_config_service)
]


def get_ai_runtime_service(
    current_user: CurrentWorkspaceUser,
    personal_service: PersonalAIConfigServiceDependency,
) -> AIRuntimeService:
    # 所有真实 AI 调用共用此边界，绝不根据浏览器参数选择老师或他人的密钥。
    return AIRuntimeService(runtime_config=personal_service.runtime_config(current_user))


def get_ocr_service(
    current_user: CurrentWorkspaceUser,
    personal_service: PersonalAIConfigServiceDependency,
) -> OCRService:
    return OCRService(runtime_config=personal_service.runtime_config(current_user))


AIRuntimeServiceDependency = Annotated[AIRuntimeService, Depends(get_ai_runtime_service)]
OCRServiceDependency = Annotated[OCRService, Depends(get_ocr_service)]


@router.get("/me/ai-config", response_model=PersonalAIConfigStatus)
def get_personal_ai_config(
    student: StudentUser,
    personal_service: PersonalAIConfigServiceDependency,
) -> PersonalAIConfigStatus:
    return PersonalAIConfigStatus(**personal_service.get_status(student))


@router.put("/me/ai-config/{capability}", response_model=PersonalAIConfigStatus)
def save_personal_ai_config(
    capability: Literal["llm", "ocr"],
    payload: PersonalAIConfigUpdate,
    student: StudentUser,
    personal_service: PersonalAIConfigServiceDependency,
) -> PersonalAIConfigStatus:
    return PersonalAIConfigStatus(**personal_service.save(student, capability, payload.model_dump()))


@router.delete("/me/ai-config/{capability}", response_model=PersonalAIConfigStatus)
def clear_personal_ai_config(
    capability: Literal["llm", "ocr"],
    student: StudentUser,
    personal_service: PersonalAIConfigServiceDependency,
) -> PersonalAIConfigStatus:
    return PersonalAIConfigStatus(**personal_service.clear(student, capability))


async def read_limited_upload_body(request: Request) -> bytes:
    """流式读取图片，未知 Content-Length 时也不会先把超大请求放进内存。"""

    total_size = 0
    chunks: list[bytes] = []
    async for chunk in request.stream():
        total_size += len(chunk)
        if total_size > MAX_WRONG_QUESTION_IMAGE_BYTES:
            raise PayloadTooLargeError("单张错题图片不能超过 5MB，请压缩后重试")
        if chunk:
            chunks.append(chunk)
    return b"".join(chunks)


@router.get("/me/integrations", response_model=IntegrationStatusResponse)
def get_current_user_integration_status(
    current_user: CurrentWorkspaceUser,
    runtime_service: AIRuntimeServiceDependency,
) -> IntegrationStatusResponse:
    """所有已登录用户只可看到非敏感能力状态，不能读取 API Key。"""

    del current_user
    return IntegrationStatusResponse(**runtime_service.integration_status())


@router.get("/teacher/ai-config/status", response_model=IntegrationStatusResponse)
def get_teacher_integration_status(
    teacher: AdminUser,
    runtime_service: AIRuntimeServiceDependency,
) -> IntegrationStatusResponse:
    """教师配置页使用的非敏感状态接口。"""

    del teacher
    return IntegrationStatusResponse(**runtime_service.integration_status())


@router.post(
    "/wrong-questions/uploads",
    response_model=WrongQuestionUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_wrong_question_image(
    request: Request,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> WrongQuestionUploadResponse:
    """接收原始二进制图片；不使用 multipart，避免引入额外依赖。"""

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_WRONG_QUESTION_IMAGE_BYTES:
                raise PayloadTooLargeError("单张错题图片不能超过 5MB，请压缩后重试")
        except ValueError as error:
            raise StudentWorkspaceError("图片大小信息无效，请重新选择图片") from error
    image_data = await read_limited_upload_body(request)
    upload = workspace_service.upload_wrong_question_image(
        user=student,
        media_type=request.headers.get("content-type", ""),
        image_data=image_data,
    )
    return WrongQuestionUploadResponse(
        upload_id=upload["id"],
        media_type=upload["media_type"],
        size_bytes=upload["byte_size"],
        created_at=upload["created_at"],
    )


@router.get("/wrong-questions/uploads/{upload_id}/image")
def get_staged_wrong_question_image(
    upload_id: str,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> Response:
    """只为上传者返回待确认图片预览。"""

    image = workspace_service.get_wrong_question_upload(user=student, upload_id=upload_id)
    return Response(content=image["image_data"], media_type=image["media_type"])


@router.delete("/wrong-questions/uploads/{upload_id}", response_model=DetailResponse)
def delete_staged_wrong_question_image(
    upload_id: str,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> DetailResponse:
    workspace_service.delete_staged_wrong_question_upload(user=student, upload_id=upload_id)
    return DetailResponse(detail="未确认的错题图片已删除")


@router.post(
    "/ocr/recognize",
    response_model=OCRRecognitionResponse,
    responses=AI_RATE_LIMIT_OPENAPI_RESPONSE,
)
def recognize_wrong_question_image(
    payload: OCRRecognitionRequest,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
    ocr_service: OCRServiceDependency,
) -> OCRRecognitionResponse:
    """输出待确认 OCR 候选内容，不自动创建错题记录。"""

    cached_result = workspace_service.get_cached_ocr_result(
        user=student,
        upload_id=payload.upload_id,
    )
    if cached_result is not None:
        return OCRRecognitionResponse(upload_id=payload.upload_id, **cached_result)
    workspace_service.require_ai_request_allowed(user=student, capability="ocr")
    image = workspace_service.get_wrong_question_upload(user=student, upload_id=payload.upload_id)
    result = ocr_service.recognize(
        image_bytes=image["image_data"],
        media_type=image["media_type"],
    )
    workspace_service.save_ocr_result(user=student, upload_id=payload.upload_id, result=result)
    return OCRRecognitionResponse(upload_id=payload.upload_id, **result)


@router.post(
    "/wrong-questions",
    response_model=WrongQuestionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_wrong_question(
    payload: CreateWrongQuestionRequest,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> WrongQuestionResponse:
    question = workspace_service.create_wrong_question(user=student, **payload.model_dump())
    return WrongQuestionResponse(question=question)


@router.get("/wrong-questions", response_model=WrongQuestionListResponse)
def list_wrong_questions(
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> WrongQuestionListResponse:
    return WrongQuestionListResponse(
        **workspace_service.get_wrong_question_page(
            user=student,
            limit=limit,
            offset=offset,
        )
    )


@router.get("/wrong-questions/{question_id}", response_model=WrongQuestionResponse)
def get_wrong_question(
    question_id: int,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> WrongQuestionResponse:
    return WrongQuestionResponse(
        question=workspace_service.get_wrong_question(user=student, question_id=question_id)
    )


@router.patch("/wrong-questions/{question_id}", response_model=WrongQuestionResponse)
def update_wrong_question(
    question_id: int,
    payload: UpdateWrongQuestionRequest,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> WrongQuestionResponse:
    updates = payload.model_dump(exclude_unset=True)
    return WrongQuestionResponse(
        question=workspace_service.update_wrong_question(
            user=student,
            question_id=question_id,
            updates=updates,
        )
    )


@router.delete("/wrong-questions/{question_id}", response_model=DetailResponse)
def delete_wrong_question(
    question_id: int,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> DetailResponse:
    workspace_service.delete_wrong_question(user=student, question_id=question_id)
    return DetailResponse(detail="错题已删除，关联图片也已移除")


@router.get("/wrong-questions/{question_id}/image")
def get_wrong_question_image(
    question_id: int,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
) -> Response:
    image = workspace_service.get_wrong_question_image(user=student, question_id=question_id)
    return Response(content=image["image_data"], media_type=image["media_type"])


@router.post(
    "/wrong-questions/{question_id}/analyze",
    response_model=WrongQuestionAnalysisResponse,
    responses=AI_RATE_LIMIT_OPENAPI_RESPONSE,
)
def analyze_wrong_question(
    question_id: int,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
    runtime_service: AIRuntimeServiceDependency,
) -> WrongQuestionAnalysisResponse:
    question, cached_analysis = workspace_service.get_cached_wrong_question_analysis(
        user=student,
        question_id=question_id,
    )
    if cached_analysis is not None:
        return WrongQuestionAnalysisResponse(question=question, analysis=cached_analysis)
    workspace_service.require_ai_request_allowed(
        user=student,
        capability="wrong_question_analysis",
    )
    analysis = runtime_service.analyze_wrong_question(
        subject=question["subject"],
        question_text=question["question_text"],
        knowledge_points=question["knowledge_points"],
    )
    updated_question = workspace_service.save_wrong_question_analysis(
        user=student,
        question_id=question_id,
        error_reason=analysis["error_reason"],
        knowledge_points=analysis["knowledge_points"],
        suggestion=analysis["suggestion"],
    )
    return WrongQuestionAnalysisResponse(question=updated_question, analysis=analysis)


@router.post(
    "/assistant",
    response_model=AssistantResponse,
    responses=AI_RATE_LIMIT_OPENAPI_RESPONSE,
)
def ask_student_assistant(
    payload: AssistantRequest,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
    runtime_service: AIRuntimeServiceDependency,
) -> AssistantResponse:
    workspace_service.require_ai_request_allowed(user=student, capability="assistant")
    return AssistantResponse(**runtime_service.answer_assistant_question(payload.question))


@router.post(
    "/me/math-variant-questions",
    response_model=StudentMathVariantQuestionResponse,
    responses=AI_RATE_LIMIT_OPENAPI_RESPONSE,
)
def create_math_variant_question(
    payload: MathQuestionGenerationRequest,
    student: StudentUser,
    workspace_service: StudentWorkspaceServiceDependency,
    runtime_service: AIRuntimeServiceDependency,
) -> StudentMathVariantQuestionResponse:
    """生成一题并立即把正确答案写入当前学生的服务端可信答案表。"""

    workspace_service.require_selected_math_knowledge_point(
        user=student,
        knowledge_point_id=payload.knowledge_point_id,
    )
    workspace_service.require_ai_request_allowed(user=student, capability="math_variant")
    generated = runtime_service.generate_math_variant(payload)
    question_payload: dict[str, Any] = generated.question.model_dump(mode="json")
    correct_answer = question_payload.pop("correct_answer")
    # 解析通常会直接给出结论；学生答题前不应看到它，避免绕过本次测验。
    question_payload.pop("explanation", None)
    question_id = str(question_payload["id"])
    if not question_id.startswith("ai-"):
        raise AIResponseFormatError("AI 变式题编号不符合安全规则，请改用已审核本地题目。")
    workspace_service.register_math_variant_answer(
        user=student,
        question_id=question_id,
        correct_answer=correct_answer,
        knowledge_point_id=payload.knowledge_point_id,
    )
    return StudentMathVariantQuestionResponse(
        question=question_payload,
        model_name=generated.model_name,
        latency_ms=generated.latency_ms,
    )
