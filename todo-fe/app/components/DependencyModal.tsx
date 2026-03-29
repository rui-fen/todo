"use client"

import { useEffect, useState } from "react"
import type { AxiosError } from "axios"
import { Form, Modal, Select, message } from "antd"
import { useMutation, useQuery } from "@tanstack/react-query"
import { ApiResponse, todoApi } from "../apis"
import { SearchFormValue, TodoItem } from "../data/types"

interface DependencyModalProps {
  open: boolean
  todo?: TodoItem
  onCancel: () => void
  onSuccess: () => void
}

interface DependencyFormValue {
  prerequisiteIds: string[]
}

const baseSearchParams: SearchFormValue = {
  sortBy: "name",
  sortOrder: "ASC",
  page: 1,
  limit: 10,
}

export function DependencyModal({
  open,
  todo,
  onCancel,
  onSuccess,
}: DependencyModalProps) {
  const [messageApi, contextHolder] = message.useMessage()
  const [form] = Form.useForm<DependencyFormValue>()
  const [keyword, setKeyword] = useState<string>("")
  const [debouncedKeyword, setDebouncedKeyword] = useState<string>("")

  const resetModalState = () => {
    form.resetFields()
    setKeyword("")
    setDebouncedKeyword("")
  }

  useEffect(() => {
    if (!open) {
      return
    }

    form.setFieldsValue({ prerequisiteIds: [] })
  }, [form, open])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedKeyword(keyword)
    }, 200)

    return () => window.clearTimeout(timeoutId)
  }, [keyword])

  const { data, isFetching } = useQuery({
    enabled: open,
    queryKey: ["dependency-todo-options", debouncedKeyword],
    queryFn: () =>
      todoApi.search({
        ...baseSearchParams,
        name: debouncedKeyword || undefined,
      }),
  })

  const addDependenciesMutation = useMutation({
    mutationFn: (prerequisiteIds: string[]) =>
      todoApi.addDependencies(todo!._id, { prerequisiteIds }),
    onSuccess: res => {
      if (!res.success) {
        messageApi.error(res.message || "Add dependency failed")
        return
      }

      messageApi.success("Dependencies added successfully!")
      resetModalState()
      onSuccess()
    },
    onError: (error: AxiosError<ApiResponse<unknown>>) => {
      messageApi.error(
        error.response?.data?.message ||
          error.message ||
          "Add dependency failed",
      )
    },
  })

  const options =
    data?.data?.results
      ?.filter(item => item._id !== todo?._id)
      .map(item => ({
        label: item.name,
        value: item._id,
      })) ?? []

  return (
    <>
      {contextHolder}
      <Modal
        mask={{ closable: false }}
        closable
        title={todo ? `Add Dependencies: ${todo.name}` : "Add Dependencies"}
        open={open}
        destroyOnHidden
        styles={{
          body: {
            minHeight: 120,
          },
        }}
        confirmLoading={addDependenciesMutation.isPending}
        onOk={() => form.submit()}
        onCancel={() => {
          resetModalState()
          onCancel()
        }}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 30 }}
          onFinish={({ prerequisiteIds }) => {
            addDependenciesMutation.mutate(prerequisiteIds)
          }}
        >
          <Form.Item
            label="Dependency Todos"
            name="prerequisiteIds"
            rules={[
              {
                required: true,
                message: "Please select at least one todo",
              },
            ]}
          >
            <Select
              mode="multiple"
              allowClear
              placeholder="Search todo names"
              options={options}
              loading={isFetching}
              showSearch={{
                filterOption: false,
                onSearch: (value: string) => setKeyword(value),
              }}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
