import type {
  Edge,
  Node,
} from '../types'
import type { ContainerSubgraphGraphChange } from './container-subgraph-node'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AddBlockButton,
  SubgraphConnection,
  SubgraphNodeCard,
} from './container-subgraph-node'
import {
  getInternalEdgesBySource,
  getSharedBranchMerge,
  sortOutgoingEdges,
} from './container-subgraph-utils'
import { getCanvasV2BranchLabel } from './edges/branch-label'

type SubgraphBranchTreeProps = {
  internalEdges: Edge[]
  onGraphChange: ContainerSubgraphGraphChange
  onSelect: (nodeId: string) => void
  rootNode: Node
  subgraphNodes: Node[]
}

type SubgraphBranchNodeProps = {
  edgesBySource: Map<string, Edge[]>
  node: Node
  nodeById: Map<string, Node>
  onGraphChange: ContainerSubgraphGraphChange
  onSelect: (nodeId: string) => void
  pathNodeIds?: Set<string>
}

const SubgraphBranchEdgeConnection = ({
  edge,
  showLabel = true,
  sourceNode,
}: {
  edge: Edge
  showLabel?: boolean
  sourceNode: Node
}) => {
  const { t } = useTranslation()
  const label = showLabel
    ? getCanvasV2BranchLabel({
        sourceNodeData: sourceNode.data,
        sourceHandleId: edge.sourceHandle || 'source',
        failBranchLabel: t('nodes.common.errorHandle.failBranch.title', { ns: 'workflow' }),
      })
    : undefined

  return <SubgraphConnection label={label} />
}

const SubgraphBranchNode = ({
  edgesBySource,
  node,
  nodeById,
  onGraphChange,
  onSelect,
  pathNodeIds = new Set<string>(),
}: SubgraphBranchNodeProps) => {
  const isCircularPath = pathNodeIds.has(node.id)
  const outgoingEdges = isCircularPath
    ? []
    : sortOutgoingEdges(edgesBySource.get(node.id) ?? [], nodeById, node)
  const nextPathNodeIds = new Set(pathNodeIds)
  nextPathNodeIds.add(node.id)
  const shownBranchHandleIds = new Set<string>()
  const sharedMerge = getSharedBranchMerge({
    edgesBySource,
    nodeById,
    outgoingEdges,
  })
  const mergePathNodeIds = new Set(nextPathNodeIds)

  if (outgoingEdges.length === 0) {
    return (
      <div className="flex items-center">
        <SubgraphNodeCard
          node={node}
          onGraphChange={onGraphChange}
          onSelect={onSelect}
        />
        <AddBlockButton
          sourceNode={node}
          onGraphChange={onGraphChange}
          variant="terminal"
        />
      </div>
    )
  }

  if (outgoingEdges.length === 1) {
    const edge = outgoingEdges[0]!
    const nextNode = nodeById.get(edge.target)

    if (!nextNode) {
      return (
        <SubgraphNodeCard
          node={node}
          onGraphChange={onGraphChange}
          onSelect={onSelect}
        />
      )
    }

    return (
      <div className="flex items-center">
        <SubgraphNodeCard
          edge={edge}
          nextNode={nextNode}
          node={node}
          onGraphChange={onGraphChange}
          onSelect={onSelect}
        />
        <SubgraphBranchEdgeConnection
          edge={edge}
          sourceNode={node}
        />
        <SubgraphBranchNode
          edgesBySource={edgesBySource}
          node={nextNode}
          nodeById={nodeById}
          onGraphChange={onGraphChange}
          onSelect={onSelect}
          pathNodeIds={nextPathNodeIds}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center">
      <SubgraphNodeCard
        node={node}
        onGraphChange={onGraphChange}
        onSelect={onSelect}
        showAddButton={false}
      />
      <SubgraphConnection />
      <div className="relative flex flex-col gap-6">
        <div
          data-testid="workflow-canvas-v2-container-subgraph-branch-spine"
          className="absolute top-6 bottom-6 left-0 w-0.5 bg-workflow-link-line-normal"
        />
        {outgoingEdges.map((edge) => {
          const nextNode = nodeById.get(edge.target)
          if (!nextNode)
            return null

          const branchHandleId = edge.sourceHandle || 'source'
          const showLabel = !shownBranchHandleIds.has(branchHandleId)
          shownBranchHandleIds.add(branchHandleId)
          const branchEndEdge = sharedMerge?.branchEndEdgesBySourceId.get(nextNode.id)
          if (branchEndEdge)
            mergePathNodeIds.add(nextNode.id)

          return (
            <div
              key={edge.id}
              data-testid="workflow-canvas-v2-container-subgraph-branch"
              className="relative flex items-center"
            >
              <SubgraphBranchEdgeConnection
                edge={edge}
                showLabel={showLabel}
                sourceNode={node}
              />
              {branchEndEdge && sharedMerge
                ? (
                    <SubgraphNodeCard
                      edge={branchEndEdge}
                      nextNode={sharedMerge.node}
                      node={nextNode}
                      onGraphChange={onGraphChange}
                      onSelect={onSelect}
                    />
                  )
                : (
                    <SubgraphBranchNode
                      edgesBySource={edgesBySource}
                      node={nextNode}
                      nodeById={nodeById}
                      onGraphChange={onGraphChange}
                      onSelect={onSelect}
                      pathNodeIds={nextPathNodeIds}
                    />
                  )}
            </div>
          )
        })}
      </div>
      {sharedMerge && (
        <div
          data-testid="workflow-canvas-v2-container-subgraph-merge"
          className="flex items-center"
        >
          <SubgraphConnection />
          <SubgraphBranchNode
            edgesBySource={edgesBySource}
            node={sharedMerge.node}
            nodeById={nodeById}
            onGraphChange={onGraphChange}
            onSelect={onSelect}
            pathNodeIds={mergePathNodeIds}
          />
        </div>
      )}
    </div>
  )
}

export const SubgraphBranchTree = ({
  internalEdges,
  onGraphChange,
  onSelect,
  rootNode,
  subgraphNodes,
}: SubgraphBranchTreeProps) => {
  const nodeById = useMemo(() => new Map(subgraphNodes.map(node => [node.id, node])), [subgraphNodes])
  const edgesBySource = useMemo(() => getInternalEdgesBySource(internalEdges, nodeById), [internalEdges, nodeById])

  return (
    <div
      data-testid="workflow-canvas-v2-container-subgraph-branch-layout"
      className="flex min-h-full min-w-max items-center p-8"
    >
      <SubgraphBranchNode
        edgesBySource={edgesBySource}
        node={rootNode}
        nodeById={nodeById}
        onGraphChange={onGraphChange}
        onSelect={onSelect}
      />
    </div>
  )
}
