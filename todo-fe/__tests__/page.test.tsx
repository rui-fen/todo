import React from "react"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Page from "../app/page"

const useQueryMock = vi.fn()
const useMutationMock = vi.fn()
const useQueryClientMock = vi.fn()
const invalidateQueriesMock = vi.fn()
const mutateMock = vi.fn()
const messageSuccessMock = vi.fn()
const messageErrorMock = vi.fn()
const { columnsMock } = vi.hoisted(() => ({
  columnsMock: vi.fn(),
}))

let latestDeleteOptions:
  | {
      onSuccess?: (value: { success: boolean; message?: string }) => void
      onError?: (error: {
        response?: { data?: { message?: string } }
        message?: string
      }) => void
    }
  | undefined

vi.mock("@tanstack/react-query", () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
  useQueryClient: (...args: unknown[]) => useQueryClientMock(...args),
}))

vi.mock("../app/apis", () => ({
  todoApi: {
    search: vi.fn(),
    deleteTodo: vi.fn(),
    getHistory: vi.fn().mockResolvedValue({
      success: true,
      data: [],
    }),
  },
}))

vi.mock("../app/components/TodoSearchForm", () => ({
  TodoSearchForm: ({
    onSearch,
    onAdd,
  }: {
    onSearch: (values: Record<string, unknown>) => void
    onAdd: () => void
  }) => (
    <div>
      <button
        onClick={() =>
          onSearch({
            name: "Filtered Todo",
            sortBy: "name",
            sortOrder: "ASC",
            page: 1,
            limit: 10,
          })
        }
      >
        mock-search
      </button>
      <button onClick={onAdd}>mock-add</button>
    </div>
  ),
}))

vi.mock("../app/components/TodoModal", () => ({
  TodoModal: ({
    open,
    editingTodo,
  }: {
    open: boolean
    editingTodo?: { name?: string }
  }) => (
    <div data-testid="todo-modal">
      {open ? `open:${editingTodo?.name ?? "new"}` : "closed"}
    </div>
  ),
}))

vi.mock("../app/components/DependencyModal", () => ({
  DependencyModal: ({
    open,
    todo,
  }: {
    open: boolean
    todo?: { name?: string }
  }) => (
    <div data-testid="dependency-modal">
      {open ? `open:${todo?.name ?? ""}` : "closed"}
    </div>
  ),
}))

vi.mock("../app/components/RemoveDependenciesModal", () => ({
  RemoveDependenciesModal: ({
    open,
    todo,
  }: {
    open: boolean
    todo?: { name?: string }
  }) => (
    <div data-testid="remove-dependency-modal">
      {open ? `open:${todo?.name ?? ""}` : "closed"}
    </div>
  ),
}))

vi.mock("../app/components/GraphModal", () => ({
  GraphModal: ({ open, todo }: { open: boolean; todo?: { name?: string } }) => (
    <div data-testid="graph-modal">
      {open ? `open:${todo?.name ?? ""}` : "closed"}
    </div>
  ),
}))

vi.mock("../app/components/HistoryDrawer", () => ({
  HistoryDrawer: ({
    open,
    todo,
  }: {
    open: boolean
    todo?: { name?: string }
  }) => (
    <div data-testid="history-drawer">
      {open ? `open:${todo?.name ?? ""}` : "closed"}
    </div>
  ),
}))

vi.mock("../app/data/columns", () => ({
  columns: columnsMock.mockImplementation(
    ({
      onEdit,
      onDelete,
      onAddDependency,
      onRemoveDependency,
      onShowGraph,
      onShowHistory,
    }: {
      onEdit: (record: TodoRecord) => void
      onDelete: (record: TodoRecord) => void
      onAddDependency: (record: TodoRecord) => void
      onRemoveDependency: (record: TodoRecord) => void
      onShowGraph: (record: TodoRecord) => void
      onShowHistory: (record: TodoRecord) => void
    }) => [
      {
        title: "Actions",
        render: (_: unknown, record: TodoRecord) => (
          <div>
            <button onClick={() => onEdit(record)}>edit-{record._id}</button>
            <button onClick={() => onAddDependency(record)}>
              add-dependency-{record._id}
            </button>
            <button onClick={() => onRemoveDependency(record)}>
              remove-dependency-{record._id}
            </button>
            <button onClick={() => onShowGraph(record)}>
              graph-{record._id}
            </button>
            <button onClick={() => onShowHistory(record)}>
              history-{record._id}
            </button>
            <button onClick={() => onDelete(record)}>
              delete-{record._id}
            </button>
          </div>
        ),
      },
    ],
  ),
}))

vi.mock("antd", async () => {
  const actual = await vi.importActual<typeof import("antd")>("antd")

  return {
    ...actual,
    Alert: ({ title }: { title: React.ReactNode }) => (
      <div role="alert">{title}</div>
    ),
    Table: ({
      dataSource,
      columns,
      pagination,
    }: {
      dataSource?: TodoRecord[]
      columns?: Array<{
        render?: (_: unknown, record: TodoRecord) => React.ReactNode
      }>
      pagination?: { onChange?: (page: number) => void }
    }) => (
      <div>
        {(dataSource ?? []).map(record => (
          <div key={record._id}>
            <span>{record.name}</span>
            {columns?.[0]?.render?.(undefined, record)}
          </div>
        ))}
        <button onClick={() => pagination?.onChange?.(2)}>next-page</button>
      </div>
    ),
    message: {
      useMessage: () => [
        {
          success: messageSuccessMock,
          error: messageErrorMock,
        },
        <div key="message-context">message-context</div>,
      ],
    },
  }
})

type TodoRecord = {
  _id: string
  name: string
  description?: string
  status: string
  priority: string
  dependencyStatus?: string
  dueDate?: string
  createdAt: string
}

const todos: TodoRecord[] = [
  {
    _id: "todo-1",
    name: "First Todo",
    description: "First Description",
    status: "NOT_STARTED",
    priority: "MEDIUM",
    dependencyStatus: "UNBLOCKED",
    dueDate: "2026-03-31T10:00:00.000Z",
    createdAt: "2026-03-29T10:00:00.000Z",
  },
]

describe("Page", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    latestDeleteOptions = undefined
    invalidateQueriesMock.mockReset()
    mutateMock.mockReset()
    messageSuccessMock.mockReset()
    messageErrorMock.mockReset()
    columnsMock.mockClear()
    useQueryClientMock.mockReset()
    useQueryMock.mockReset()
    useMutationMock.mockReset()

    useQueryClientMock.mockReturnValue({
      invalidateQueries: invalidateQueriesMock,
    })

    useQueryMock.mockReturnValue({
      data: {
        data: {
          total: 1,
          page: 1,
          limit: 10,
          results: todos,
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })

    useMutationMock.mockImplementation(options => {
      latestDeleteOptions = options as typeof latestDeleteOptions

      return {
        mutate: mutateMock,
        isPending: false,
        variables: undefined,
      }
    })
  })

  it("renders queried todos", () => {
    render(<Page />)

    expect(screen.getByText("First Todo")).toBeTruthy()
    expect(screen.getByTestId("todo-modal").textContent).toBe("closed")
  })

  it("queries todos with default params on first render", () => {
    render(<Page />)

    const firstCall = useQueryMock.mock.calls[0]?.[0] as {
      queryKey: [string, string]
    }

    expect(firstCall.queryKey[0]).toBe("todos")
    expect(JSON.parse(firstCall.queryKey[1])).toEqual({
      sortBy: "dueDate",
      sortOrder: "DESC",
      page: 1,
      limit: 10,
    })
  })

  it("renders no rows when query returns no todos", () => {
    useQueryMock.mockReturnValue({
      data: {
        data: {
          total: 0,
          page: 1,
          limit: 10,
          results: [],
        },
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })

    render(<Page />)

    expect(screen.queryByText("First Todo")).toBeNull()
    expect(screen.getByText("next-page")).toBeTruthy()
  })

  it("shows query error alert", () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: new Error("Failed to fetch todos from API"),
    })

    render(<Page />)

    expect(screen.getByRole("alert").textContent).toContain(
      "Failed to fetch todos from API",
    )
  })

  it("updates query params when search form submits", async () => {
    render(<Page />)

    fireEvent.click(screen.getByText("mock-search"))

    await waitFor(() => {
      const lastCall = useQueryMock.mock.lastCall?.[0] as {
        queryKey: [string, string]
      }

      expect(lastCall.queryKey[0]).toBe("todos")
      expect(JSON.parse(lastCall.queryKey[1])).toEqual({
        sortBy: "name",
        sortOrder: "ASC",
        page: 1,
        limit: 10,
        name: "Filtered Todo",
      })
    })
  })

  it("updates query params when pagination changes", async () => {
    render(<Page />)

    fireEvent.click(screen.getByText("next-page"))

    await waitFor(() => {
      const lastCall = useQueryMock.mock.lastCall?.[0] as {
        queryKey: [string, string]
      }

      expect(lastCall.queryKey[0]).toBe("todos")
      expect(JSON.parse(lastCall.queryKey[1])).toEqual({
        sortBy: "dueDate",
        sortOrder: "DESC",
        page: 2,
        limit: 10,
      })
    })
  })

  it("opens create modal from search form", () => {
    render(<Page />)

    fireEvent.click(screen.getByText("mock-add"))

    expect(screen.getByTestId("todo-modal").textContent).toBe("open:new")
  })

  it("opens edit, dependency, remove dependency and graph modals for a row", () => {
    render(<Page />)

    fireEvent.click(screen.getByText("edit-todo-1"))
    expect(screen.getByTestId("todo-modal").textContent).toBe("open:First Todo")

    fireEvent.click(screen.getByText("add-dependency-todo-1"))
    expect(screen.getByTestId("dependency-modal").textContent).toBe(
      "open:First Todo",
    )

    fireEvent.click(screen.getByText("remove-dependency-todo-1"))
    expect(screen.getByTestId("remove-dependency-modal").textContent).toBe(
      "open:First Todo",
    )

    fireEvent.click(screen.getByText("graph-todo-1"))
    expect(screen.getByTestId("graph-modal").textContent).toBe(
      "open:First Todo",
    )
  })

  it("triggers delete mutation with selected todo id", () => {
    render(<Page />)

    fireEvent.click(screen.getByText("delete-todo-1"))

    expect(mutateMock).toHaveBeenCalledWith("todo-1")
  })

  it("shows success and invalidates queries after delete success on first page", () => {
    render(<Page />)

    latestDeleteOptions?.onSuccess?.({ success: true })

    expect(messageSuccessMock).toHaveBeenCalledWith(
      "Todo deleted successfully!",
    )
    expect(invalidateQueriesMock).toHaveBeenCalledWith({
      queryKey: ["todos"],
    })
  })

  it("resets to page 1 after delete success when current page is not first", async () => {
    render(<Page />)

    fireEvent.click(screen.getByText("next-page"))

    await waitFor(() => {
      const lastCall = useQueryMock.mock.lastCall?.[0] as {
        queryKey: [string, string]
      }

      expect(JSON.parse(lastCall.queryKey[1])).toEqual({
        sortBy: "dueDate",
        sortOrder: "DESC",
        page: 2,
        limit: 10,
      })
    })

    latestDeleteOptions?.onSuccess?.({ success: true })

    await waitFor(() => {
      const lastCall = useQueryMock.mock.lastCall?.[0] as {
        queryKey: [string, string]
      }

      expect(JSON.parse(lastCall.queryKey[1])).toEqual({
        sortBy: "dueDate",
        sortOrder: "DESC",
        page: 1,
        limit: 10,
      })
    })

    expect(invalidateQueriesMock).not.toHaveBeenCalled()
  })

  it("shows delete failed message when mutation success flag is false", () => {
    render(<Page />)

    latestDeleteOptions?.onSuccess?.({
      success: false,
      message: "Delete failed from API",
    })

    expect(messageErrorMock).toHaveBeenCalledWith("Delete failed from API")
    expect(messageSuccessMock).not.toHaveBeenCalled()
  })

  it("shows backend error message after delete failure", () => {
    render(<Page />)

    latestDeleteOptions?.onError?.({
      response: {
        data: {
          message: "Cannot delete todo",
        },
      },
      message: "fallback",
    })

    expect(messageErrorMock).toHaveBeenCalledWith("Cannot delete todo")
  })

  it("falls back to generic error message after delete failure", () => {
    render(<Page />)

    latestDeleteOptions?.onError?.({
      message: "Network exploded",
    })

    expect(messageErrorMock).toHaveBeenCalledWith("Network exploded")
  })
})
