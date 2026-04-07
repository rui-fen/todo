from typing import List, Optional  # 列表和可选类型

from app.schemas.todo import CamelModel  # 复用基础 camelCase 模型


class AddDependenciesRequest(CamelModel):
    """添加或删除依赖关系时的请求体：传入一组前置任务 ID"""
    prerequisite_ids: List[str] = []
    # 前置任务的 UUID 列表（字符串格式），默认为空列表


class DependencyMutationResult(CamelModel):
    """添加/删除依赖操作的返回结果"""
    dependent_id: str           # 被操作的依赖任务 ID
    created: Optional[int] = None  # 新建的依赖边数量（添加操作时使用）
    removed: Optional[int] = None  # 删除的依赖边数量（删除操作时使用）
