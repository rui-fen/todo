from typing import List  # 列表类型

from app.schemas.todo import CamelModel, TodoResponse  # 复用基础模型和 Todo 响应格式


class SubgraphEdge(CamelModel):
    """依赖图中的一条有向边：前置任务 → 依赖任务"""
    prerequisite_id: str  # 前置任务的 UUID（字符串格式）
    dependent_id: str     # 依赖任务的 UUID（字符串格式）


class TodoSubgraph(CamelModel):
    """
    某个 Todo 的依赖子图响应格式。
    包含以该 Todo 为根节点的所有上游（前置）和下游（后续）任务节点及连接边。
    """
    root_id: str                  # 查询的起始 Todo ID
    nodes: List[TodoResponse]     # 子图中涉及的所有 Todo 节点（含根节点）
    edges: List[SubgraphEdge]     # 子图中所有的依赖边
