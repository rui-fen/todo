import { Tag, Button, Tooltip, Popconfirm, Divider, Badge } from "antd"
import type { ColumnsType } from "antd/es/table"
import {
  dependencyStatusOptions,
  priorityOptions,
  recurrenceOptions,
  statusOptions,
} from "./options"
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  SaveOutlined,
  DeploymentUnitOutlined,
  SyncOutlined,
} from "@ant-design/icons"
import { TodoItem, Recurrence, DependencyStatus } from "../data/types"

export const mapStatus: Record<
  string,
  { icon: React.ReactNode; color: string }
> = {
  NOT_STARTED: { icon: <ClockCircleOutlined />, color: "gold" },
  IN_PROGRESS: { icon: <SyncOutlined spin />, color: "blue" },
  COMPLETED: { icon: <CheckCircleOutlined />, color: "green" },
  ARCHIVED: { icon: <SaveOutlined />, color: "default" },
}

export const mapPriority: Record<string, string> = {
  LOW: "default",
  MEDIUM: "blue",
  HIGH: "red",
}

export const columns = ({
  onEdit,
  onDelete,
  onAddDependency,
  onRemoveDependency,
  onShowGraph,
  isDeleting,
  deletingId,
}: {
  onEdit: (record: TodoItem) => void
  onDelete: (record: TodoItem) => void
  onAddDependency: (record: TodoItem) => void
  onRemoveDependency: (record: TodoItem) => void
  onShowGraph: (record: TodoItem) => void
  isDeleting: boolean
  deletingId?: string
}): ColumnsType<TodoItem> => [
  {
    title: "Name",
    dataIndex: "name",
    key: "name",
    render: (name: string, record: TodoItem) => {
      return (
        <Tooltip
          title={
            <>
              Created At:
              <div>{new Date(record.createdAt).toLocaleString()}</div>
            </>
          }
        >
          <Button size="small" color="default" variant="text">
            {name}
          </Button>
        </Tooltip>
      )
    },
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
  },
  {
    title: "Status",
    dataIndex: "status",
    key: "status",
    render: (status: string) => {
      return (
        <Tag
          icon={mapStatus[status].icon}
          color={mapStatus[status].color}
          variant={"outlined"}
        >
          {statusOptions.find(option => option.value === status)?.label}
        </Tag>
      )
    },
  },
  {
    title: "Priority",
    dataIndex: "priority",
    key: "priority",
    render: (priority: string) => {
      return (
        <Tag color={mapPriority[priority]} variant={"filled"}>
          {priorityOptions.find(option => option.value === priority)?.label}
        </Tag>
      )
    },
  },
  {
    title: "Dependency",
    dataIndex: "dependencyStatus",
    key: "dependencyStatus",
    render: dependencyStatus => {
      return (
        <span>
          <Badge
            status={
              dependencyStatus === DependencyStatus.BLOCKED
                ? "warning"
                : "processing"
            }
          />
          <span className="ml-2">
            {
              dependencyStatusOptions.find(
                option => option.value === dependencyStatus,
              )?.label
            }
          </span>
        </span>
      )
    },
  },
  {
    title: "Due date",
    dataIndex: "dueDate",
    key: "dueDate",
    render: (dueDate: string) => {
      if (!dueDate) {
        return null
      }
      return new Date(dueDate).toLocaleString()
    },
  },
  {
    title: "Recurrence",
    dataIndex: "recurrence",
    key: "recurrence",
    render: recurrence => {
      if (!recurrence) {
        return null
      }

      const label = recurrenceOptions.find(
        option => option.value === recurrence.type,
      )?.label

      if (recurrence.type !== Recurrence.CUSTOM) {
        return label
      }

      return `${label} (${recurrence.interval} ${recurrence.unit?.toLowerCase() + "(s)"})`
    },
  },
  {
    title: "Action",
    key: "action",
    render: (_, record) => (
      <>
        <Button
          icon={<DeploymentUnitOutlined />}
          size="small"
          color="magenta"
          variant="text"
          onClick={() => onShowGraph(record)}
        >
          Graph
        </Button>
        <Divider orientation="vertical" />
        <Button
          color="primary"
          size="small"
          variant="text"
          onClick={() => onAddDependency(record)}
        >
          Add
        </Button>
        <Divider orientation="vertical" />
        <Button
          color="primary"
          size="small"
          variant="text"
          onClick={() => onRemoveDependency(record)}
        >
          Remove
        </Button>

        <Divider orientation="vertical" />
        <Button
          size="small"
          color="primary"
          variant="text"
          onClick={() => onEdit(record)}
        >
          Edit
        </Button>
        <Divider orientation="vertical" />
        <Popconfirm
          title="Delete this todo?"
          description="This will delete the selected todo."
          okButtonProps={{
            danger: true,
            loading: isDeleting && deletingId === record._id,
          }}
          onConfirm={() => onDelete(record)}
        >
          <Button size="small" color="danger" variant="text">
            Delete
          </Button>
        </Popconfirm>
      </>
    ),
  },
]
