from typing import List   # 列表类型
from uuid import UUID     # UUID 类型

from sqlalchemy import select                   # 构建 SELECT 查询
from sqlalchemy.ext.asyncio import AsyncSession # 异步数据库会话

from app.enums import TodoHistoryChangeBy, TodoStatus  # 变更来源和状态枚举
from app.models.todo_history import TodoHistory        # 历史记录 ORM 模型


class HistoryRepository:
    """状态变更历史数据访问层：封装对 todo_history 表的操作"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session  # 注入数据库会话

    async def create(
        self,
        todo_id: UUID,
        from_status: TodoStatus,
        to_status: TodoStatus,
        changed_by: TodoHistoryChangeBy,
    ) -> TodoHistory:
        """写入一条状态变更历史记录"""
        history = TodoHistory(
            todo_id=todo_id,
            from_status=from_status,
            to_status=to_status,
            changed_by=changed_by,
        )
        self.session.add(history)     # 加入会话（待插入）
        await self.session.flush()    # 执行 INSERT，使记录持久化到当前事务
        return history

    async def get_by_todo_id(self, todo_id: UUID) -> List[TodoHistory]:
        """查询某个 Todo 的全部历史记录，按创建时间降序排列（最新的在最前）"""
        result = await self.session.execute(
            select(TodoHistory)
            .where(TodoHistory.todo_id == todo_id)
            .order_by(TodoHistory.created_at.desc())  # 最新变更排在第一条
        )
        return list(result.scalars().all())
