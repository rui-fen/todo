from pydantic_settings import BaseSettings  # 从 pydantic-settings 导入配置基类，支持从环境变量读取


class Settings(BaseSettings):
    """应用配置类：字段值优先从环境变量读取，其次使用默认值"""
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/todo"
    # 数据库连接字符串，使用 asyncpg 异步驱动连接 PostgreSQL

    model_config = {"env_file": ".env"}
    # 告诉 pydantic 从 .env 文件加载环境变量


settings = Settings()  # 创建全局配置实例，应用中其他模块直接 import 这个对象来使用配置
