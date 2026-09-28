from fastapi import APIRouter

from app.schemas.system import HealthCheck

router = APIRouter()


@router.get("/health", response_model=HealthCheck)
def health_check() -> HealthCheck:
    return HealthCheck(status="ok", service="backend")

