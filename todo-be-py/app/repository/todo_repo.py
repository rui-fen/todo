import calendar                         # 用于计算每月天数（月份加法时防止溢出）
from datetime import datetime           # 时间类型
from typing import List, Optional, Tuple  # 类型提示
from uuid import UUID                   # UUID 类型

from sqlalchemy import case, func, select, text, update
# case: SQL CASE WHEN 表达式
# func: SQL 聚合函数（如 COUNT）
# select: 构建 SELECT 查询
# text: 原始 SQL 片段
# update: 构建 UPDATE 语句

from sqlalchemy.ext.asyncio import AsyncSession  # 异步数据库会话

from app.enums import DependencyStatus, SortBy, SortOrder, TodoStatus
from app.models.todo import Todo                    # Todo ORM 模型
from app.models.todo_dependency import TodoDependency  # 依赖关系 ORM 模型


# 将 SortBy 枚举映射到 Todo 模型对应的列对象，供排序时使用
_SORT_FIELD_MAP = {
    SortBy.DUE_DATE: Todo.due_date,
    SortBy.PRIORITY: Todo.priority,
    SortBy.STATUS: Todo.status,
    SortBy.NAME: Todo.name,
}


class TodoRepository:
    """Todo 数据访问层：封装所有对 todo 表的数据库操作"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session  # 注入数据库会话

    async def get_by_id(self, id: UUID) -> Optional[Todo]:
        """按 ID 查找单条 Todo（排除已软删除的记录）"""
        result = await self.session.execute(
            select(Todo).where(Todo.id == id, Todo.deleted_at.is_(None))
        )
        return result.scalar_one_or_none()  # 返回一条或 None

    async def get_by_ids(self, ids: List[UUID]) -> List[Todo]:
        """按多个 ID 批量查找 Todo（排除已软删除的记录）"""
        if not ids:
            return []  # 空列表时直接返回，避免生成无效 SQL
        result = await self.session.execute(
            select(Todo).where(Todo.id.in_(ids), Todo.deleted_at.is_(None))
        )
        return list(result.scalars().all())

    async def create(self, data: dict) -> Todo:
        """创建一条新 Todo 并持久化到数据库"""
        todo = Todo(**data)          # 用字典参数构建 ORM 对象
        self.session.add(todo)       # 加入会话（标记为待插入）
        await self.session.flush()   # 执行 INSERT，获取数据库生成的字段值（如自增 ID）
        await self.session.refresh(todo)  # 重新从数据库加载最新数据（含默认值）
        return todo

    async def update(self, todo: Todo, data: dict) -> Todo:
        """更新一条 Todo 的字段"""
        for key, value in data.items():
            setattr(todo, key, value)         # 逐字段更新 ORM 对象的属性
        todo.updated_at = datetime.utcnow()   # 手动刷新 updated_at 时间戳
        self.session.add(todo)                # 标记为待更新
        await self.session.flush()            # 执行 UPDATE
        await self.session.refresh(todo)      # 重新加载最新数据
        return todo

    async def soft_delete(self, id: UUID, now: datetime) -> None:
        """软删除：将 deleted_at 设为当前时间，而非真正删除记录"""
        await self.session.execute(
            update(Todo)
            .where(Todo.id == id, Todo.deleted_at.is_(None))  # 只更新未删除的记录
            .values(deleted_at=now)
        )

    async def search(
        self,
        name: Optional[str],
        status: Optional[TodoStatus],
        priority,
        due_date_start: Optional[datetime],
        due_date_end: Optional[datetime],
        dependency_status: Optional[DependencyStatus],
        sort_by: SortBy,
        sort_order: SortOrder,
        page: int,
        limit: int,
    ) -> Tuple[List[Tuple[Todo, str]], int]:
        """
        带过滤、排序、分页的 Todo 搜索，同时返回每条记录的依赖阻塞状态。
        返回值：(当前页的行列表, 符合条件的总记录数)
        """
        # 相关子查询：计算当前 Todo 有多少个"阻塞"的前置任务
        # 阻塞条件：前置任务状态为 NOT_STARTED 或 IN_PROGRESS（即尚未完成）
        blocking_count = (
            select(func.count())
            .select_from(TodoDependency)
            .join(Todo.__table__.alias("prereq"), text("prereq.id = todo_dependency.prerequisite_id"))
            .where(
                TodoDependency.dependent_id == Todo.id,                       # 关联到当前 Todo
                TodoDependency.deleted_at.is_(None),                          # 排除已删除的依赖边
                text("prereq.deleted_at IS NULL"),                            # 排除已删除的前置任务
                text(f"prereq.status IN ('{TodoStatus.NOT_STARTED.value}', '{TodoStatus.IN_PROGRESS.value}')"),
            )
            .correlate(Todo)   # 声明此子查询与外层的 Todo 表相关联（相关子查询）
            .scalar_subquery() # 让子查询返回单个标量值
        )

        # 根据阻塞数量计算依赖状态：有阻塞 → BLOCKED，无阻塞 → UNBLOCKED
        dep_status_expr = case(
            (blocking_count > 0, DependencyStatus.BLOCKED.value),
            else_=DependencyStatus.UNBLOCKED.value,
        ).label("dependency_status")  # 给这个计算列起一个别名，方便后续读取

        # 构建过滤条件列表（始终排除软删除记录）
        conditions = [Todo.deleted_at.is_(None)]
        if status:
            conditions.append(Todo.status == status)          # 按状态过滤
        if priority:
            conditions.append(Todo.priority == priority)      # 按优先级过滤
        if name and name.strip():
            conditions.append(Todo.name.ilike(f"%{name.strip()}%"))  # 按名称模糊搜索（不区分大小写）
        if due_date_start:
            conditions.append(Todo.due_date >= due_date_start)  # 截止日期范围：开始
        if due_date_end:
            conditions.append(Todo.due_date <= due_date_end)    # 截止日期范围：结束
        if dependency_status == DependencyStatus.BLOCKED:
            conditions.append(blocking_count > 0)   # 只返回被阻塞的任务
        elif dependency_status == DependencyStatus.UNBLOCKED:
            conditions.append(blocking_count == 0)  # 只返回未被阻塞的任务

        # 先查总数（用于分页元数据）
        count_stmt = select(func.count()).select_from(Todo).where(*conditions)
        total = (await self.session.execute(count_stmt)).scalar_one()

        # 确定排序列和方向
        sort_col = _SORT_FIELD_MAP.get(sort_by, Todo.due_date)
        order_expr = sort_col.asc() if sort_order == SortOrder.ASC else sort_col.desc()
        skip = (page - 1) * limit  # 计算 OFFSET

        # 构建分页查询，同时查询 Todo 对象和依赖状态
        stmt = (
            select(Todo, dep_status_expr)
            .where(*conditions)
            .order_by(order_expr, Todo.id.desc())  # 主排序 + id 降序作为稳定排序的次级键
            .offset(skip)
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).all()  # 每行是 (Todo, dependency_status字符串) 的元组
        return list(rows), total
