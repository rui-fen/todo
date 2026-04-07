from enum import Enum  # 导入标准库的枚举基类


class TodoStatus(str, Enum):
    """Todo 的状态枚举，同时继承 str 使其可直接序列化为字符串"""
    NOT_STARTED = "NOT_STARTED"  # 未开始
    IN_PROGRESS = "IN_PROGRESS"  # 进行中
    COMPLETED = "COMPLETED"      # 已完成
    ARCHIVED = "ARCHIVED"        # 已归档


class TodoPriority(str, Enum):
    """Todo 的优先级枚举"""
    LOW = "LOW"       # 低优先级
    MEDIUM = "MEDIUM" # 中优先级
    HIGH = "HIGH"     # 高优先级


class DependencyStatus(str, Enum):
    """Todo 的依赖阻塞状态：是否被前置任务阻塞"""
    UNBLOCKED = "UNBLOCKED"  # 未被阻塞，可以开始
    BLOCKED = "BLOCKED"      # 被前置未完成任务阻塞


class Recurrence(str, Enum):
    """重复周期类型"""
    DAILY = "DAILY"    # 每天
    WEEKLY = "WEEKLY"  # 每周
    MONTHLY = "MONTHLY"  # 每月
    CUSTOM = "CUSTOM"  # 自定义间隔


class RecurrenceUnit(str, Enum):
    """自定义重复的时间单位"""
    DAY = "DAY"     # 天
    WEEK = "WEEK"   # 周
    MONTH = "MONTH" # 月


class TodoHistoryChangeBy(str, Enum):
    """状态变更的触发来源"""
    MANUAL = "MANUAL"        # 用户手动修改
    RECURRENCE = "RECURRENCE"  # 重复任务自动重置


class SortBy(str, Enum):
    """搜索结果的排序字段"""
    DUE_DATE = "dueDate"   # 按截止日期排序
    PRIORITY = "priority"  # 按优先级排序
    STATUS = "status"      # 按状态排序
    NAME = "name"          # 按名称排序


class SortOrder(str, Enum):
    """排序方向"""
    ASC = "ASC"   # 升序
    DESC = "DESC" # 降序
