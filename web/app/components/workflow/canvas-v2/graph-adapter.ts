import type {
  Edge,
  Node,
} from '../types'
import { CUSTOM_ITERATION_START_NODE } from '../nodes/iteration-start/constants'
import { CUSTOM_LOOP_START_NODE } from '../nodes/loop-start/constants'
import {
  BlockEnum,
} from '../types'

export type CanvasV2Graph = {
  nodes: Node[]
  edges: Edge[]
}

export const CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY = '_collapsedChildrenCount'
export const CANVAS_V2_HIDDEN_KEY = '_canvasV2Hidden'

const CONTAINER_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.Iteration,
  BlockEnum.Loop,
])

const CONTAINER_START_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.IterationStart,
  BlockEnum.LoopStart,
])

const CONTAINER_START_CUSTOM_NODE_TYPES = new Set<string>([
  CUSTOM_ITERATION_START_NODE,
  CUSTOM_LOOP_START_NODE,
])

const isContainerNode = (node: Node) => {
  return CONTAINER_NODE_TYPES.has(node.data.type)
}

const isContainerStartNode = (node: Pick<Node, 'type' | 'data'>) => {
  return CONTAINER_START_NODE_TYPES.has(node.data.type)
    || (typeof node.type === 'string' && CONTAINER_START_CUSTOM_NODE_TYPES.has(node.type))
}

const getFallbackChildCount = (node: Node) => {
  return node.data._children?.filter(child => !CONTAINER_START_NODE_TYPES.has(child.nodeType)).length ?? 0
}

const getCollapsedChildrenCount = (containerNode: Node, nodes: Node[]) => {
  const directChildren = nodes.filter(node => node.parentId === containerNode.id)
  if (!directChildren.length)
    return getFallbackChildCount(containerNode)

  return directChildren.filter(node => !isContainerStartNode(node)).length
}

const isCanvasV2InternalNode = (node: Node) => {
  return Boolean(node.parentId || node.data.isInIteration || node.data.isInLoop)
}

const isCanvasV2InternalEdge = (edge: Edge, hiddenNodeIds: Set<string>) => {
  return Boolean(
    hiddenNodeIds.has(edge.source)
    || hiddenNodeIds.has(edge.target)
    || edge.data?.isInIteration
    || edge.data?.isInLoop,
  )
}

const withContainerMetadata = (node: Node, nodes: Node[]) => {
  if (!isContainerNode(node))
    return node

  const data = {
    ...node.data,
  } as Node['data'] & Record<string, unknown>
  data[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY] = getCollapsedChildrenCount(node, nodes)

  return {
    ...node,
    data,
  } as Node
}

const withNodeVisibility = (node: Node, nodes: Node[], hiddenNodeIds: Set<string>) => {
  const nextNode = withContainerMetadata(node, nodes)
  if (!hiddenNodeIds.has(node.id))
    return nextNode

  const data = {
    ...nextNode.data,
  } as Node['data'] & Record<string, unknown>
  data[CANVAS_V2_HIDDEN_KEY] = true

  return {
    ...nextNode,
    data,
  }
}

const withEdgeVisibility = (edge: Edge, hiddenNodeIds: Set<string>) => {
  if (!isCanvasV2InternalEdge(edge, hiddenNodeIds))
    return edge

  const data = {
    ...edge.data,
  } as Edge['data'] & Record<string, unknown>
  data[CANVAS_V2_HIDDEN_KEY] = true

  return {
    ...edge,
    data,
  }
}

export const getCanvasV2Graph = ({
  nodes,
  edges,
}: CanvasV2Graph): CanvasV2Graph => {
  const hiddenNodeIds = new Set(nodes.filter(isCanvasV2InternalNode).map(node => node.id))

  return {
    nodes: nodes
      .map(node => withNodeVisibility(node, nodes, hiddenNodeIds)),
    edges: edges.map(edge => withEdgeVisibility(edge, hiddenNodeIds)),
  }
}
