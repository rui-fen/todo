"use client"

import { useEffect, useRef, useState } from "react"
import mermaid from "mermaid"
import { Alert, Empty, Modal, Skeleton } from "antd"
import { useQuery } from "@tanstack/react-query"
import { todoApi } from "../apis"
import { statusOptions } from "../data/options"
import { TodoItem, TodoSubgraph } from "../data/types"

interface GraphModalProps {
  open: boolean
  todo?: TodoItem
  onCancel: () => void
}

let mermaidInitialized = false
const statusLabelMap = new Map(
  statusOptions.map(option => [option.value, option.label]),
)

const ensureMermaidInitialized = () => {
  if (mermaidInitialized) {
    return
  }

  mermaid.initialize({
    startOnLoad: false,
    theme: "default",
    securityLevel: "loose",
    themeVariables: {
      fontSize: "12px",
    },
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: "basis",
    },
  })

  mermaidInitialized = true
}

const escapeMermaidLabel = (value: string) => {
  return value.replace(/"/g, '\\"')
}

const toMermaidNodeId = (id: string) => {
  return `node_${id}`
}

const getMermaidNodeClass = (node: TodoItem, rootId: string) => {
  if (node._id === rootId) {
    return "root"
  }

  switch (node.status) {
    case "COMPLETED":
      return "completed"
    case "IN_PROGRESS":
      return "progress"
    case "ARCHIVED":
      return "archived"
    default:
      return "pending"
  }
}

const buildMermaidGraph = (data: TodoSubgraph) => {
  const nodeLines = data.nodes.map(node => {
    const mermaidNodeId = toMermaidNodeId(node._id)
    const statusLabel = statusLabelMap.get(node.status) ?? node.status
    const label = [
      "<div style='padding:2px 4px; line-height:1.2;'>",
      `<div style='font-size:14px; font-weight:500;'>${escapeMermaidLabel(node.name)}</div>`,
      `<div style='font-size:12px; opacity:0.72;'>${escapeMermaidLabel(statusLabel)}</div>`,
      "</div>",
    ].join("")
    const shape = node._id === data.rootId ? `(["${label}"])` : `["${label}"]`
    return `  ${mermaidNodeId}${shape}`
  })

  const edgeLines = data.edges.map(
    edge =>
      `  ${toMermaidNodeId(edge.prerequisiteId)} --> ${toMermaidNodeId(edge.dependentId)}`,
  )

  const classLines = [
    ...data.nodes.map(
      node =>
        `  class ${toMermaidNodeId(node._id)} ${getMermaidNodeClass(node, data.rootId)}`,
    ),
    "  classDef root fill:#102a43,stroke:#102a43,color:#f0f4f8,stroke-width:2px,font-size:12px",
    "  classDef pending fill:#fef3c7,stroke:#d97706,color:#7c2d12,font-size:12px",
    "  classDef progress fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,font-size:12px",
    "  classDef completed fill:#dcfce7,stroke:#16a34a,color:#14532d,font-size:12px",
    "  classDef archived fill:#e5e7eb,stroke:#6b7280,color:#374151,font-size:12px",
  ]

  return ["flowchart LR", ...nodeLines, ...edgeLines, ...classLines].join("\n")
}

export const GraphModal = ({ open, todo, onCancel }: GraphModalProps) => {
  const todoId = todo?._id
  const renderSequenceRef = useRef(0)
  const [isModalReady, setIsModalReady] = useState(false)
  const [graphSvg, setGraphSvg] = useState<string>("")
  const [renderError, setRenderError] = useState<string>("")

  const { data, isFetching, error } = useQuery({
    enabled: open && Boolean(todoId),
    queryKey: ["todo-subgraph", todoId],
    queryFn: async () => {
      if (!todoId) {
        throw new Error("Todo id is required")
      }

      return todoApi.getSubgraph(todoId)
    },
  })

  useEffect(() => {
    if (!open || !isModalReady || !data?.data) {
      return
    }

    ensureMermaidInitialized()

    const mermaidText = buildMermaidGraph(data.data)
    const renderId = `todo-graph-${todoId ?? "unknown"}-${renderSequenceRef.current + 1}`
    renderSequenceRef.current += 1
    let cancelled = false

    const frameId = window.requestAnimationFrame(() => {
      void mermaid
        .render(renderId, mermaidText)
        .then(({ svg }) => {
          if (!cancelled) {
            setGraphSvg(svg)
          }
        })
        .catch(error => {
          if (!cancelled) {
            setRenderError(String(error))
          }
        })
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(frameId)
    }
  }, [data, isModalReady, open, todoId])

  const subgraph = data?.data
  const hasGraph = Boolean(subgraph && subgraph.nodes.length > 0)
  const isRenderingGraph = hasGraph && !graphSvg && !renderError

  return (
    <Modal
      centered
      mask={{ closable: false }}
      closable
      width={960}
      destroyOnHidden
      footer={null}
      title={todo ? `Graph: ${todo.name}` : "Graph"}
      open={open}
      afterOpenChange={nextOpen => {
        setIsModalReady(nextOpen)
        if (nextOpen || !nextOpen) {
          setGraphSvg("")
          setRenderError("")
        }
      }}
      onCancel={onCancel}
      styles={{
        body: {
          minHeight: 360,
        },
      }}
    >
      {isFetching ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : isRenderingGraph ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : renderError ? (
        <Alert type="error" title={`Failed to render graph: ${renderError}`} />
      ) : error ? (
        <Alert
          type="error"
          title={(error as Error).message || "Failed to load graph"}
        />
      ) : hasGraph ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div dangerouslySetInnerHTML={{ __html: graphSvg }} />
        </div>
      ) : (
        <Empty description="No graph data" />
      )}
    </Modal>
  )
}
