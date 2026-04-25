import type {
  Edge,
  Node,
} from '../../types'
import type { LayoutResult } from '../../utils/elk-layout'
import {
  CUSTOM_NODE,
} from '../../constants'
import { CUSTOM_SIMPLE_NODE } from '../../simple-node/constants'
import { getLayoutByELK } from '../../utils/elk-layout'
import {
  CANVAS_V2_HIDDEN_KEY,
  CANVAS_V2_NODE_HEIGHT,
  CANVAS_V2_NODE_WIDTH,
  getCanvasV2Graph,
} from '../graph-adapter'

type LayoutInfo = LayoutResult['nodes'] extends Map<string, infer T> ? T : never

const isCanvasV2Hidden = (data?: Record<string, unknown>) => {
  return data?.[CANVAS_V2_HIDDEN_KEY] === true
}

const isCanvasV2LayoutNode = (node: Node) => {
  return !node.parentId
    && !isCanvasV2Hidden(node.data as Record<string, unknown>)
    && (node.type === CUSTOM_NODE || node.type === CUSTOM_SIMPLE_NODE)
}

const toLayoutNode = (node: Node): Node => {
  return {
    ...node,
    type: CUSTOM_NODE,
    width: CANVAS_V2_NODE_WIDTH,
    height: CANVAS_V2_NODE_HEIGHT,
    data: {
      ...node.data,
      width: CANVAS_V2_NODE_WIDTH,
      height: CANVAS_V2_NODE_HEIGHT,
    },
  } as Node
}

const getCanvasV2LayoutInput = (nodes: Node[], edges: Edge[]) => {
  const viewGraph = getCanvasV2Graph({ nodes, edges })
  const layoutNodes = viewGraph.nodes
    .filter(isCanvasV2LayoutNode)
    .map(toLayoutNode)
  const layoutNodeIds = new Set(layoutNodes.map(node => node.id))
  const layoutEdges = viewGraph.edges.filter((edge) => {
    return !isCanvasV2Hidden(edge.data as Record<string, unknown>)
      && !edge.data?._isTemp
      && layoutNodeIds.has(edge.source)
      && layoutNodeIds.has(edge.target)
  })

  return {
    layoutNodes,
    layoutEdges,
  }
}

const getUniqueLayoutEdges = (nodes: Node[], edges: Edge[]) => {
  const nodeIds = new Set(nodes.map(node => node.id))
  const uniqueEdges = new Map<string, Edge>()

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      continue

    if (edge.source === edge.target)
      continue

    uniqueEdges.set(`${edge.source}->${edge.target}`, edge)
  }

  return [...uniqueEdges.values()]
}

const getDegreeMaps = (nodes: Node[], edges: Edge[]) => {
  const nodeIds = new Set(nodes.map(node => node.id))
  const inDegree = new Map<string, Set<string>>()
  const outDegree = new Map<string, Set<string>>()

  nodeIds.forEach((id) => {
    inDegree.set(id, new Set())
    outDegree.set(id, new Set())
  })

  for (const edge of edges) {
    inDegree.get(edge.target)!.add(edge.source)
    outDegree.get(edge.source)!.add(edge.target)
  }

  return {
    inDegree,
    outDegree,
  }
}

const getSourceNodeId = (nodes: Node[], edges: Edge[]) => {
  const targetIds = new Set(edges.map(edge => edge.target))
  return nodes.find(node => !targetIds.has(node.id))?.id ?? nodes[0]?.id
}

const getLinearSegmentEdges = (nodes: Node[], edges: Edge[]) => {
  const uniqueEdges = getUniqueLayoutEdges(nodes, edges)
  const {
    inDegree,
    outDegree,
  } = getDegreeMaps(nodes, uniqueEdges)

  return uniqueEdges.filter(edge => (
    outDegree.get(edge.source)?.size === 1
    && inDegree.get(edge.target)?.size === 1
  ))
}

const getAlignmentSegments = (nodes: Node[], edges: Edge[]) => {
  const segmentEdges = getLinearSegmentEdges(nodes, edges)
  if (!segmentEdges.length)
    return []

  const adjacency = new Map<string, string[]>()
  nodes.forEach((node) => {
    adjacency.set(node.id, [])
  })
  segmentEdges.forEach((edge) => {
    adjacency.get(edge.source)!.push(edge.target)
    adjacency.get(edge.target)!.push(edge.source)
  })

  const visited = new Set<string>()
  const segments: Array<{
    nodes: Node[]
    edges: Edge[]
  }> = []

  for (const node of nodes) {
    if (visited.has(node.id) || !adjacency.get(node.id)?.length)
      continue

    const segmentNodeIds = new Set<string>()
    const stack = [node.id]

    while (stack.length) {
      const id = stack.pop()!
      if (visited.has(id))
        continue

      visited.add(id)
      segmentNodeIds.add(id)
      adjacency.get(id)!.forEach((nextId) => {
        if (!visited.has(nextId))
          stack.push(nextId)
      })
    }

    const segmentNodes = nodes.filter(item => segmentNodeIds.has(item.id))
    const segmentNodeIdSet = new Set(segmentNodes.map(item => item.id))
    const segmentEdgesForNodes = segmentEdges.filter(edge => segmentNodeIdSet.has(edge.source) && segmentNodeIdSet.has(edge.target))

    segments.push({
      nodes: segmentNodes,
      edges: segmentEdgesForNodes,
    })
  }

  return segments
}

const getLinearBaselineY = (layout: LayoutResult, nodes: Node[], edges: Edge[]) => {
  const sourceNodeId = getSourceNodeId(nodes, edges)
  if (!sourceNodeId)
    return undefined

  return layout.nodes.get(sourceNodeId)?.y
}

const getLinearBaselineYByNodeId = (layout: LayoutResult, nodes: Node[], edges: Edge[]) => {
  const baselineYByNodeId = new Map<string, number>()
  const alignmentSegments = getAlignmentSegments(nodes, edges)

  for (const segment of alignmentSegments) {
    const baselineY = getLinearBaselineY(layout, segment.nodes, segment.edges)
    if (baselineY === undefined)
      continue

    segment.nodes.forEach((node) => {
      baselineYByNodeId.set(node.id, baselineY)
    })
  }

  return baselineYByNodeId
}

const getCanvasV2YPosition = (layoutInfo: LayoutInfo, linearBaselineY?: number) => {
  return linearBaselineY ?? layoutInfo.y
}

const applyCanvasV2LayoutPosition = (node: Node, position: Node['position']) => {
  const {
    positionAbsolute: _positionAbsolute,
    ...nodeWithoutAbsolutePosition
  } = node

  return {
    ...nodeWithoutAbsolutePosition,
    position,
  } as Node
}

export const getCanvasV2LayoutNodes = async (nodes: Node[], edges: Edge[]) => {
  const {
    layoutNodes,
    layoutEdges,
  } = getCanvasV2LayoutInput(nodes, edges)

  if (!layoutNodes.length)
    return nodes

  const layout = await getLayoutByELK(layoutNodes, layoutEdges)
  const linearBaselineYByNodeId = getLinearBaselineYByNodeId(layout, layoutNodes, layoutEdges)

  const nextNodes = nodes.map((node) => {
    if (!isCanvasV2LayoutNode(node))
      return node

    const layoutInfo = layout.nodes.get(node.id)
    if (!layoutInfo)
      return node

    return applyCanvasV2LayoutPosition(node, {
      x: layoutInfo.x,
      y: getCanvasV2YPosition(layoutInfo, linearBaselineYByNodeId.get(node.id)),
    })
  })

  return nextNodes
}
