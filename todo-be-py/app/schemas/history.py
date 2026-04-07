from datetime import datetime  # 时间类型
from uuid import UUID          # UUID 类型

from app.enums import TodoHistoryChangeBy, TodoStatus  # 变更来源和状态枚举
from app.schemas.todo import CamelModel                # 复用基础 camelCase 模型


class TodoHistoryResponse(CamelModel):
    """返回给前端的状态变更历史记录格式"""
    id: UUID                           # 历史记录的唯一 ID
    todo_id: UUID                      # 关联的 Todo ID
    from_status: TodoStatus            # 变更前的状态
    to_status: TodoStatus              # 变更后的状态
    changed_by: TodoHistoryChangeBy    # 触发变更的来源：手动或重复任务自动
    created_at: datetime               # 变更发生时间
