from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.config import settings
from app.repositories.learning_repository import PostgresLearningRepository
from app.schemas.learning import (
    CompleteTaskRequest,
    CompleteTaskResponse,
    GrowthRecordListResponse,
    StartTaskResponse,
    StudyRecordListResponse,
)
from app.services.learning_service import (
    LearningConflictError,
    LearningNotFoundError,
    LearningService,
)


router = APIRouter()


def get_learning_service() -> LearningService:
    """创建学习业务服务，保持路由层与数据库实现解耦。"""

    repository = PostgresLearningRepository(settings.database_url)
    return LearningService(repository)


LearningServiceDependency = Annotated[LearningService, Depends(get_learning_service)]
PageLimit = Annotated[int, Query(ge=1, le=100)]


@router.post(
    "/students/{student_id}/tasks/{task_id}/start",
    response_model=StartTaskResponse,
    status_code=status.HTTP_200_OK,
)
def start_task(
    student_id: UUID,
    task_id: UUID,
    service: LearningServiceDependency,
) -> StartTaskResponse:
    try:
        study_record = service.start_task(str(student_id), str(task_id))
        return StartTaskResponse(study_record=study_record)
    except LearningNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except LearningConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.post(
    "/students/{student_id}/tasks/{task_id}/complete",
    response_model=CompleteTaskResponse,
    status_code=status.HTTP_200_OK,
)
def complete_task(
    student_id: UUID,
    task_id: UUID,
    payload: CompleteTaskRequest,
    service: LearningServiceDependency,
) -> CompleteTaskResponse:
    try:
        result = service.complete_task(
            student_id=str(student_id),
            task_id=str(task_id),
            **payload.model_dump(),
        )
        return CompleteTaskResponse(**result)
    except LearningNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except LearningConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error


@router.get(
    "/students/{student_id}/study-records",
    response_model=StudyRecordListResponse,
)
def list_study_records(
    student_id: UUID,
    service: LearningServiceDependency,
    limit: PageLimit = 30,
) -> StudyRecordListResponse:
    return StudyRecordListResponse(records=service.get_study_records(str(student_id), limit))


@router.get(
    "/students/{student_id}/growth-records",
    response_model=GrowthRecordListResponse,
)
def list_growth_records(
    student_id: UUID,
    service: LearningServiceDependency,
    limit: PageLimit = 30,
) -> GrowthRecordListResponse:
    return GrowthRecordListResponse(records=service.get_growth_records(str(student_id), limit))
