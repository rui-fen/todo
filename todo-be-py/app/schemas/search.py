from typing import List, Optional  # 列表和可选类型
from uuid import UUID              # UUID 类型（当前文件未直接使用，但保留供后续扩展）

from pydantic import ConfigDict                # Pydantic 配置
from pydantic.alias_generators import to_camel # camelCase 转换

from app.enums import DependencyStatus, SortBy, SortOrder, TodoPriority, TodoStatus
from app.schemas.todo import CamelModel, TodoResponse  # 复用基础模型和 Todo 响应格式


class TodoSearchResponse(CamelModel):
    """搜索接口（GET /todo/search）的响应体格式，包含分页信息和结果列表"""
    total: int               # 符合条件的总记录数（用于前端计算总页数）
    page: int                # 当前页码
    limit: int               # 每页条数
    results: List[TodoResponse]  # 当前页的 Todo 列表，每条记录含 dependency_status 字段
