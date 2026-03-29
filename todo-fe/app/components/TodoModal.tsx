"use client"

import { useEffect } from "react"
import dayjs from "dayjs"
import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
} from "antd"
import { useMutation } from "@tanstack/react-query"
import {
  CreateFormValue,
  TodoItem,
  Recurrence,
  RecurrenceUnit,
  Update,
} from "../data/types"
import {
  recurrenceOptions,
  recurrenceUnitOptions,
  priorityOptions,
  statusOptions,
} from "../data/options"
import { todoApi } from "../apis"

interface TodoModalProps {
  open: boolean
  editingTodo?: TodoItem
  onCancel: () => void
  onSuccess: () => void
}

export function TodoModal({
  open,
  editingTodo,
  onCancel,
  onSuccess,
}: TodoModalProps) {
  const [messageApi, contextHolder] = message.useMessage()
  const [todoForm] = Form.useForm<CreateFormValue>()

  useEffect(() => {
    if (!open) {
      return
    }

    if (editingTodo) {
      todoForm.setFieldsValue({
        ...editingTodo,
        dueDate: editingTodo.dueDate ? dayjs(editingTodo.dueDate) : undefined,
        recurrence: editingTodo.recurrence?.type,
        customInterval: editingTodo.recurrence?.interval,
        customUnit: editingTodo.recurrence?.unit ?? RecurrenceUnit.DAY,
      })
    } else {
      todoForm.resetFields()
    }
  }, [open, editingTodo, todoForm])

  const createTodoMutation = useMutation({
    mutationFn: todoApi.createTodo,
    onSuccess: res => {
      if (res.success) {
        messageApi.success("Todo created successfully!")
        onSuccess()
      }
    },
    onError: error => {
      messageApi.error(error.message || "Request failed")
    },
  })

  const updateTodoMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Update }) =>
      todoApi.updateTodo(id, data),
    onSuccess: res => {
      if (res.success) {
        messageApi.success("Todo updated successfully!")
        onSuccess()
      }
    },
    onError: error => {
      messageApi.error(error.message || "Request failed")
    },
  })

  const onFinish = (values: CreateFormValue) => {
    const recurrence = !values.recurrence
      ? undefined
      : values.recurrence === Recurrence.CUSTOM
        ? {
            type: Recurrence.CUSTOM,
            interval: values.customInterval,
            unit: values.customUnit ?? RecurrenceUnit.DAY,
          }
        : {
            type: values.recurrence,
          }

    if (editingTodo) {
      const updatePayload: Update = {
        name: values.name,
        description: values.description?.trim() ? values.description : null,
        priority: values.priority,
        status: values.status,
        dueDate: values.dueDate ? values.dueDate.toISOString() : null,
        recurrence: recurrence ?? null,
      }

      updateTodoMutation.mutate({
        id: editingTodo._id,
        data: updatePayload,
      })
      return
    }

    createTodoMutation.mutate({
      name: values.name,
      description: values.description,
      priority: values.priority,
      status: values.status,
      dueDate: values.dueDate?.toISOString(),
      recurrence,
    })
  }

  return (
    <>
      {contextHolder}
      <Modal
        mask={{ closable: false }}
        confirmLoading={
          createTodoMutation.isPending || updateTodoMutation.isPending
        }
        destroyOnHidden
        title={editingTodo ? "Edit Todo" : "Add Todo"}
        open={open}
        onOk={() => todoForm.submit()}
        onCancel={onCancel}
      >
        <Form
          layout={"horizontal"}
          labelCol={{ span: 5 }}
          wrapperCol={{ span: 17 }}
          form={todoForm}
          initialValues={{
            status: "NOT_STARTED",
            priority: "LOW",
            customUnit: RecurrenceUnit.DAY,
          }}
          onFinish={onFinish}
        >
          <Form.Item
            label="Name"
            name="name"
            rules={[{ required: true, message: "Please input your name" }]}
          >
            <Input allowClear placeholder="name" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea
              allowClear
              placeholder="Description"
              rows={2}
              style={{ resize: "none" }}
            />
          </Form.Item>
          <Form.Item label="Status" name="status">
            <Select placeholder="Status" options={statusOptions} />
          </Form.Item>
          <Form.Item label="Priority" name="priority">
            <Radio.Group optionType="button" options={priorityOptions} />
          </Form.Item>
          <Form.Item
            name="dueDate"
            label="Due date"
            dependencies={["recurrence"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!getFieldValue("recurrence") || value) {
                    return Promise.resolve()
                  }

                  return Promise.reject(
                    new Error("Please select due date for recurrence todo"),
                  )
                },
              }),
            ]}
          >
            <DatePicker />
          </Form.Item>
          <Form.Item label="Recurrence" name="recurrence">
            <Select
              allowClear
              placeholder="No recurrence"
              options={recurrenceOptions}
            />
          </Form.Item>
          <Form.Item
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.recurrence !== currentValues.recurrence
            }
            noStyle
          >
            {({ getFieldValue }) =>
              getFieldValue("recurrence") === Recurrence.CUSTOM ? (
                <>
                  <Form.Item
                    label="Interval"
                    name="customInterval"
                    rules={[
                      {
                        required: true,
                        message: "Please input custom interval",
                      },
                    ]}
                  >
                    <InputNumber
                      min={1}
                      max={999}
                      style={{ width: "100%" }}
                      placeholder="Custom interval"
                    />
                  </Form.Item>
                  <Form.Item label="Unit" name="customUnit">
                    <Radio.Group
                      optionType="button"
                      options={recurrenceUnitOptions}
                    />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
