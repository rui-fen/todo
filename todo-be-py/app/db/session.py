from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
# create_async_engine: 创建异步数据库引擎
# AsyncSession: 异步数据库会话类型
# async_sessionmaker: 创建异步会话工厂

from app.core.config import settings  # 导入全局配置，读取 DATABASE_URL

# 创建异步数据库引擎，echo=False 表示不在控制台打印 SQL 语句
engine = create_async_engine(settings.DATABASE_URL, echo=False)

# 创建异步会话工厂
# bind=engine: 绑定到上面的引擎
# class_=AsyncSession: 生成的会话类型为异步会话
# expire_on_commit=False: commit 后对象属性不过期，避免再次访问时触发额外查询
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncSession:
    """FastAPI 依赖注入函数：每次请求创建一个数据库会话，请求结束后自动提交或回滚"""
    async with AsyncSessionLocal() as session:  # 使用 async with 确保会话最终被关闭
        try:
            yield session            # 将会话交给路由处理函数使用
            await session.commit()   # 路由函数正常返回后提交事务
        except Exception:
            await session.rollback() # 发生异常时回滚事务，撤销所有未提交的修改
            raise                    # 重新抛出异常，让 FastAPI 处理错误响应
