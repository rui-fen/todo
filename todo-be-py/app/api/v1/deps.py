from typing import Annotated  # 用于给类型加上附加元数据（如依赖注入标记）

from fastapi import Depends                          # FastAPI 的依赖注入装饰器
from sqlalchemy.ext.asyncio import AsyncSession      # 异步数据库会话类型

from app.db.session import get_session               # 数据库会话的生成器函数
from app.repository.dependency_repo import DependencyRepository
from app.repository.history_repo import HistoryRepository
from app.repository.todo_repo import TodoRepository
from app.services.todo_service import TodoService


async def get_todo_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    # FastAPI 会自动调用 get_session 获取数据库会话，并注入到这里
) -> TodoService:
    """依赖注入工厂：用同一个数据库会话创建所有 Repository，再组装成 TodoService"""
    return TodoService(
        todo_repo=TodoRepository(session),       # Todo 数据访问层
        dep_repo=DependencyRepository(session),  # 依赖关系数据访问层
        history_repo=HistoryRepository(session), # 历史记录数据访问层
    )


# 类型别名：在路由函数参数中使用这个类型，FastAPI 会自动注入 TodoService 实例
ServiceDep = Annotated[TodoService, Depends(get_todo_service)]
