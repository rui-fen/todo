from datetime import datetime   # 日期时间类型，用于接收 Query 参数
from typing import Optional     # 可选参数

from fastapi import APIRouter, Query  # APIRouter: 路由器；Query: 声明查询参数及其默认值/约束

from app.api.v1.deps import ServiceDep  # 依赖注入：TodoService
from app.enums import DependencyStatus, SortBy, SortOrder, TodoPriority, TodoStatus
from app.schemas.search import TodoSearchResponse  # 搜索结果响应格式

router = APIRouter()  # 创建子路由器，会被 v1 主路由器 include


@router.get("/search", response_model=TodoSearchResponse)
async def search_todos(
    service: ServiceDep,                                          # 注入业务服务
    name: Optional[str] = None,                                   # 按名称模糊搜索（可选）
    status: Optional[TodoStatus] = None,                          # 按状态过滤（可选）
    priority: Optional[TodoPriority] = None,                      # 按优先级过滤（可选）
    dueDateStart: Optional[datetime] = Query(None),               # 截止日期范围：开始（可选）
    dueDateEnd: Optional[datetime] = Query(None),                 # 截止日期范围：结束（可选）
    dependencyStatus: Optional[DependencyStatus] = Query(None),   # 按依赖阻塞状态过滤（可选）
    sortBy: SortBy = Query(SortBy.DUE_DATE),                      # 排序字段，默认按截止日期
    sortOrder: SortOrder = Query(SortOrder.DESC),                  # 排序方向，默认降序
    page: int = Query(1, ge=1),                                   # 页码，最小为 1
    limit: int = Query(10, ge=1),                                 # 每页条数，最小为 1
):
    """搜索 Todo 列表，支持多条件过滤、排序和分页"""
    return await service.search(
        name=name,
        status=status,
        priority=priority,
        due_date_start=dueDateStart,
        due_date_end=dueDateEnd,
        dependency_status=dependencyStatus,
        sort_by=sortBy,
        sort_order=sortOrder,
        page=page,
        limit=limit,
    )
