from typing import List  # 列表类型
from uuid import UUID    # UUID 类型，用于路径参数

from fastapi import APIRouter  # FastAPI 路由器

from app.api.v1.deps import ServiceDep  # 依赖注入：TodoService
from app.schemas.dependency import AddDependenciesRequest, DependencyMutationResult
from app.schemas.todo import TodoResponse  # Todo 响应格式

router = APIRouter()  # 创建子路由器


@router.post("/{id}/dependencies", response_model=DependencyMutationResult)
async def add_dependencies(id: UUID, body: AddDependenciesRequest, service: ServiceDep):
    """为 id 对应的 Todo 批量添加前置任务（依赖关系）"""
    return await service.add_dependencies(id, body)


@router.delete("/{id}/dependencies", response_model=DependencyMutationResult)
async def remove_dependencies(id: UUID, body: AddDependenciesRequest, service: ServiceDep):
    """为 id 对应的 Todo 批量移除前置任务（软删除依赖边）"""
    return await service.remove_dependencies(id, body)


@router.get("/{id}/dependencies", response_model=List[TodoResponse])
async def list_dependencies(id: UUID, service: ServiceDep):
    """列出 id 对应的 Todo 所依赖的所有前置任务"""
    return await service.list_dependencies(id)


@router.get("/{id}/dependents", response_model=List[TodoResponse])
async def list_dependents(id: UUID, service: ServiceDep):
    """列出以 id 对应的 Todo 为前置任务的所有后续任务"""
    return await service.list_dependents(id)
