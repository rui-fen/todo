from sqlmodel import SQLModel          # SQLModel 的元数据对象记录了所有已定义的表结构
from app.db.session import engine      # 导入数据库引擎

# 必须先 import 所有 Model，SQLModel.metadata 才能知道要创建哪些表
# noqa: F401 告诉 linter 忽略"导入未使用"的警告（这里 import 只是为了副作用）
import app.models.todo             # noqa: F401
import app.models.todo_dependency  # noqa: F401
import app.models.todo_history     # noqa: F401


async def create_db_tables() -> None:
    """应用启动时调用：根据所有 SQLModel 模型定义，在数据库中创建对应的表（若表已存在则跳过）"""
    async with engine.begin() as conn:       # 开启一个数据库连接（带事务）
        await conn.run_sync(SQLModel.metadata.create_all)
        # run_sync 将同步的 create_all 包装为异步调用
        # create_all 检查所有已注册的表，不存在则创建
