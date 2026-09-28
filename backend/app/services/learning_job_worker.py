"""可停止的本地 AI 工作循环，执行权由数据库租约仲裁。"""
import asyncio
import logging
from contextlib import asynccontextmanager
from app.core.config import settings
from app.repositories.learning_route_repository import LearningRouteRepository
from app.services.wrong_question_jobs import WrongQuestionJobs

logger=logging.getLogger(__name__)


@asynccontextmanager
async def learning_lifespan(app):
    stop=asyncio.Event()
    async def run():
        repository=LearningRouteRepository(settings.student_workspace_database_file)
        while not stop.is_set():
            try:
                if repository.path.exists() and repository.ready():
                    await asyncio.to_thread(WrongQuestionJobs(repository).run_one)
            except Exception:
                logger.warning('错题 AI 工作暂时无法处理，将在下一轮恢复。')
            try:
                await asyncio.wait_for(stop.wait(),timeout=2)
            except TimeoutError:
                pass
    task=asyncio.create_task(run())
    try:
        yield
    finally:
        stop.set()
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
