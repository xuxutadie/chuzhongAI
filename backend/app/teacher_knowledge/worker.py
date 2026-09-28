"""后台队列执行器：定期续租，取消后不再写入生成结果。"""
import asyncio
import logging
import threading
from contextlib import asynccontextmanager
from app.core.config import settings
from app.services.learning_job_worker import learning_lifespan
from .repository import KnowledgeRepository, KnowledgeError
from .jobs import KnowledgeJobs
from .teacher_ai import TeacherKnowledgeAI
from .generation import GenerationService

logger = logging.getLogger(__name__)


class IdentityReader:
    def __init__(self, repo):
        self.repo = repo
        self.database_path = repo.path

    def get_user_by_id(self, identifier):
        with self.repo.read() as db:
            row = db.execute('SELECT * FROM users WHERE id=?', (identifier,)).fetchone()
            return dict(row) if row else None


class KnowledgeWorker:
    def __init__(self, repo):
        self.repo = repo
        self.jobs = KnowledgeJobs(repo)

    def run_one(self, worker_id='knowledge'):
        job = self.jobs.claim(worker_id)
        if not job:
            return False
        done = threading.Event()

        def heartbeat():
            while not done.wait(30):
                try:
                    self.jobs.renew(job['id'], job['lease_token'])
                except Exception:
                    return

        thread = threading.Thread(target=heartbeat, daemon=True)
        thread.start()
        try:
            # 重新读取持久化任务权限，不把普通请求的会话令牌保存到队列。
            bound = KnowledgeRepository(self.repo.path, job=job) if job.get('space_id') else self.repo
            service = GenerationService(bound, TeacherKnowledgeAI(IdentityReader(bound),knowledge_repository=bound))
            if job['kind'] == 'import':
                service.process_import(job)
            else:
                service.process_generation(job)
        except Exception as error:
            message = str(error) if isinstance(error, KnowledgeError) else '处理失败，请检查资料格式后重试；也可以手动整理。'
            try:
                self.jobs.fail_unit(job['id'], job['lease_token'], message)
            except KnowledgeError:
                pass  # 取消或过期任务不能用迟到的结果覆盖新状态。
        finally:
            done.set()
            thread.join(timeout=1)
        return True


@asynccontextmanager
async def application_lifespan(app):
    stop = asyncio.Event()

    async def run(number):
        repo = KnowledgeRepository(settings.student_workspace_database_file)
        while not stop.is_set():
            try:
                if repo.ready():
                    await asyncio.to_thread(KnowledgeWorker(repo).run_one, f'knowledge-{number}')
            except Exception:
                logger.warning('知识库后台任务暂时不可用，将自动重试。')
            try:
                await asyncio.wait_for(stop.wait(), timeout=2)
            except TimeoutError:
                pass

    async with learning_lifespan(app):
        tasks = [asyncio.create_task(run(i)) for i in range(2)]
        try:
            yield
        finally:
            stop.set()
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
