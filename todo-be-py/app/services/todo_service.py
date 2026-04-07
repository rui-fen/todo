import calendar                      # 用于月份加法时查询当月最大天数，防止日期溢出
from datetime import datetime        # 时间类型
from typing import List, Optional    # 类型提示
from uuid import UUID                # UUID 类型

from fastapi import HTTPException    # 用于抛出 HTTP 错误响应

from app.enums import (
    DependencyStatus,
    Recurrence,
    RecurrenceUnit,
    SortBy,
    SortOrder,
    TodoHistoryChangeBy,
    TodoStatus,
)
from app.models.todo import Todo
from app.repository.dependency_repo import DependencyRepository
from app.repository.history_repo import HistoryRepository
from app.repository.todo_repo import TodoRepository
from app.schemas.dependency import AddDependenciesRequest, DependencyMutationResult
from app.schemas.history import TodoHistoryResponse
from app.schemas.search import TodoSearchResponse
from app.schemas.subgraph import SubgraphEdge, TodoSubgraph
from app.schemas.todo import RecurrenceSchema, TodoCreate, TodoResponse, TodoUpdate


def _add_months(dt: datetime, months: int) -> datetime:
    """将日期往后推 months 个月，自动处理月末日期溢出（如 1月31日 + 1个月 = 2月28日）"""
    month = dt.month - 1 + months          # 转为 0-indexed 计算
    year = dt.year + month // 12           # 计算进位的年份
    month = month % 12 + 1                 # 换回 1-indexed 月份
    day = min(dt.day, calendar.monthrange(year, month)[1])  # 取当月最大天数与原日期的较小值
    return dt.replace(year=year, month=month, day=day)


def _get_next_due_date(base_date: datetime, recurrence: dict) -> datetime:
    """根据重复规则计算下一次截止日期"""
    from datetime import timedelta

    rec_type = recurrence.get("type")
    if rec_type == Recurrence.DAILY:
        return base_date + timedelta(days=1)       # 每天重复：+1天
    if rec_type == Recurrence.WEEKLY:
        return base_date + timedelta(weeks=1)      # 每周重复：+7天
    if rec_type == Recurrence.MONTHLY:
        return _add_months(base_date, 1)           # 每月重复：+1个月
    if rec_type == Recurrence.CUSTOM:
        interval = int(recurrence.get("interval", 1))  # 自定义间隔数值
        unit = recurrence.get("unit")
        if unit == RecurrenceUnit.WEEK:
            return base_date + timedelta(weeks=interval)   # 自定义：按周
        if unit == RecurrenceUnit.MONTH:
            return _add_months(base_date, interval)        # 自定义：按月
        return base_date + timedelta(days=interval)        # 自定义：按天（默认）
    return base_date  # 未知类型时不改变日期


def _normalize_recurrence(recurrence: RecurrenceSchema) -> dict:
    """
    将 RecurrenceSchema 对象序列化为存入数据库的 dict 格式。
    非 CUSTOM 类型只保存 type；CUSTOM 类型还需要校验并保存 interval 和 unit。
    """
    if recurrence.type != Recurrence.CUSTOM:
        return {"type": recurrence.type.value}  # 简单类型只存 type 字段
    if not recurrence.interval or not recurrence.unit:
        raise HTTPException(
            status_code=400,
            detail="Custom recurrence requires both interval and unit",
        )
    return {
        "type": recurrence.type.value,
        "interval": recurrence.interval,
        "unit": recurrence.unit.value,
    }


class TodoService:
    """业务逻辑层：协调 Repository 层完成复杂的业务操作"""

    def __init__(
        self,
        todo_repo: TodoRepository,
        dep_repo: DependencyRepository,
        history_repo: HistoryRepository,
    ) -> None:
        self.todo_repo = todo_repo       # 注入 Todo 数据访问层
        self.dep_repo = dep_repo         # 注入依赖关系数据访问层
        self.history_repo = history_repo # 注入历史记录数据访问层

    # ------------------------------------------------------------------ #
    # CRUD
    # ------------------------------------------------------------------ #

    async def create(self, data: TodoCreate) -> TodoResponse:
        """创建新 Todo：校验重复规则，序列化后写入数据库"""
        self._assert_due_date_for_recurrence(data.due_date, data.recurrence)
        # 将 Schema 转为 dict，exclude_none 跳过未填写的字段
        payload = data.model_dump(exclude_none=True, by_alias=False)
        if data.recurrence:
            payload["recurrence"] = _normalize_recurrence(data.recurrence)  # 序列化重复规则
        todo = await self.todo_repo.create(payload)
        return TodoResponse.model_validate(todo)  # 将 ORM 对象转为响应 Schema

    async def find_one(self, id: UUID) -> TodoResponse:
        """按 ID 查找单条 Todo，不存在时抛出 404"""
        todo = await self._get_or_404(id)
        return TodoResponse.model_validate(todo)

    async def update(self, id: UUID, data: TodoUpdate) -> TodoResponse:
        """更新 Todo：处理状态校验、依赖检查、历史记录写入和重复任务重置"""
        todo = await self._get_or_404(id)

        # 只对本次请求中实际发送的字段做合并校验（未发送的字段保留数据库原值）
        fields_set = data.model_fields_set
        next_status = data.status if "status" in fields_set else todo.status
        next_due_date = data.due_date if "due_date" in fields_set else todo.due_date
        next_recurrence = data.recurrence if "recurrence" in fields_set else (
            RecurrenceSchema(**todo.recurrence) if todo.recurrence else None
        )

        self._assert_due_date_for_recurrence(next_due_date, next_recurrence)

        # 如果状态从非 IN_PROGRESS 变为 IN_PROGRESS，检查所有前置任务是否已完成
        if todo.status != TodoStatus.IN_PROGRESS and next_status == TodoStatus.IN_PROGRESS:
            await self._ensure_dependencies_ready(id)

        update_payload = self._build_update_payload(data)
        old_status = todo.status                                    # 记录变更前的状态
        updated = await self.todo_repo.update(todo, update_payload) # 执行数据库更新

        if old_status != updated.status:
            # 状态发生了变化，写入历史记录
            await self.history_repo.create(
                todo_id=id,
                from_status=old_status,
                to_status=updated.status,
                changed_by=TodoHistoryChangeBy.MANUAL,
            )

        await self._handle_recurring_todo(id, old_status, updated)  # 处理重复任务自动重置
        return TodoResponse.model_validate(updated)

    async def remove(self, id: UUID) -> TodoResponse:
        """软删除 Todo：同时软删除其关联的所有依赖边"""
        todo = await self._get_or_404(id)
        now = datetime.utcnow()
        await self.todo_repo.soft_delete(id, now)              # 软删除 Todo 本身
        await self.dep_repo.soft_delete_edges_by_todo(id, now) # 软删除所有相关依赖边
        return TodoResponse.model_validate(todo)               # 返回删除前的数据快照

    # ------------------------------------------------------------------ #
    # Search
    # ------------------------------------------------------------------ #

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
    ) -> TodoSearchResponse:
        """带条件过滤、排序和分页的搜索，附加每条记录的依赖阻塞状态"""
        rows, total = await self.todo_repo.search(
            name=name,
            status=status,
            priority=priority,
            due_date_start=due_date_start,
            due_date_end=due_date_end,
            dependency_status=dependency_status,
            sort_by=sort_by,
            sort_order=sort_order,
            page=page,
            limit=limit,
        )
        results = []
        for todo, dep_status_val in rows:         # 每行包含 Todo 对象和依赖状态字符串
            resp = TodoResponse.model_validate(todo)
            resp.dependency_status = DependencyStatus(dep_status_val)  # 将字符串还原为枚举
            results.append(resp)

        return TodoSearchResponse(total=total, page=page, limit=limit, results=results)

    # ------------------------------------------------------------------ #
    # Dependencies
    # ------------------------------------------------------------------ #

    async def add_dependencies(
        self, dependent_id: UUID, body: AddDependenciesRequest
    ) -> DependencyMutationResult:
        """为某个 Todo 批量添加前置任务（依赖关系）"""
        prereq_ids = body.prerequisite_ids
        if not prereq_ids:
            return DependencyMutationResult(dependent_id=str(dependent_id), created=0)

        unique_ids = list(set(prereq_ids))  # 去重，避免处理重复 ID

        if str(dependent_id) in unique_ids:
            raise HTTPException(status_code=400, detail="Todo cannot depend on itself")  # 自依赖检查

        dependent = await self._get_or_404(dependent_id)

        # 验证所有 prerequisite ID 都存在
        prereq_uuids = [UUID(pid) for pid in unique_ids]
        prerequisites = await self.todo_repo.get_by_ids(prereq_uuids)
        found_ids = {str(p.id) for p in prerequisites}
        missing = [pid for pid in unique_ids if pid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Prerequisite todo(s) not found: {', '.join(missing)}",
            )

        # 环检测：如果某个 prerequisite 已经是 dependent 的下游，则添加后会形成环
        cycle_ids = await self.dep_repo.find_cycle_prerequisite_ids(prereq_uuids, dependent_id)
        if cycle_ids:
            prereq_map = {str(p.id): p.name for p in prerequisites}
            labels = [prereq_map.get(str(cid), str(cid)) for cid in cycle_ids]
            raise HTTPException(
                status_code=400,
                detail=f"Adding edge(s) {', '.join(labels)} -> {dependent.name} introduces a cycle",
            )

        # 过滤掉已存在的边，只创建真正新增的边
        existing = await self.dep_repo.get_existing_edges(dependent_id, prereq_uuids)
        existing_ids = {str(e.prerequisite_id) for e in existing}
        to_create = [uid for uid in prereq_uuids if str(uid) not in existing_ids]

        if to_create:
            await self.dep_repo.create_edges(dependent_id, to_create)

        return DependencyMutationResult(dependent_id=str(dependent_id), created=len(to_create))

    async def remove_dependencies(
        self, dependent_id: UUID, body: AddDependenciesRequest
    ) -> DependencyMutationResult:
        """为某个 Todo 批量移除前置任务（软删除依赖边）"""
        prereq_ids = body.prerequisite_ids
        if not prereq_ids:
            return DependencyMutationResult(dependent_id=str(dependent_id), removed=0)

        unique_ids = list(set(prereq_ids))
        prereq_uuids = [UUID(pid) for pid in unique_ids]
        removed = await self.dep_repo.soft_delete_edges(dependent_id, prereq_uuids)
        return DependencyMutationResult(dependent_id=str(dependent_id), removed=removed)

    async def list_dependencies(self, id: UUID) -> List[TodoResponse]:
        """列出某个 Todo 的所有前置任务（它依赖的任务）"""
        edges = await self.dep_repo.get_edges_by_dependent(id)
        if not edges:
            return []
        prereq_ids = list({e.prerequisite_id for e in edges})  # 去重 ID
        todos = await self.todo_repo.get_by_ids(prereq_ids)
        return [TodoResponse.model_validate(t) for t in todos]

    async def list_dependents(self, id: UUID) -> List[TodoResponse]:
        """列出依赖某个 Todo 的所有任务（以该任务为前置的任务）"""
        edges = await self.dep_repo.get_edges_by_prerequisite(id)
        if not edges:
            return []
        dep_ids = list({e.dependent_id for e in edges})  # 去重 ID
        todos = await self.todo_repo.get_by_ids(dep_ids)
        return [TodoResponse.model_validate(t) for t in todos]

    # ------------------------------------------------------------------ #
    # Subgraph
    # ------------------------------------------------------------------ #

    async def get_subgraph(self, id: UUID) -> TodoSubgraph:
        """获取某个 Todo 的完整依赖子图（上游 + 下游所有节点和边）"""
        await self._get_or_404(id)  # 确保目标 Todo 存在

        raw_edges = await self.dep_repo.get_subgraph_raw(id)  # 从数据库取原始边列表

        node_ids: set[UUID] = {id}    # 节点集合，预先加入根节点
        seen: set[tuple] = set()      # 用于边的去重
        edges: list[SubgraphEdge] = []

        for pre_str, dep_str in raw_edges:
            pre_id = UUID(pre_str)
            dep_id = UUID(dep_str)
            node_ids.add(pre_id)   # 收集涉及的所有节点 ID
            node_ids.add(dep_id)
            key = (pre_str, dep_str)
            if key not in seen:    # 去重后加入边列表
                seen.add(key)
                edges.append(SubgraphEdge(prerequisite_id=pre_str, dependent_id=dep_str))

        todos = await self.todo_repo.get_by_ids(list(node_ids))  # 批量查询所有节点数据
        nodes = [TodoResponse.model_validate(t) for t in todos]

        return TodoSubgraph(root_id=str(id), nodes=nodes, edges=edges)

    # ------------------------------------------------------------------ #
    # History
    # ------------------------------------------------------------------ #

    async def get_history(self, id: UUID) -> List[TodoHistoryResponse]:
        """获取某个 Todo 的状态变更历史记录（按时间降序）"""
        records = await self.history_repo.get_by_todo_id(id)
        return [TodoHistoryResponse.model_validate(r) for r in records]

    # ------------------------------------------------------------------ #
    # Private helpers
    # ------------------------------------------------------------------ #

    async def _get_or_404(self, id: UUID) -> Todo:
        """通用辅助方法：按 ID 查找 Todo，未找到时抛出 404 异常"""
        todo = await self.todo_repo.get_by_id(id)
        if not todo:
            raise HTTPException(status_code=404, detail=f"Todo with id {id} not found")
        return todo

    def _assert_due_date_for_recurrence(self, due_date, recurrence) -> None:
        """校验：设置了重复规则时必须同时提供截止日期"""
        if recurrence and not due_date:
            raise HTTPException(
                status_code=400,
                detail="Due date is required when recurrence is provided",
            )

    def _build_update_payload(self, data: TodoUpdate) -> dict:
        """
        将 TodoUpdate Schema 转为数据库更新用的 dict。
        规则：
        - 可置空字段（description/due_date/recurrence）：显式设为 None 时保留 None（清空）
        - 重复规则字段：需要序列化为 dict 格式
        - 其他字段：None 值跳过（视为"未修改"）
        """
        nullable_fields = {"description", "due_date", "recurrence"}
        payload: dict = {}

        for field in data.model_fields_set:  # 只处理本次请求中实际发送的字段
            value = getattr(data, field)
            if field in nullable_fields:
                if value is None:
                    payload[field] = None  # 显式清空
                elif field == "recurrence":
                    payload[field] = _normalize_recurrence(value)  # 序列化重复规则
                else:
                    payload[field] = value
            elif value is not None:
                payload[field] = value  # 非空时才更新

        return payload

    async def _handle_recurring_todo(self, todo_id: UUID, old_status: TodoStatus, updated: Todo) -> None:
        """
        处理重复任务的自动重置：
        当任务从非完成状态变为 COMPLETED，且设置了重复规则时，
        自动计算下一个截止日期，并将状态重置为 NOT_STARTED。
        """
        if (
            old_status == TodoStatus.COMPLETED      # 之前已经是完成状态，说明是重复触发，跳过
            or updated.status != TodoStatus.COMPLETED  # 未变为完成状态，无需处理
            or not updated.recurrence               # 没有重复规则，无需处理
        ):
            return

        if updated.due_date:
            next_due_date = _get_next_due_date(updated.due_date, updated.recurrence)
            await self.todo_repo.update(
                updated,
                {"status": TodoStatus.NOT_STARTED, "due_date": next_due_date},
                # 重置状态为"未开始"，截止日期推进到下一个周期
            )
            await self.history_repo.create(
                todo_id=todo_id,
                from_status=TodoStatus.COMPLETED,
                to_status=TodoStatus.NOT_STARTED,
                changed_by=TodoHistoryChangeBy.RECURRENCE,  # 标记为系统自动重置
            )

    async def _ensure_dependencies_ready(self, todo_id: UUID) -> None:
        """
        检查所有前置任务是否已完成（COMPLETED 或 ARCHIVED）。
        如有未完成的前置任务，抛出 400 错误，阻止状态变更为 IN_PROGRESS。
        """
        edges = await self.dep_repo.get_edges_by_dependent(todo_id)
        if not edges:
            return  # 没有前置任务，直接通过

        prereq_ids = list({e.prerequisite_id for e in edges})
        prerequisites = await self.todo_repo.get_by_ids(prereq_ids)

        ready_statuses = {TodoStatus.COMPLETED, TodoStatus.ARCHIVED}
        blocked = [t for t in prerequisites if t.status not in ready_statuses]  # 未完成的前置任务
        found_ids = {t.id for t in prerequisites}
        missing = [str(pid) for pid in prereq_ids if pid not in found_ids]       # 已被删除的前置任务

        if not blocked and not missing:
            return  # 所有前置任务都已就绪

        labels = [f"{t.name} ({t.status})" for t in blocked] + missing
        raise HTTPException(
            status_code=400,
            detail=(
                "Todo cannot move to IN_PROGRESS until dependencies are "
                f"COMPLETED or ARCHIVED: {', '.join(labels)}"
            ),
        )
