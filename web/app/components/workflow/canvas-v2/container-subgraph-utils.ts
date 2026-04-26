import type {
  Edge,
  Node,
} from '../types'
import { BlockEnum } from '../types'
import { getCanvasV2BranchOrder } from './edges/branch-label'

export type SharedBranchMerge = {
  branchEndEdgesBySourceId: Map<string, Edge>
  node: Node
}

type WorkflowT = (key: string, options?: { ns: string }) => string

const CONTAINER_START_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.IterationStart,
  BlockEnum.LoopStart,
])

export const getContainerSubgraphNodeTitle = (node: Node, t: WorkflowT) => {
  return node.data.title || t(`blocks.${node.data.type}`, { ns: 'workflow' })
}

export const getContainerStartNodeId = (containerNode: Node) => {
  return 'start_node_id' in containerNode.data && typeof containerNode.data.start_node_id === 'string'
    ? containerNode.data.start_node_id
    : undefined
}

export const getContainerChildren = (containerNode: Node, nodes: Node[]) => {
  const directChildren = nodes.filter(node => node.parentId === containerNode.id)
  if (directChildren.length)
    return directChildren

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const children = containerNode.data._children
    ?.map(child => nodeById.get(child.nodeId))
    .filter((node): node is Node => Boolean(node)) ?? []
  const startNodeId = getContainerStartNodeId(containerNode)
  const startNode = startNodeId ? nodeById.get(startNodeId) : undefined

  if (!startNode || children.some(child => child.id === startNode.id))
    return children

  return [startNode, ...children]
}

export const sortContainerChildrenByPosition = (children: Node[], startNodeId?: string) => {
  return [...children].sort((a, b) => {
    if (a.id === startNodeId)
      return -1
    if (b.id === startNodeId)
      return 1
    if (CONTAINER_START_NODE_TYPES.has(a.data.type))
      return -1
    if (CONTAINER_START_NODE_TYPES.has(b.data.type))
      return 1

    return a.position.x - b.position.x || a.position.y - b.position.y
  })
}

export const sortOutgoingEdges = (edges: Edge[], nodeById: Map<string, Node>, sourceNode?: Node) => {
  return [...edges].sort((a, b) => {
    const aTarget = nodeById.get(a.target)
    const bTarget = nodeById.get(b.target)
    const branchOrder = getCanvasV2BranchOrder({
      sourceNodeData: sourceNode?.data,
      sourceHandleId: a.sourceHandle || 'source',
    }) - getCanvasV2BranchOrder({
      sourceNodeData: sourceNode?.data,
      sourceHandleId: b.sourceHandle || 'source',
    })

    if (branchOrder !== 0)
      return branchOrder

    if (!aTarget || !bTarget)
      return (a.sourceHandle || 'source').localeCompare(b.sourceHandle || 'source')

    return aTarget.position.y - bTarget.position.y
      || aTarget.position.x - bTarget.position.x
      || (a.sourceHandle || 'source').localeCompare(b.sourceHandle || 'source')
  })
}

export const getInternalEdges = (containerId: string, children: Node[], edges: Edge[]) => {
  const childIds = new Set(children.map(node => node.id))

  return edges.filter((edge) => {
    if (!childIds.has(edge.source) || !childIds.has(edge.target))
      return false

    return edge.data?.iteration_id === containerId
      || edge.data?.loop_id === containerId
      || edge.data?.isInIteration
      || edge.data?.isInLoop
      || children.some(node => node.parentId === containerId)
  })
}

export const isContainerStartNode = (node: Node) => {
  return CONTAINER_START_NODE_TYPES.has(node.data.type)
}

export const getInternalEdgesBySource = (internalEdges: Edge[], nodeById: Map<string, Node>) => {
  return internalEdges.reduce<Map<string, Edge[]>>((result, edge) => {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target))
      return result

    const sourceEdges = result.get(edge.source) ?? []
    sourceEdges.push(edge)
    result.set(edge.source, sourceEdges)

    return result
  }, new Map())
}

export const getEdgeSortedContainerChildren = (children: Node[], internalEdges: Edge[], startNodeId?: string) => {
  const nodeById = new Map(children.map(node => [node.id, node]))
  const startNode = (startNodeId ? nodeById.get(startNodeId) : undefined)
    ?? children.find(isContainerStartNode)

  if (!startNode)
    return []

  const edgesBySource = getInternalEdgesBySource(internalEdges, nodeById)
  const orderedNodes: Node[] = []
  const visitedNodeIds = new Set<string>()
  const visit = (node: Node) => {
    if (visitedNodeIds.has(node.id))
      return

    visitedNodeIds.add(node.id)
    orderedNodes.push(node)

    const outgoingEdges = sortOutgoingEdges(edgesBySource.get(node.id) ?? [], nodeById, node)

    outgoingEdges.forEach((edge) => {
      const targetNode = nodeById.get(edge.target)
      if (targetNode)
        visit(targetNode)
    })
  }

  visit(startNode)

  return orderedNodes
}

export const getSortedContainerChildren = (containerNode: Node, nodes: Node[], edges: Edge[]) => {
  const startNodeId = getContainerStartNodeId(containerNode)
  const children = getContainerChildren(containerNode, nodes)
  const fallbackChildren = sortContainerChildrenByPosition(children, startNodeId)
  const edgeSortedChildren = getEdgeSortedContainerChildren(
    children,
    getInternalEdges(containerNode.id, children, edges),
    startNodeId,
  )

  if (!edgeSortedChildren.length)
    return fallbackChildren

  const edgeSortedNodeIds = new Set(edgeSortedChildren.map(node => node.id))

  return [
    ...edgeSortedChildren,
    ...fallbackChildren.filter(node => !edgeSortedNodeIds.has(node.id)),
  ]
}

export const findEdgeBetween = (edges: Edge[], sourceNode: Node, targetNode: Node) => {
  return edges.find(edge => edge.source === sourceNode.id && edge.target === targetNode.id)
}

export const hasBranchedInternalEdges = (internalEdges: Edge[], nodeById: Map<string, Node>) => {
  const edgesBySource = getInternalEdgesBySource(internalEdges, nodeById)

  return Array.from(edgesBySource.values()).some(edges => edges.length > 1)
}

export const getSubgraphRootNode = (children: Node[], containerNode: Node) => {
  const startNodeId = getContainerStartNodeId(containerNode)

  return (startNodeId ? children.find(node => node.id === startNodeId) : undefined)
    ?? children.find(isContainerStartNode)
    ?? children[0]
}

export const getSharedBranchMerge = ({
  edgesBySource,
  nodeById,
  outgoingEdges,
}: {
  edgesBySource: Map<string, Edge[]>
  nodeById: Map<string, Node>
  outgoingEdges: Edge[]
}): SharedBranchMerge | undefined => {
  if (outgoingEdges.length < 2)
    return undefined

  const branchEndEdgesBySourceId = new Map<string, Edge>()
  let mergeNodeId: string | undefined

  for (const edge of outgoingEdges) {
    const branchNode = nodeById.get(edge.target)
    if (!branchNode)
      return undefined

    const branchOutgoingEdges = sortOutgoingEdges(edgesBySource.get(branchNode.id) ?? [], nodeById, branchNode)
    if (branchOutgoingEdges.length !== 1)
      return undefined

    const branchEndEdge = branchOutgoingEdges[0]!
    if (!mergeNodeId) {
      mergeNodeId = branchEndEdge.target
    }
    else if (mergeNodeId !== branchEndEdge.target) {
      return undefined
    }

    branchEndEdgesBySourceId.set(branchNode.id, branchEndEdge)
  }

  const mergeNode = mergeNodeId ? nodeById.get(mergeNodeId) : undefined
  if (!mergeNode)
    return undefined

  return {
    branchEndEdgesBySourceId,
    node: mergeNode,
  }
}
