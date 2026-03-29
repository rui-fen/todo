import { Dayjs } from "dayjs"

export enum Status {
  NOT_STARTED = "NOT_STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  ARCHIVED = "ARCHIVED",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

export enum Recurrence {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  MONTHLY = "MONTHLY",
  CUSTOM = "CUSTOM",
}

export enum RecurrenceUnit {
  DAY = "DAY",
  WEEK = "WEEK",
  MONTH = "MONTH",
}

export enum DependencyStatus {
  UNBLOCKED = "UNBLOCKED",
  BLOCKED = "BLOCKED",
}

export interface CreateFormValue {
  name: string
  description?: string
  priority: string
  status: string
  dueDate?: Dayjs
  recurrence?: Recurrence
  customInterval?: number
  customUnit?: RecurrenceUnit
}

export interface RecurrenceConfig {
  type: Recurrence
  interval?: number
  unit?: RecurrenceUnit
}

export type Create = Omit<
  CreateFormValue,
  "dueDate" | "recurrence" | "customInterval" | "customUnit"
> & {
  dueDate?: string
  recurrence?: RecurrenceConfig
}

export type Update = Partial<
  Omit<Create, "description" | "dueDate" | "recurrence">
> & {
  description?: string | null
  dueDate?: string | null
  recurrence?: RecurrenceConfig | null
}

export interface SearchFormValue {
  name?: string
  status?: Status
  priority?: Priority
  dueDateRange?: [Dayjs, Dayjs]
  dependencyStatus?: DependencyStatus
  sortBy: "dueDate" | "priority" | "status" | "name"
  sortOrder: "ASC" | "DESC"
  page: number
  limit: number
}

export type Search = Omit<SearchFormValue, "dueDateRange"> & {
  dueDateStart?: string
  dueDateEnd?: string
}

export interface TodoItem {
  _id: string
  name: string
  description?: string
  priority: Priority
  status: Status
  dependencyStatus?: DependencyStatus
  dueDate?: string
  recurrence?: RecurrenceConfig
  createdAt: string
}

export interface TodoSearchResponse {
  total: number
  page: number
  limit: number
  results: TodoItem[]
}

export interface AddDependenciesPayload {
  prerequisiteIds: string[]
}

export interface TodoGraphEdge {
  prerequisiteId: string
  dependentId: string
}

export interface TodoSubgraph {
  rootId: string
  nodes: TodoItem[]
  edges: TodoGraphEdge[]
}
