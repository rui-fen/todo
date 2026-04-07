from datetime import datetime       # 用于时间戳字段
from typing import Optional         # 可选类型，表示字段可以为 None
from uuid import UUID, uuid4        # UUID 作为主键类型，uuid4() 生成随机 UUID

from sqlalchemy import Column, DateTime, Index, text
# Column: 自定义列属性
# DateTime: 带时区的日期时间类型
# Index: 创建数据库索引
# text: 原始 SQL 表达式（用于索引的条件过滤）

from sqlalchemy.dialects.postgresql import JSONB  # PostgreSQL 专用的 JSONB 列类型，支持索引查询
from sqlmodel import Field, SQLModel              # SQLModel 结合了 SQLAlchemy 和 Pydantic

from app.enums import TodoPriority, TodoStatus    # 导入状态和优先级枚举


class Todo(SQLModel, table=True):
    """Todo 数据库模型，table=True 表示这个类对应数据库中的一张真实表"""
    __tablename__ = "todo"  # 数据库表名

    __table_args__ = (
        # 局部索引（Partial Index）：只对未删除的记录建索引，减少索引体积、提升查询性能
        Index("idx_todo_due_date", "due_date", postgresql_where=text("deleted_at IS NULL")),
        # 按截止日期查询的索引
        Index("idx_todo_status_due_date", "status", "due_date", postgresql_where=text("deleted_at IS NULL")),
        # 按状态 + 截止日期联合查询的索引
        Index("idx_todo_priority_due_date", "priority", "due_date", postgresql_where=text("deleted_at IS NULL")),
        # 按优先级 + 截止日期联合查询的索引
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    # 主键，UUID 类型，默认由 uuid4() 自动生成

    name: str
    # 任务名称，必填字段

    description: Optional[str] = None
    # 任务描述，可选

    due_date: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    # 截止日期，可选，使用带时区的 DateTime 类型存储

    status: TodoStatus = Field(default=TodoStatus.NOT_STARTED)
    # 任务状态，默认为"未开始"

    priority: TodoPriority = Field(default=TodoPriority.LOW)
    # 优先级，默认为"低"

    recurrence: Optional[dict] = Field(default=None, sa_column=Column(JSONB, nullable=True))
    # 重复规则，以 JSON 格式存储在 PostgreSQL 的 JSONB 列中，可选

    deleted_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    # 软删除时间戳：不为 None 表示该记录已被"删除"（实际上仍保留在数据库中）

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False),
    )
    # 创建时间，写入时自动设置为当前 UTC 时间

    updated_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False),
    )
    # 最后更新时间，写入时和每次 UPDATE 时自动刷新为当前 UTC 时间
