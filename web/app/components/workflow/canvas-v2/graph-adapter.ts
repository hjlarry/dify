import type {
  Edge,
  Node,
} from '../types'
import {
  CUSTOM_NODE,
} from '../constants'
import { CUSTOM_ITERATION_START_NODE } from '../nodes/iteration-start/constants'
import { CUSTOM_LOOP_START_NODE } from '../nodes/loop-start/constants'
import { CUSTOM_SIMPLE_NODE } from '../simple-node/constants'
import {
  BlockEnum,
} from '../types'

export type CanvasV2Graph = {
  nodes: Node[]
  edges: Edge[]
}

export const CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY = '_collapsedChildrenCount'
export const CANVAS_V2_HIDDEN_KEY = '_canvasV2Hidden'
export const CANVAS_V2_NODE_WIDTH = 200
export const CANVAS_V2_NODE_HEIGHT = 48

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

const COMPACT_NODE_TYPES = new Set<string>([
  CUSTOM_NODE,
  CUSTOM_SIMPLE_NODE,
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

const isCanvasV2Hidden = (data?: Record<string, unknown>) => {
  return data?.[CANVAS_V2_HIDDEN_KEY] === true
}

const isCanvasV2CompactNode = (node: Node) => {
  return !node.parentId
    && !isCanvasV2Hidden(node.data as Record<string, unknown>)
    && typeof node.type === 'string'
    && COMPACT_NODE_TYPES.has(node.type)
}

const isCanvasV2InternalEdge = (edge: Edge, hiddenNodeIds: Set<string>) => {
  return Boolean(
    hiddenNodeIds.has(edge.source)
    || hiddenNodeIds.has(edge.target)
    || edge.data?.isInIteration
    || edge.data?.isInLoop,
  )
}

const withoutCanvasV2NodeMetadata = (node: Node) => {
  const data = {
    ...node.data,
  } as Node['data'] & Record<string, unknown>
  delete data[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]
  delete data[CANVAS_V2_HIDDEN_KEY]

  return {
    ...node,
    data,
  } as Node
}

const withoutCanvasV2NodeFrame = (node: Node) => {
  const data = {
    ...node.data,
  } as Node['data'] & Record<string, unknown>
  const nextStyle = {
    ...(node.style ?? {}),
  } as Record<string, unknown>
  const nextNode = {
    ...node,
    data,
    style: nextStyle,
  } as Node

  if (nextNode.width === CANVAS_V2_NODE_WIDTH)
    delete nextNode.width
  if (nextNode.height === CANVAS_V2_NODE_HEIGHT)
    delete nextNode.height
  if (nextStyle.width === CANVAS_V2_NODE_WIDTH)
    delete nextStyle.width
  if (nextStyle.height === CANVAS_V2_NODE_HEIGHT)
    delete nextStyle.height
  if (!Object.keys(nextStyle).length)
    delete nextNode.style
  if (data.width === CANVAS_V2_NODE_WIDTH)
    delete data.width
  if (data.height === CANVAS_V2_NODE_HEIGHT)
    delete data.height

  return nextNode
}

const withoutCanvasV2EdgeMetadata = (edge: Edge, stripInteractionState = true) => {
  const data = {
    ...edge.data,
  } as Edge['data'] & Record<string, unknown>

  delete data[CANVAS_V2_HIDDEN_KEY]

  if (!stripInteractionState) {
    return {
      ...edge,
      data,
    } as Edge
  }

  const {
    selected: _selected,
    focusable: _focusable,
    ...edgeWithoutSelection
  } = edge

  return {
    ...edgeWithoutSelection,
    data,
  } as Edge
}

export const getCanvasV2SourceGraph = ({
  nodes,
  edges,
}: CanvasV2Graph): CanvasV2Graph => {
  return {
    nodes: nodes.map(node => withoutCanvasV2NodeFrame(withoutCanvasV2NodeMetadata(node))),
    edges: edges.map(edge => withoutCanvasV2EdgeMetadata(edge)),
  }
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
  const nextEdge = withoutCanvasV2EdgeMetadata(edge, false)
  if (!isCanvasV2InternalEdge(nextEdge, hiddenNodeIds))
    return nextEdge

  const data = {
    ...nextEdge.data,
  } as Edge['data'] & Record<string, unknown>
  data[CANVAS_V2_HIDDEN_KEY] = true

  return {
    ...nextEdge,
    data,
  }
}

const withCompactNodeFrame = (node: Node) => {
  if (!isCanvasV2CompactNode(node))
    return node

  const {
    positionAbsolute: _positionAbsolute,
    ...nodeWithoutAbsolutePosition
  } = node

  return {
    ...nodeWithoutAbsolutePosition,
    width: CANVAS_V2_NODE_WIDTH,
    height: CANVAS_V2_NODE_HEIGHT,
    style: {
      ...node.style,
      width: CANVAS_V2_NODE_WIDTH,
      height: CANVAS_V2_NODE_HEIGHT,
    },
    data: {
      ...node.data,
      width: CANVAS_V2_NODE_WIDTH,
      height: CANVAS_V2_NODE_HEIGHT,
    },
  } as Node
}

export const getCanvasV2Graph = ({
  nodes,
  edges,
}: CanvasV2Graph): CanvasV2Graph => {
  const metadataFreeNodes = nodes.map(withoutCanvasV2NodeMetadata)
  const hiddenNodeIds = new Set(metadataFreeNodes.filter(isCanvasV2InternalNode).map(node => node.id))

  return {
    nodes: metadataFreeNodes
      .map(node => withCompactNodeFrame(withNodeVisibility(node, nodes, hiddenNodeIds))),
    edges: edges.map(edge => withEdgeVisibility(edge, hiddenNodeIds)),
  }
}
