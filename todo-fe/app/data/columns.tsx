import { Tag, Button, Tooltip, Popconfirm, Divider, Badge } from "antd"
import type { ColumnsType } from "antd/es/table"
import { dependencyStatusOptions, recurrenceOptions } from "./options"
import {
  CheckOutlined,
  PushpinOutlined,
  DeploymentUnitOutlined,
  SyncOutlined,
  InboxOutlined,
} from "@ant-design/icons"
import { TodoItem, Recurrence, DependencyStatus } from "../data/types"

export const mapStatus: Record<
  string,
  { icon: React.ReactNode; color: string; label: string }
> = {
  NOT_STARTED: {
    icon: <PushpinOutlined />,
    color: "gold",
    label: "Not Started",
  },
  IN_PROGRESS: {
    icon: <SyncOutlined />,
    color: "blue",
    label: "In Progress",
  },
  COMPLETED: {
    icon: <CheckOutlined />,
    color: "green",
    label: "Completed",
  },
  ARCHIVED: {
    icon: <InboxOutlined />,
    color: "default",
    label: "Archived",
  },
}

export const mapPriority: Record<string, { color: string; label: string }> = {
  LOW: { color: "default", label: "Low" },
  MEDIUM: { color: "blue", label: "Medium" },
  HIGH: { color: "red", label: "High" },
}

export const columns = ({
  onEdit,
  onDelete,
  onAddDependency,
  onRemoveDependency,
  onShowGraph,
  isDeleting,
  deletingId,
  onShowHistory,
}: {
  onEdit: (record: TodoItem) => void
  onDelete: (record: TodoItem) => void
  onAddDependency: (record: TodoItem) => void
  onRemoveDependency: (record: TodoItem) => void
  onShowGraph: (record: TodoItem) => void
  onShowHistory: (record: TodoItem) => void
  isDeleting: boolean
  deletingId?: string
}): ColumnsType<TodoItem> => [
  {
    title: "Name",
    dataIndex: "name",
    key: "name",
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
          {mapStatus[status].label}
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
        <Tag color={mapPriority[priority].color} variant={"filled"}>
          {mapPriority[priority].label}
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
      return new Date(dueDate).toLocaleDateString()
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
        <Tooltip title="View dependency graph">
          <Button
            icon={<DeploymentUnitOutlined />}
            size="small"
            color="magenta"
            variant="text"
            onClick={() => onShowGraph(record)}
          >
            Graph
          </Button>
        </Tooltip>
        <Divider orientation="vertical" />
        <Button
          color="primary"
          size="small"
          variant="text"
          onClick={() => onShowHistory(record)}
        >
          History
        </Button>
        <Divider orientation="vertical" />
        <Tooltip title="Add dependencies to this todo">
          <Button
            color="primary"
            size="small"
            variant="text"
            onClick={() => onAddDependency(record)}
          >
            Add
          </Button>
        </Tooltip>
        <Divider orientation="vertical" />
        <Tooltip title="Remove dependencies to this todo">
          <Button
            color="primary"
            size="small"
            variant="text"
            onClick={() => onRemoveDependency(record)}
          >
            Remove
          </Button>
        </Tooltip>
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
