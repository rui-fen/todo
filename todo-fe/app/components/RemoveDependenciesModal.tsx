"use client"

import type { AxiosError } from "axios"
import { useState } from "react"
import { Checkbox, Empty, Modal, Skeleton, Tag, message } from "antd"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ApiResponse, todoApi } from "../apis"
import { TodoItem } from "../data/types"
import { mapPriority, mapStatus } from "../data/columns"
import { priorityOptions, statusOptions } from "../data/options"

interface RemoveDependenciesModalProps {
  open: boolean
  todo?: TodoItem
  onCancel: () => void
  onSuccess: () => void
}

export function RemoveDependenciesModal({
  open,
  todo,
  onCancel,
  onSuccess,
}: RemoveDependenciesModalProps) {
  const [messageApi, contextHolder] = message.useMessage()
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const { data, isFetching } = useQuery({
    enabled: open,
    queryKey: ["todo-dependencies", todo?._id],
    queryFn: () => todoApi.listDependencies(todo!._id),
  })

  const removeDependenciesMutation = useMutation({
    mutationFn: (prerequisiteIds: string[]) =>
      todoApi.removeDependencies(todo!._id, { prerequisiteIds }),
    onSuccess: res => {
      if (!res.success) {
        messageApi.error(res.message || "Remove dependency failed")
        return
      }

      messageApi.success("Dependencies removed successfully!")
      setSelectedIds([])
      onSuccess()
    },
    onError: (error: AxiosError<ApiResponse<unknown>>) => {
      messageApi.error(
        error.response?.data?.message ||
          error.message ||
          "Remove dependency failed",
      )
    },
  })

  const dependencies = data?.data ?? []
  const hasDependencies = dependencies.length > 0

  return (
    <>
      {contextHolder}
      <Modal
        mask={{ closable: false }}
        closable
        destroyOnHidden
        title={
          todo ? `Remove Dependencies: ${todo.name}` : "Remove Dependencies"
        }
        open={open}
        okText="OK"
        afterOpenChange={nextOpen => {
          if (nextOpen) {
            setSelectedIds([])
          }
        }}
        okButtonProps={{
          disabled: !hasDependencies || selectedIds.length === 0,
        }}
        confirmLoading={removeDependenciesMutation.isPending}
        onOk={() => removeDependenciesMutation.mutate(selectedIds)}
        onCancel={() => {
          setSelectedIds([])
          onCancel()
        }}
      >
        <div style={{ marginTop: 24, minHeight: 120 }}>
          {isFetching ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : hasDependencies ? (
            <Checkbox.Group
              style={{ width: "100%" }}
              value={selectedIds}
              onChange={values => setSelectedIds(values as string[])}
            >
              <div className="flex flex-col gap-3">
                {dependencies.map((item, key) => (
                  <Checkbox key={item._id} value={item._id}>
                    <div key={key} className="flex gap-4">
                      {item.name}
                      <Tag
                        icon={mapStatus[item.status].icon}
                        color={mapStatus[item.status].color}
                        variant={"outlined"}
                      >
                        {
                          statusOptions.find(
                            option => option.value === item.status,
                          )?.label
                        }
                      </Tag>
                      <Tag
                        color={mapPriority[item.priority].color}
                        variant={"outlined"}
                      >
                        {
                          priorityOptions.find(
                            option => option.value === item.priority,
                          )?.label
                        }
                      </Tag>
                    </div>
                  </Checkbox>
                ))}
              </div>
            </Checkbox.Group>
          ) : (
            <Empty description="No dependencies" />
          )}
        </div>
      </Modal>
    </>
  )
}
