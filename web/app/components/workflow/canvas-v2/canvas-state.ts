import type { NodeChange } from 'reactflow'
import type {
  Edge,
  Node,
} from '../types'
import { ControlMode } from '../types'

export type WorkflowGraph = {
  nodes: Node[]
  edges: Edge[]
}

export const getGraphNodeChanges = (changes: NodeChange[]) => {
  return changes.filter(change => change.type !== 'dimensions')
}

export const isSelectNodeChange = (change: NodeChange): change is Extract<NodeChange, { type: 'select' }> => {
  return change.type === 'select'
}

export const getSelectableGraphNodeChanges = (changes: NodeChange[], controlMode: unknown) => {
  if (controlMode !== ControlMode.Comment)
    return changes

  return changes.filter(change => !isSelectNodeChange(change))
}

export const withSelectedNodeData = (nodes: Node[], changes: NodeChange[]) => {
  const selectChanges = changes.filter(isSelectNodeChange)
  if (!selectChanges.length)
    return nodes

  const selectedChangeIds = new Set(selectChanges.filter(change => change.selected).map(change => change.id))

  return nodes.map((node) => {
    const selected = selectedChangeIds.size > 0 ? selectedChangeIds.has(node.id) : Boolean(node.selected)

    if (node.data.selected === selected && node.selected === selected)
      return node

    return {
      ...node,
      selected,
      data: {
        ...node.data,
        selected,
      },
    }
  })
}

export const withConnectedNodeSelection = (edges: Edge[], nodes: Node[]) => {
  const selectedNodeIds = new Set(nodes.filter(node => node.data.selected).map(node => node.id))

  return edges.map((edge) => {
    const connectedNodeIsSelected = selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
    const edgeData = edge.data as Edge['data'] & Record<string, unknown>

    if (edgeData?._connectedNodeIsSelected === connectedNodeIsSelected)
      return edge

    return {
      ...edge,
      data: {
        ...edge.data,
        _connectedNodeIsSelected: connectedNodeIsSelected,
      } as Edge['data'],
    }
  })
}

export const withSelectedGraphNode = (graph: WorkflowGraph, nodeId: string): WorkflowGraph => {
  const nodes = graph.nodes.map((node) => {
    const selected = node.id === nodeId

    if (node.data.selected === selected && node.selected === selected)
      return node

    return {
      ...node,
      selected,
      data: {
        ...node.data,
        selected,
      },
    } as Node
  })

  return {
    nodes,
    edges: withConnectedNodeSelection(graph.edges, nodes),
  }
}
