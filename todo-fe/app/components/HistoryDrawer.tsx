"use client"

import { useQuery } from "@tanstack/react-query"
import { Drawer, Empty, Skeleton, Timeline, Typography, Tag } from "antd"
import { todoApi } from "../apis"
import { TodoItem, TodoHistory } from "../data/types"
import { mapStatus } from "../data/columns"

interface HistoryDrawerProps {
  open: boolean
  onClose: () => void
  todo: TodoItem | undefined
}

export function HistoryDrawer({ open, onClose, todo }: HistoryDrawerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["history", todo?._id],
    queryFn: () => todoApi.getHistory(todo!._id),
    enabled: open && !!todo,
  })

  const history = data?.data || []

  return (
    <Drawer title="Todo Status History" open={open} onClose={onClose}>
      {todo && (
        <div className="mb-4">
          <Typography.Title level={5}>ID: {todo._id}</Typography.Title>
          <Typography.Text>
            Created At: {new Date(todo.createdAt).toLocaleString()}
          </Typography.Text>
        </div>
      )}
      {isLoading ? (
        <Skeleton active />
      ) : history.length === 0 ? (
        <Empty description="No status changes" />
      ) : (
        <Timeline
          items={history.map((item: TodoHistory) => ({
            key: item._id,
            children: (
              <div>
                <Typography.Text strong>
                  {new Date(item.changedAt).toLocaleString()}
                </Typography.Text>
                <br />
                <div className="mt-2 flex gap-2 items-center">
                  <Tag
                    variant={"outlined"}
                    color={mapStatus[item.changes.status?.from]?.color}
                    icon={mapStatus[item.changes.status?.from]?.icon}
                  >
                    {mapStatus[item.changes.status?.from]?.label}
                  </Tag>
                  <span>→</span>
                  <Tag
                    variant={"outlined"}
                    color={mapStatus[item.changes.status?.to]?.color}
                    icon={mapStatus[item.changes.status?.to]?.icon}
                  >
                    {mapStatus[item.changes.status?.to]?.label}
                  </Tag>
                </div>
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  )
}
