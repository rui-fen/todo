from datetime import datetime    # 用于软删除时间戳
from typing import Optional      # 可选类型
from uuid import UUID, uuid4     # UUID 主键

from sqlalchemy import Column, DateTime, Index, text
# Column / DateTime: 自定义列类型
# Index: 创建数据库索引
# text: 原始 SQL 表达式

from sqlmodel import Field, SQLModel  # SQLModel ORM 基类


class TodoDependency(SQLModel, table=True):
    """
    Todo 依赖关系表：记录"前置任务 prerequisite → 依赖任务 dependent"的有向边。
    例如：任务 B 依赖任务 A，则 prerequisite_id=A.id, dependent_id=B.id。
    """
    __tablename__ = "todo_dependency"  # 数据库表名

    __table_args__ = (
        # 局部唯一索引：同一对 (prerequisite_id, dependent_id) 在未软删除时只能存在一条记录
        # 软删除后可以重新添加相同的依赖关系
        Index(
            "uq_todo_dependency_active",
            "prerequisite_id",
            "dependent_id",
            unique=True,
            postgresql_where=text("deleted_at IS NULL"),
        ),
        # 按 dependent_id 查询（"某任务依赖哪些前置任务"）的索引
        Index("idx_todo_dependency_dependent", "dependent_id", postgresql_where=text("deleted_at IS NULL")),
        # 按 prerequisite_id 查询（"某任务是哪些任务的前置"）的索引
        Index("idx_todo_dependency_prerequisite", "prerequisite_id", postgresql_where=text("deleted_at IS NULL")),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    # 主键，自动生成的 UUID

    prerequisite_id: UUID = Field(foreign_key="todo.id")
    # 前置任务 ID，外键指向 todo 表；这个任务必须先完成

    dependent_id: UUID = Field(foreign_key="todo.id")
    # 依赖任务 ID，外键指向 todo 表；这个任务依赖上面的前置任务

    deleted_at: Optional[datetime] = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    # 软删除时间戳：不为 None 表示该依赖关系已被移除

    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        sa_column=Column(DateTime(timezone=True), default=datetime.utcnow, nullable=False),
    )
    # 依赖关系的创建时间
