from datetime import datetime    # 日期时间类型
from typing import Optional      # 可选字段
from uuid import UUID            # UUID 类型

from pydantic import BaseModel, ConfigDict, field_validator  # Pydantic 基础模型和验证器
from pydantic.alias_generators import to_camel               # 将 snake_case 字段名转换为 camelCase

from app.enums import DependencyStatus, Recurrence, RecurrenceUnit, TodoPriority, TodoStatus


class CamelModel(BaseModel):
    """
    基础模型：所有 Schema 的公共父类。
    配置了 camelCase 别名，使 API 的输入/输出与前端 JavaScript 命名风格保持一致。
    例如：due_date <-> dueDate
    """
    model_config = ConfigDict(
        alias_generator=to_camel,  # 自动为每个字段生成 camelCase 别名
        populate_by_name=True,     # 允许同时用原始 snake_case 名称或 camelCase 别名填充字段
        from_attributes=True,      # 允许从 ORM 对象（SQLModel 实例）直接构建此 Schema
    )


class RecurrenceSchema(CamelModel):
    """重复规则的 Schema，对应 Todo.recurrence 字段"""
    type: Recurrence                    # 重复类型：DAILY / WEEKLY / MONTHLY / CUSTOM
    interval: Optional[int] = None     # 自定义间隔数值，仅 CUSTOM 类型使用
    unit: Optional[RecurrenceUnit] = None  # 自定义间隔单位，仅 CUSTOM 类型使用


class TodoCreate(CamelModel):
    """创建 Todo 时的请求体 Schema（POST /todo）"""
    name: str                                        # 任务名称，必填
    description: Optional[str] = None               # 任务描述，可选
    due_date: Optional[datetime] = None             # 截止日期，可选
    status: Optional[TodoStatus] = None             # 初始状态，可选（默认 NOT_STARTED）
    priority: Optional[TodoPriority] = None         # 优先级，可选（默认 LOW）
    recurrence: Optional[RecurrenceSchema] = None   # 重复规则，可选

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        """校验器：name 不能是空字符串或纯空白"""
        if not v.strip():
            raise ValueError("name must not be empty")
        return v


class TodoUpdate(CamelModel):
    """更新 Todo 时的请求体 Schema（PATCH /todo/{id}）：所有字段均为可选"""
    name: Optional[str] = None
    # nullable fields: if explicitly set to None in the request → clear the field
    # 可置空字段：前端显式传 null 时，对应字段会被清空
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    status: Optional[TodoStatus] = None
    priority: Optional[TodoPriority] = None
    recurrence: Optional[RecurrenceSchema] = None


class TodoResponse(CamelModel):
    """返回给前端的 Todo 数据格式"""
    id: UUID                                        # 任务唯一标识
    name: str                                       # 任务名称
    description: Optional[str] = None              # 任务描述
    due_date: Optional[datetime] = None            # 截止日期
    status: TodoStatus                             # 当前状态
    priority: TodoPriority                         # 优先级
    recurrence: Optional[RecurrenceSchema] = None  # 重复规则
    deleted_at: Optional[datetime] = None          # 软删除时间（不为 None 表示已删除）
    created_at: datetime                           # 创建时间
    updated_at: datetime                           # 最后更新时间
    dependency_status: Optional[DependencyStatus] = None
    # 依赖阻塞状态，由搜索接口动态计算后注入，CRUD 接口不返回此字段
