from contextlib import asynccontextmanager  # 用于定义异步上下文管理器（应用生命周期钩子）

from fastapi import FastAPI, Request             # FastAPI 应用类；Request 用于全局异常处理
from fastapi.middleware.cors import CORSMiddleware  # 跨域资源共享中间件
from fastapi.responses import JSONResponse       # 用于返回 JSON 格式的 HTTP 响应

from app.api.v1.router import router as v1_router  # v1 版本的路由器
from app.db.base import create_db_tables            # 启动时建表的函数


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理器：
    - yield 之前的代码在应用启动时执行（相当于 startup 事件）
    - yield 之后的代码在应用关闭时执行（相当于 shutdown 事件）
    """
    await create_db_tables()  # 启动时自动创建数据库表（表已存在则跳过）
    yield                     # 应用正常运行阶段


# 创建 FastAPI 应用实例
# title: API 文档中显示的标题
# lifespan: 绑定上面定义的生命周期管理器
app = FastAPI(title="todo-be-py", lifespan=lifespan)

# 注册 CORS 中间件，允许前端跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # 允许所有来源（生产环境应改为具体域名）
    allow_credentials=True,   # 允许携带 Cookie 等凭证
    allow_methods=["*"],      # 允许所有 HTTP 方法（GET、POST、PUT 等）
    allow_headers=["*"],      # 允许所有请求头
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """全局异常兜底处理器：捕获所有未处理的异常，统一返回 500 错误，避免暴露内部错误信息"""
    return JSONResponse(status_code=500, content={"message": "Internal server error"})


# 将 v1 路由器挂载到应用上，所有接口路径以 /todo 开头（由 router 内部定义的 prefix 决定）
app.include_router(v1_router)


@app.get("/health")
async def health():
    """健康检查接口：用于容器编排（如 Kubernetes）探测服务是否正常运行"""
    return {"status": "ok"}
