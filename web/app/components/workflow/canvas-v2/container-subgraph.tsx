import type { FC } from 'react'
import type {
  Edge,
  Node,
} from '../types'
import type { ContainerSubgraphGraphChange } from './container-subgraph-node'
import { Button } from '@langgenius/dify-ui/button'
import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useStore } from '../store'
import { BlockEnum } from '../types'
import { SubgraphBranchTree } from './container-subgraph-branch-tree'
import { SubgraphLinearFlow } from './container-subgraph-linear-flow'
import {
  SubgraphTitle,
} from './container-subgraph-node'
import {
  getContainerSubgraphNodeTitle,
  getInternalEdges,
  getSortedContainerChildren,
  getSubgraphRootNode,
  hasBranchedInternalEdges,
} from './container-subgraph-utils'

type ContainerSubgraphProps = {
  containerId: string
  edges: Edge[]
  nodes: Node[]
  onClose: () => void
  onGraphChange: ContainerSubgraphGraphChange
  onSelectNode: (nodeId: string) => void
}

const CONTAINER_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.Iteration,
  BlockEnum.Loop,
])

const DEFAULT_NODE_PANEL_WIDTH = 400
const SUBGRAPH_PANEL_GAP = 40

const ContainerSubgraph: FC<ContainerSubgraphProps> = ({
  containerId,
  edges,
  nodes,
  onClose,
  onGraphChange,
  onSelectNode,
}) => {
  const { t } = useTranslation()
  const nodePanelWidth = useStore(s => s.nodePanelWidth)
  const containerNode = nodes.find(node => node.id === containerId && CONTAINER_NODE_TYPES.has(node.data.type))
  const children = useMemo(() => {
    if (!containerNode)
      return []

    return getSortedContainerChildren(containerNode, nodes, edges)
  }, [containerNode, edges, nodes])
  const internalEdges = useMemo(() => getInternalEdges(containerId, children, edges), [children, containerId, edges])
  const childNodeById = useMemo(() => new Map(children.map(node => [node.id, node])), [children])
  const rootNode = useMemo(() => {
    if (!containerNode)
      return undefined

    return getSubgraphRootNode(children, containerNode)
  }, [children, containerNode])
  const shouldRenderBranchLayout = useMemo(() => {
    return hasBranchedInternalEdges(internalEdges, childNodeById)
  }, [childNodeById, internalEdges])

  if (!containerNode)
    return null

  const title = getContainerSubgraphNodeTitle(containerNode, t)
  const reservedRightWidth = (typeof nodePanelWidth === 'number' ? nodePanelWidth : DEFAULT_NODE_PANEL_WIDTH) + SUBGRAPH_PANEL_GAP

  return (
    <div
      data-testid="workflow-canvas-v2-container-subgraph"
      className="absolute top-4 bottom-4 left-4 z-20 flex min-w-[560px] flex-col overflow-hidden rounded-xl border border-effects-highlight bg-background-default shadow-lg"
      style={{ width: `min(960px, calc(100% - ${reservedRightWidth}px))` }}
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider-subtle px-4">
        <SubgraphTitle
          node={containerNode}
          title={title}
          onSelect={onSelectNode}
        />
        <Button
          size="small"
          variant="ghost"
          onClick={onClose}
          aria-label={t('operation.close', { ns: 'common' })}
        >
          <span className="i-ri-close-line size-4" />
        </Button>
      </div>
      <div className="grow overflow-auto bg-workflow-canvas-workflow-bg">
        {children.length > 0
          ? (
              shouldRenderBranchLayout && rootNode
                ? (
                    <SubgraphBranchTree
                      internalEdges={internalEdges}
                      onGraphChange={onGraphChange}
                      onSelect={onSelectNode}
                      rootNode={rootNode}
                      subgraphNodes={children}
                    />
                  )
                : (
                    <SubgraphLinearFlow
                      internalEdges={internalEdges}
                      onGraphChange={onGraphChange}
                      onSelect={onSelectNode}
                      subgraphNodes={children}
                    />
                  )
            )
          : (
              <div className="flex h-full items-center justify-center system-sm-regular text-text-tertiary">
                {t('canvasV2.containerSubgraph.empty', { ns: 'workflow' })}
              </div>
            )}
      </div>
    </div>
  )
}

export default memo(ContainerSubgraph)
