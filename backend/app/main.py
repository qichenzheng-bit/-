import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.core.database import engine, Base
from app.api import (
    auth, users, questions, knowledge_points, papers,
    ocr, analysis, recycle, upload, mistake_book, daily_question, search
)

# 创建数据库表
Base.metadata.create_all(bind=engine)

app = FastAPI(title="MathPulse API", version="2.0.0")

# 全局强制不缓存中间件（解决开发时浏览器缓存问题）
class NoCacheMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # 对所有资源（HTML、JS、CSS 等）都禁止缓存
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheMiddleware)

# 静态文件挂载
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
async def root():
    index_path = os.path.join(static_dir, "index.html")
    login_path = os.path.join(static_dir, "login.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return FileResponse(login_path)

# 注册所有路由
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(questions.router)
app.include_router(knowledge_points.router)
app.include_router(papers.router)
app.include_router(ocr.router)
app.include_router(analysis.router)
app.include_router(recycle.router)
app.include_router(upload.router)
app.include_router(mistake_book.router)
app.include_router(daily_question.router)
app.include_router(search.router)