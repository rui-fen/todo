from datetime import datetime   # 用于记录变更时间
from uuid import UUID, uuid4    # UUID 主键

from sqlalchemy import Column, DateTime, Index  # 列类型和索引
from sqlmodel import Field, SQLModel            # SQLModel ORM 基类

from app.enums import TodoHistoryChangeBy, TodoStatus  # 枚举：变更来源、任务状态


class TodoHistory(SQLModel, table=True):
    """
    Todo 状态变更历史表：每次状态发生变化时写入一条记录，用于审计和追踪。
    """
    __tablename__ = "todo_history"  # 数据库表名

    __table_args__ = (
        # 按 (todo_id, created_at) 建联合索引，加速按任务查询历史记录（并按时间排序）
        Index("idx_todo_history_todo_id_created_at", "todo_id", "created_at"),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    # 主键，自动生成的 UUID

    todo_id: UUID = Field(foreign_key="todo.id")
    # 关联的 Todo ID，外键指向 todo 表

    from_status: TodoStatus
    # 变更前的状态

    to_status: TodoStatus
    # 变更后的状态

    changed_by: TodoHistoryChangeBy
    # 变更来源：MANUAL（用户手动）或 RECURRENCE（重复任务自动重置）

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False),
    )
    # 变更发生的时间，自动记录为当前 UTC 时间
