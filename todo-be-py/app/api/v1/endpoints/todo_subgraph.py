from typing import List  # 列表类型
from uuid import UUID    # UUID 类型，用于路径参数

from fastapi import APIRouter  # FastAPI 路由器

from app.api.v1.deps import ServiceDep          # 依赖注入：TodoService
from app.schemas.history import TodoHistoryResponse  # 历史记录响应格式
from app.schemas.subgraph import TodoSubgraph        # 子图响应格式

router = APIRouter()  # 创建子路由器


@router.get("/{id}/subgraph", response_model=TodoSubgraph)
async def get_subgraph(id: UUID, service: ServiceDep):
    """获取 id 对应 Todo 的完整依赖子图（上游前置 + 下游后续任务的节点和边）"""
    return await service.get_subgraph(id)


@router.get("/{id}/history", response_model=List[TodoHistoryResponse])
async def get_history(id: UUID, service: ServiceDep):
    """获取 id 对应 Todo 的状态变更历史记录（按时间降序排列）"""
    return await service.get_history(id)
