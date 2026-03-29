"use client"

import { Button, DatePicker, Form, Input, Select } from "antd"
import { EditOutlined, SearchOutlined } from "@ant-design/icons"
import { SearchFormValue } from "../data/types"
import { statusOptions, priorityOptions } from "../data/options"

const { RangePicker } = DatePicker

interface TodoSearchFormProps {
  onSearch: (values: SearchFormValue) => void
  onAdd: () => void
}

export function TodoSearchForm({ onSearch, onAdd }: TodoSearchFormProps) {
  const [searchForm] = Form.useForm<SearchFormValue>()

  return (
    <Form
      layout={"inline"}
      className="gap-3"
      form={searchForm}
      initialValues={{
        sortBy: "dueDate",
        sortOrder: "DESC",
      }}
      onFinish={onSearch}
    >
      <Form.Item label="Name" name="name">
        <Input allowClear style={{ width: 150 }} placeholder="Name" />
      </Form.Item>
      <Form.Item label="Status" name="status">
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="Status"
          options={statusOptions}
        />
      </Form.Item>
      <Form.Item label="Priority" name="priority">
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="Priority"
          options={priorityOptions}
        />
      </Form.Item>
      <Form.Item label="Due day" name="dueDateRange">
        <RangePicker allowClear />
      </Form.Item>
      <Form.Item label="Dependency" name="dependencyStatus">
        <Select
          allowClear
          style={{ width: 150 }}
          placeholder="Status"
          options={[
            { value: "BLOCKED", label: "Blocked" },
            { value: "UNBLOCKED", label: "Unblocked" },
          ]}
        />
      </Form.Item>
      <Form.Item label="Sort by" name="sortBy">
        <Select
          style={{ width: 120 }}
          placeholder="Sort by"
          options={[
            { value: "dueDate", label: "Due date" },
            { value: "priority", label: "Priority" },
            { value: "status", label: "Status" },
            { value: "name", label: "Name" },
          ]}
        />
      </Form.Item>
      <Form.Item label="Sort Order" name="sortOrder">
        <Select
          style={{ width: 120 }}
          placeholder="Sort Order"
          options={[
            { value: "DESC", label: "Desc" },
            { value: "ASC", label: "Asc" },
          ]}
        />
      </Form.Item>
      <Form.Item>
        <Button
          color="primary"
          variant="outlined"
          htmlType="submit"
          icon={<SearchOutlined />}
        >
          Search
        </Button>
      </Form.Item>
      <Form.Item>
        <Button type="primary" icon={<EditOutlined />} onClick={onAdd}>
          Create Todo
        </Button>
      </Form.Item>
    </Form>
  )
}
