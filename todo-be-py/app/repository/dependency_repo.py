from datetime import datetime      # 用于软删除时间戳
from typing import List, Tuple     # 类型提示
from uuid import UUID              # UUID 类型

from sqlalchemy import select, text, update        # SQL 构建工具
from sqlalchemy.ext.asyncio import AsyncSession    # 异步会话

from app.models.todo_dependency import TodoDependency  # 依赖关系 ORM 模型


class DependencyRepository:
    """依赖关系数据访问层：封装所有对 todo_dependency 表的操作"""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session  # 注入数据库会话

    async def get_edges_by_dependent(self, dependent_id: UUID) -> List[TodoDependency]:
        """查询某任务依赖的所有前置任务边（即"这个任务的前置有哪些"）"""
        result = await self.session.execute(
            select(TodoDependency).where(
                TodoDependency.dependent_id == dependent_id,
                TodoDependency.deleted_at.is_(None),  # 排除已软删除的依赖关系
            )
        )
        return list(result.scalars().all())

    async def get_edges_by_prerequisite(self, prerequisite_id: UUID) -> List[TodoDependency]:
        """查询某任务作为前置任务的所有依赖边（即"哪些任务依赖这个任务"）"""
        result = await self.session.execute(
            select(TodoDependency).where(
                TodoDependency.prerequisite_id == prerequisite_id,
                TodoDependency.deleted_at.is_(None),
            )
        )
        return list(result.scalars().all())

    async def get_existing_edges(self, dependent_id: UUID, prerequisite_ids: List[UUID]) -> List[TodoDependency]:
        """查询指定 dependent 与一批 prerequisite 之间已存在的依赖边（用于去重，避免重复创建）"""
        if not prerequisite_ids:
            return []
        result = await self.session.execute(
            select(TodoDependency).where(
                TodoDependency.dependent_id == dependent_id,
                TodoDependency.prerequisite_id.in_(prerequisite_ids),
                TodoDependency.deleted_at.is_(None),
            )
        )
        return list(result.scalars().all())

    async def create_edges(self, dependent_id: UUID, prerequisite_ids: List[UUID]) -> int:
        """批量创建依赖边，返回实际创建的数量"""
        edges = [
            TodoDependency(prerequisite_id=pid, dependent_id=dependent_id)
            for pid in prerequisite_ids  # 为每个前置任务 ID 创建一条边记录
        ]
        self.session.add_all(edges)   # 批量加入会话
        await self.session.flush()    # 执行 INSERT
        return len(edges)

    async def soft_delete_edges(self, dependent_id: UUID, prerequisite_ids: List[UUID]) -> int:
        """软删除指定的依赖边（将 deleted_at 设为当前时间），返回受影响的行数"""
        if not prerequisite_ids:
            return 0
        result = await self.session.execute(
            update(TodoDependency)
            .where(
                TodoDependency.dependent_id == dependent_id,
                TodoDependency.prerequisite_id.in_(prerequisite_ids),
                TodoDependency.deleted_at.is_(None),  # 只更新尚未删除的边
            )
            .values(deleted_at=datetime.utcnow())
        )
        return result.rowcount  # 返回实际受影响的行数

    async def soft_delete_edges_by_todo(self, todo_id: UUID, now: datetime) -> None:
        """软删除与某个 Todo 相关的所有依赖边（无论它是前置还是依赖方），用于删除任务时级联清理"""
        await self.session.execute(
            update(TodoDependency)
            .where(
                TodoDependency.deleted_at.is_(None),
                # 同时匹配"该任务是前置"或"该任务是依赖方"两种情况
                (TodoDependency.prerequisite_id == todo_id) | (TodoDependency.dependent_id == todo_id),
            )
            .values(deleted_at=now)
        )

    async def find_cycle_prerequisite_ids(
        self, prerequisite_ids: List[UUID], dependent_id: UUID
    ) -> List[UUID]:
        """
        环检测：使用递归 CTE 找出 dependent_id 的所有下游节点。
        如果拟添加的某个 prerequisite 已经是 dependent_id 的下游，则会形成环。
        返回会导致环的 prerequisite ID 列表。
        """
        if not prerequisite_ids:
            return []

        prereq_strs = [str(pid) for pid in prerequisite_ids]

        sql = text("""
            WITH RECURSIVE downstream AS (
                -- 基础情况：找出 dependent_id 直接指向的下游节点
                SELECT td.dependent_id AS node_id
                FROM todo_dependency td
                WHERE td.prerequisite_id = :dependent_id
                  AND td.deleted_at IS NULL
                UNION ALL
                -- 递归：继续沿边向下游扩展
                SELECT td.dependent_id
                FROM todo_dependency td
                JOIN downstream d ON td.prerequisite_id = d.node_id
                WHERE td.deleted_at IS NULL
            )
            -- 找出拟添加的 prerequisite 中，哪些已经在下游集合里
            SELECT node_id::text FROM downstream
            WHERE node_id = ANY(:prerequisite_ids::uuid[])
        """)

        result = await self.session.execute(
            sql,
            {
                "dependent_id": str(dependent_id),
                "prerequisite_ids": prereq_strs,
            },
        )
        return [UUID(row[0]) for row in result.fetchall()]  # 返回会造成环的 UUID 列表

    async def get_subgraph_raw(self, todo_id: UUID) -> List[Tuple[str, str]]:
        """
        使用递归 CTE 获取某个 Todo 的完整依赖子图（上游 + 下游所有边）。
        返回值：边的列表，每条边为 (prerequisite_id字符串, dependent_id字符串) 元组。
        """
        sql = text("""
            WITH RECURSIVE upstream_edges AS (
                -- 向上游递归：找所有"前置任务"链
                SELECT prerequisite_id, dependent_id
                FROM todo_dependency
                WHERE dependent_id = :todo_id AND deleted_at IS NULL
                UNION ALL
                SELECT td.prerequisite_id, td.dependent_id
                FROM todo_dependency td
                JOIN upstream_edges ue ON td.dependent_id = ue.prerequisite_id
                WHERE td.deleted_at IS NULL
            ),
            downstream_edges AS (
                -- 向下游递归：找所有"后续依赖"链
                SELECT prerequisite_id, dependent_id
                FROM todo_dependency
                WHERE prerequisite_id = :todo_id AND deleted_at IS NULL
                UNION ALL
                SELECT td.prerequisite_id, td.dependent_id
                FROM todo_dependency td
                JOIN downstream_edges de ON td.prerequisite_id = de.dependent_id
                WHERE td.deleted_at IS NULL
            ),
            all_edges AS (
                -- 合并上下游的所有边（UNION 自动去重）
                SELECT * FROM upstream_edges
                UNION
                SELECT * FROM downstream_edges
            )
            SELECT DISTINCT
                prerequisite_id::text,
                dependent_id::text
            FROM all_edges
        """)

        result = await self.session.execute(sql, {"todo_id": str(todo_id)})
        return [(row[0], row[1]) for row in result.fetchall()]
