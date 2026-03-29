import axios from "axios"
import {
  Search,
  Create,
  Update,
  TodoItem,
  TodoSearchResponse,
  AddDependenciesPayload,
  TodoSubgraph,
} from "./data/types"

const TODO_API = "http://localhost:3000"

export interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

export const todoApi = {
  search: (data: Search) =>
    axios
      .get<ApiResponse<TodoSearchResponse>>(`${TODO_API}/todo/search`, {
        params: data,
      })
      .then(res => res.data),
  createTodo: (data: Create) =>
    axios
      .post<ApiResponse<TodoItem>>(`${TODO_API}/todo`, data)
      .then(res => res.data),
  updateTodo: (id: string, data: Update) =>
    axios
      .patch<ApiResponse<TodoItem>>(`${TODO_API}/todo/${id}`, data)
      .then(res => res.data),
  deleteTodo: (id: string) =>
    axios
      .delete<ApiResponse<TodoItem>>(`${TODO_API}/todo/${id}`)
      .then(res => res.data),
  addDependencies: (id: string, data: AddDependenciesPayload) =>
    axios
      .post<ApiResponse<{ dependentId: string; created: number }>>(
        `${TODO_API}/todo/${id}/dependencies`,
        data,
      )
      .then(res => res.data),
  listDependencies: (id: string) =>
    axios
      .get<ApiResponse<TodoItem[]>>(`${TODO_API}/todo/${id}/dependencies`)
      .then(res => res.data),
  getSubgraph: (id: string) =>
    axios
      .get<ApiResponse<TodoSubgraph>>(`${TODO_API}/todo/${id}/subgraph`)
      .then(res => res.data),
  removeDependencies: (id: string, data: AddDependenciesPayload) =>
    axios
      .delete<ApiResponse<{ dependentId: string; removed: number }>>(
        `${TODO_API}/todo/${id}/dependencies`,
        { data },
      )
      .then(res => res.data),
}
