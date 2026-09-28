from fastapi import APIRouter

from app.api.routes import ai_learning, auth, health, student_workspace, transition_diagnosis, learning_route, teacher, teacher_knowledge, admin_workspace, education

api_router = APIRouter()
api_router.include_router(health.router, tags=["system"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(student_workspace.router, tags=["student-workspace"])
api_router.include_router(ai_learning.router, tags=["ai-learning"])
api_router.include_router(transition_diagnosis.router, tags=["transition-diagnosis"])
api_router.include_router(learning_route.router)
api_router.include_router(teacher.router, tags=['teacher'])
api_router.include_router(teacher_knowledge.router, tags=['teacher-knowledge'])
api_router.include_router(admin_workspace.router, tags=['admin-workspace'])
api_router.include_router(education.router, tags=['education'])
# 旧 PostgreSQL 学习路由和浏览器模型测试入口均不再挂载：
# 正式学生端只使用已鉴权的工作台接口；自主账号密钥加密隔离，班级账号使用统一配置。
