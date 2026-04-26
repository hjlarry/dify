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

const getTopologicalRankByNodeId = (nodes: Node[], edges: Edge[]) => {
  const uniqueEdges = getUniqueLayoutEdges(nodes, edges)
  const nodeIds = new Set(nodes.map(node => node.id))
  const rankByNodeId = new Map<string, number>()
  const indegreeByNodeId = new Map<string, number>()
  const outgoingEdgesByNodeId = new Map<string, Edge[]>()

  nodes.forEach((node) => {
    rankByNodeId.set(node.id, 0)
    indegreeByNodeId.set(node.id, 0)
    outgoingEdgesByNodeId.set(node.id, [])
  })

  uniqueEdges.forEach((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target))
      return

    indegreeByNodeId.set(edge.target, (indegreeByNodeId.get(edge.target) ?? 0) + 1)
    outgoingEdgesByNodeId.get(edge.source)!.push(edge)
  })

  const queue = nodes
    .filter(node => indegreeByNodeId.get(node.id) === 0)
    .map(node => node.id)
  let visitedCount = 0

  while (queue.length) {
    const nodeId = queue.shift()!
    visitedCount += 1
    const sourceRank = rankByNodeId.get(nodeId) ?? 0

    outgoingEdgesByNodeId.get(nodeId)!.forEach((edge) => {
      rankByNodeId.set(edge.target, Math.max(rankByNodeId.get(edge.target) ?? 0, sourceRank + 1))
      indegreeByNodeId.set(edge.target, (indegreeByNodeId.get(edge.target) ?? 0) - 1)

      if (indegreeByNodeId.get(edge.target) === 0)
        queue.push(edge.target)
    })
  }

  if (visitedCount !== nodes.length)
    return undefined

  return rankByNodeId
}

const getFallbackRankByNodeId = (layout: LayoutResult, nodes: Node[]) => {
  const rankByNodeId = new Map<string, number>()
  const sortedColumnXs = [...new Set(nodes
    .map(node => layout.nodes.get(node.id)?.x)
    .filter((x): x is number => typeof x === 'number')
    .sort((a, b) => a - b))]

  nodes.forEach((node) => {
    const layoutInfo = layout.nodes.get(node.id)
    if (!layoutInfo)
      return

    rankByNodeId.set(node.id, sortedColumnXs.indexOf(layoutInfo.x))
  })

  return rankByNodeId
}

const getRankByNodeId = (layout: LayoutResult, nodes: Node[], edges: Edge[]) => {
  return getTopologicalRankByNodeId(nodes, edges) ?? getFallbackRankByNodeId(layout, nodes)
}

const getColumnXByNodeId = (layout: LayoutResult, nodes: Node[], edges: Edge[]) => {
  const rankByNodeId = getRankByNodeId(layout, nodes, edges)
  const minXByRank = new Map<number, number>()

  nodes.forEach((node) => {
    const rank = rankByNodeId.get(node.id)
    const layoutInfo = layout.nodes.get(node.id)

    if (rank === undefined || !layoutInfo)
      return

    minXByRank.set(rank, Math.min(minXByRank.get(rank) ?? layoutInfo.x, layoutInfo.x))
  })

  const xByRank = new Map<number, number>()
  const sortedRanks = [...minXByRank.keys()].sort((a, b) => a - b)

  sortedRanks.forEach((rank) => {
    xByRank.set(rank, minXByRank.get(rank)!)
  })

  const xByNodeId = new Map<string, number>()
  nodes.forEach((node) => {
    const rank = rankByNodeId.get(node.id)
    if (rank === undefined)
      return

    const x = xByRank.get(rank)
    if (x !== undefined)
      xByNodeId.set(node.id, x)
  })

  return xByNodeId
}

const getLayoutCenterY = (layoutInfo: LayoutInfo) => {
  return layoutInfo.y + layoutInfo.height / 2
}

const getBranchMedianBaselineYByNodeId = (layout: LayoutResult, nodes: Node[], edges: Edge[]) => {
  const baselineYByNodeId = new Map<string, number>()
  const uniqueEdges = getUniqueLayoutEdges(nodes, edges)
  const outgoingTargetIdsBySourceId = new Map<string, Set<string>>()

  uniqueEdges.forEach((edge) => {
    const targetIds = outgoingTargetIdsBySourceId.get(edge.source) ?? new Set<string>()
    targetIds.add(edge.target)
    outgoingTargetIdsBySourceId.set(edge.source, targetIds)
  })

  outgoingTargetIdsBySourceId.forEach((targetIds, sourceId) => {
    if (targetIds.size < 3 || targetIds.size % 2 === 0)
      return

    const sourceLayout = layout.nodes.get(sourceId)
    if (!sourceLayout)
      return

    const targetLayouts = [...targetIds]
      .map(targetId => layout.nodes.get(targetId))
      .filter((layoutInfo): layoutInfo is LayoutInfo => !!layoutInfo)
      .sort((a, b) => a.y - b.y || a.x - b.x)

    if (targetLayouts.length !== targetIds.size)
      return

    const medianTargetLayout = targetLayouts[Math.floor(targetLayouts.length / 2)]!
    baselineYByNodeId.set(
      sourceId,
      getLayoutCenterY(medianTargetLayout) - sourceLayout.height / 2,
    )
  })

  return baselineYByNodeId
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

const getLinearBaselineY = (
  layout: LayoutResult,
  nodes: Node[],
  edges: Edge[],
  branchMedianBaselineYByNodeId: Map<string, number>,
) => {
  const downstreamBranchAnchor = nodes
    .map((node) => {
      const baselineY = branchMedianBaselineYByNodeId.get(node.id)
      const layoutInfo = layout.nodes.get(node.id)

      if (baselineY === undefined || !layoutInfo)
        return undefined

      return {
        baselineY,
        layoutInfo,
      }
    })
    .filter((anchor): anchor is { baselineY: number, layoutInfo: LayoutInfo } => !!anchor)
    .sort((a, b) => b.layoutInfo.x - a.layoutInfo.x || b.layoutInfo.y - a.layoutInfo.y)[0]

  if (downstreamBranchAnchor)
    return downstreamBranchAnchor.baselineY

  const sourceNodeId = getSourceNodeId(nodes, edges)
  if (!sourceNodeId)
    return undefined

  return layout.nodes.get(sourceNodeId)?.y
}

const getLinearBaselineYByNodeId = (
  layout: LayoutResult,
  nodes: Node[],
  edges: Edge[],
  branchMedianBaselineYByNodeId: Map<string, number>,
) => {
  const baselineYByNodeId = new Map<string, number>()
  const alignmentSegments = getAlignmentSegments(nodes, edges)

  for (const segment of alignmentSegments) {
    const baselineY = getLinearBaselineY(layout, segment.nodes, segment.edges, branchMedianBaselineYByNodeId)
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
  const columnXByNodeId = getColumnXByNodeId(layout, layoutNodes, layoutEdges)
  const branchMedianBaselineYByNodeId = getBranchMedianBaselineYByNodeId(layout, layoutNodes, layoutEdges)
  const linearBaselineYByNodeId = getLinearBaselineYByNodeId(layout, layoutNodes, layoutEdges, branchMedianBaselineYByNodeId)

  const nextNodes = nodes.map((node) => {
    if (!isCanvasV2LayoutNode(node))
      return node

    const layoutInfo = layout.nodes.get(node.id)
    if (!layoutInfo)
      return node

    return applyCanvasV2LayoutPosition(node, {
      x: columnXByNodeId.get(node.id) ?? layoutInfo.x,
      y: getCanvasV2YPosition(
        layoutInfo,
        linearBaselineYByNodeId.get(node.id) ?? branchMedianBaselineYByNodeId.get(node.id),
      ),
    })
  })

  return nextNodes
}
