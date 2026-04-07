from fastapi import APIRouter  # FastAPI 路由器

from app.api.v1.endpoints import todo_deps, todo_search, todo_subgraph, todos
# 导入四个子模块的路由器

# 创建 v1 版本的主路由器，所有 Todo 相关接口统一挂载在 /todo 路径下
router = APIRouter(prefix="/todo", tags=["todo"])

# 注意：路由注册顺序很重要！
# 精确路径（如 /search、/{id}/subgraph）必须在通配符路径（如 /{id}）之前注册，
# 否则 /search 会被当成 id=search 匹配到 /{id} 路由上
router.include_router(todo_search.router)   # GET  /todo/search
router.include_router(todo_subgraph.router) # GET  /todo/{id}/subgraph, GET /todo/{id}/history
router.include_router(todo_deps.router)     # POST/DELETE/GET /todo/{id}/dependencies, GET /todo/{id}/dependents
router.include_router(todos.router)         # CRUD: GET/POST /todo, GET/PATCH/DELETE /todo/{id}
