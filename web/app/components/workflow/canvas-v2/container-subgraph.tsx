import type { FC } from 'react'
import type {
  Edge,
  Node,
  OnSelectBlock,
} from '../types'
import { Button } from '@langgenius/dify-ui/button'
import { cn } from '@langgenius/dify-ui/cn'
import { intersection } from 'es-toolkit/array'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactFlow } from 'reactflow'
import BlockIcon from '../block-icon'
import BlockSelector from '../block-selector'
import {
  useAvailableBlocks,
  useNodesInteractions,
  useNodesReadOnly,
} from '../hooks'
import { useStore } from '../store'
import {
  BlockEnum,
} from '../types'
import { getCanvasV2SourceGraph } from './graph-adapter'
import {
  CANVAS_V2_NODE_ADD_ICON_CLASS_NAME,
  getCanvasV2NodeAddTriggerClassName,
} from './nodes/node-add-trigger'

type ContainerSubgraphProps = {
  containerId: string
  edges: Edge[]
  nodes: Node[]
  onClose: () => void
  onGraphChange: (graph: { nodes: Node[], edges: Edge[] }) => void
  onSelectNode: (nodeId: string) => void
}

type AddBlockButtonProps = {
  edge?: Edge
  onGraphChange: (graph: { nodes: Node[], edges: Edge[] }) => void
  sourceNode: Node
  targetNode?: Node
  variant?: 'node' | 'terminal'
}

const CONTAINER_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.Iteration,
  BlockEnum.Loop,
])

const CONTAINER_START_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.IterationStart,
  BlockEnum.LoopStart,
])

const DEFAULT_NODE_PANEL_WIDTH = 400
const SUBGRAPH_PANEL_GAP = 40

const getNodeTitle = (node: Node, t: (key: string, options?: { ns: string }) => string) => {
  return node.data.title || t(`blocks.${node.data.type}`, { ns: 'workflow' })
}

const getContainerChildren = (containerNode: Node, nodes: Node[]) => {
  const directChildren = nodes.filter(node => node.parentId === containerNode.id)
  if (directChildren.length)
    return directChildren

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const children = containerNode.data._children
    ?.map(child => nodeById.get(child.nodeId))
    .filter((node): node is Node => Boolean(node)) ?? []
  const startNodeId = 'start_node_id' in containerNode.data && typeof containerNode.data.start_node_id === 'string'
    ? containerNode.data.start_node_id
    : undefined
  const startNode = startNodeId ? nodeById.get(startNodeId) : undefined

  if (!startNode || children.some(child => child.id === startNode.id))
    return children

  return [startNode, ...children]
}

const getSortedContainerChildren = (containerNode: Node, nodes: Node[]) => {
  const startNodeId = 'start_node_id' in containerNode.data && typeof containerNode.data.start_node_id === 'string'
    ? containerNode.data.start_node_id
    : undefined

  return [...getContainerChildren(containerNode, nodes)].sort((a, b) => {
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

const getInternalEdges = (containerId: string, children: Node[], edges: Edge[]) => {
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

const findEdgeBetween = (edges: Edge[], sourceNode: Node, targetNode: Node) => {
  return edges.find(edge => edge.source === sourceNode.id && edge.target === targetNode.id)
}

const isContainerStartNode = (node: Node) => {
  return CONTAINER_START_NODE_TYPES.has(node.data.type)
}

const AddBlockButton: FC<AddBlockButtonProps> = ({
  edge,
  onGraphChange,
  sourceNode,
  targetNode,
  variant = 'node',
}) => {
  const { t } = useTranslation()
  const reactflow = useReactFlow()
  const { nodesReadOnly } = useNodesReadOnly()
  const { handleNodeAdd } = useNodesInteractions()
  const isInsideContainer = Boolean(sourceNode.parentId || sourceNode.data.isInIteration || sourceNode.data.isInLoop)
  const { availableNextBlocks } = useAvailableBlocks(sourceNode.data.type, isInsideContainer)
  const { availablePrevBlocks } = useAvailableBlocks(targetNode?.data.type ?? BlockEnum.End, isInsideContainer)
  const availableBlocksTypes = targetNode
    ? intersection(availableNextBlocks, availablePrevBlocks)
    : availableNextBlocks
  const disabled = nodesReadOnly || availableBlocksTypes.length === 0

  const handleSelect = useCallback<OnSelectBlock>((nodeType, pluginDefaultValue) => {
    handleNodeAdd(
      {
        nodeType,
        pluginDefaultValue,
      },
      {
        nextNodeId: targetNode?.id,
        nextNodeTargetHandle: edge?.targetHandle || 'target',
        prevNodeId: sourceNode.id,
        prevNodeSourceHandle: edge?.sourceHandle || 'source',
      },
    )

    queueMicrotask(() => {
      const latestNodes = reactflow.getNodes() as Node[]
      const latestEdges = reactflow.getEdges() as Edge[]

      if (!latestNodes.length)
        return

      onGraphChange(getCanvasV2SourceGraph({
        nodes: latestNodes,
        edges: latestEdges,
      }))
    })
  }, [edge?.sourceHandle, edge?.targetHandle, handleNodeAdd, onGraphChange, reactflow, sourceNode.id, targetNode?.id])

  const renderTrigger = useCallback((open: boolean) => {
    if (variant === 'terminal') {
      return (
        <button
          type="button"
          data-testid="workflow-canvas-v2-container-subgraph-terminal-add"
          className={cn(
            'flex h-12 w-[132px] cursor-pointer items-center rounded-lg border border-dashed border-components-dropzone-border bg-components-dropzone-bg px-3 system-xs-medium-uppercase text-text-placeholder outline-hidden hover:bg-components-dropzone-bg-accent focus-visible:ring-2 focus-visible:ring-components-input-border-hover',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          aria-label={t('common.addBlock', { ns: 'workflow' })}
        >
          <span className="mr-2 flex size-5 items-center justify-center rounded-[5px] bg-background-default-dimmed">
            <span className="i-ri-add-line size-3" />
          </span>
          {t('common.addBlock', { ns: 'workflow' })}
        </button>
      )
    }

    return (
      <button
        type="button"
        data-testid="workflow-canvas-v2-container-subgraph-add"
        className={getCanvasV2NodeAddTriggerClassName({
          open,
          disabled,
          hoverClassName: 'group-hover/subgraph-node:opacity-100',
        })}
        aria-label={t('common.addBlock', { ns: 'workflow' })}
      >
        <span className={CANVAS_V2_NODE_ADD_ICON_CLASS_NAME} />
      </button>
    )
  }, [disabled, t, variant])

  const blockSelector = (
    <BlockSelector
      disabled={disabled}
      onSelect={handleSelect}
      availableBlocksTypes={availableBlocksTypes}
      popupClassName="min-w-[256px]!"
      placement="bottom"
      trigger={renderTrigger}
      triggerInnerClassName="inline-flex"
    />
  )

  if (variant === 'node')
    return blockSelector

  return (
    <div className="flex h-12 shrink-0 items-center">
      <div className="h-0.5 w-8 shrink-0 bg-workflow-link-line-normal" />
      {blockSelector}
    </div>
  )
}

const SubgraphTitle = ({
  node,
  title,
  onSelect,
}: {
  node: Node
  title: string
  onSelect: (nodeId: string) => void
}) => {
  return (
    <button
      type="button"
      className="flex min-w-0 items-center gap-2 text-left outline-hidden focus-visible:ring-2 focus-visible:ring-components-input-border-hover"
      onClick={() => onSelect(node.id)}
    >
      <BlockIcon
        className="shrink-0"
        type={node.data.type}
        size="sm"
      />
      <div className="truncate system-md-semibold text-text-primary">
        {title}
      </div>
    </button>
  )
}

const SubgraphConnection = () => {
  return (
    <div className="flex h-12 w-20 shrink-0 items-center">
      <div className="h-0.5 w-full bg-workflow-link-line-normal" />
    </div>
  )
}

const SubgraphNodeAddButton = ({
  edge,
  node,
  nextNode,
  onGraphChange,
}: {
  edge?: Edge
  node: Node
  nextNode?: Node
  onGraphChange: (graph: { nodes: Node[], edges: Edge[] }) => void
}) => {
  return (
    <AddBlockButton
      edge={edge}
      sourceNode={node}
      targetNode={edge ? nextNode : undefined}
      onGraphChange={onGraphChange}
    />
  )
}

const SubgraphNodeCard = ({
  edge,
  nextNode,
  node,
  onGraphChange,
  onSelect,
}: {
  edge?: Edge
  nextNode?: Node
  node: Node
  onGraphChange: (graph: { nodes: Node[], edges: Edge[] }) => void
  onSelect: (nodeId: string) => void
}) => {
  const { t } = useTranslation()
  const title = getNodeTitle(node, t)

  if (isContainerStartNode(node)) {
    return (
      <div className="group/subgraph-node relative shrink-0">
        <button
          type="button"
          data-testid="workflow-canvas-v2-container-subgraph-start"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-workflow-block-border bg-workflow-block-bg shadow-xs outline-hidden hover:border-components-option-card-option-selected-border focus-visible:ring-2 focus-visible:ring-components-input-border-hover',
            node.data.selected && 'border-components-option-card-option-selected-border shadow-md',
          )}
          title={title}
          aria-label={title}
          onClick={() => onSelect(node.id)}
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full border-[0.5px] border-components-panel-border-subtle bg-util-colors-blue-brand-blue-brand-500">
            <span className="i-ri-home-5-fill size-3 text-text-primary-on-surface" />
          </span>
        </button>
        <div className="absolute top-1/2 -right-2.5 z-10 -translate-y-1/2">
          <SubgraphNodeAddButton
            edge={edge}
            node={node}
            nextNode={nextNode}
            onGraphChange={onGraphChange}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="group/subgraph-node relative shrink-0">
      <button
        type="button"
        data-testid="workflow-canvas-v2-container-subgraph-node"
        className={cn(
          'flex h-12 w-[200px] shrink-0 items-center rounded-lg border border-workflow-block-border bg-workflow-block-bg px-3 text-left shadow-xs outline-hidden hover:border-components-option-card-option-selected-border focus-visible:ring-2 focus-visible:ring-components-input-border-hover',
          node.data.selected && 'border-components-option-card-option-selected-border shadow-md',
        )}
        aria-label={title}
        onClick={() => onSelect(node.id)}
      >
        <BlockIcon
          className="mr-2 shrink-0"
          type={node.data.type}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div
            title={title}
            className="truncate system-sm-semibold-uppercase text-text-primary"
          >
            {title}
          </div>
        </div>
      </button>
      <div className="absolute top-1/2 -right-2.5 z-10 -translate-y-1/2">
        <SubgraphNodeAddButton
          edge={edge}
          node={node}
          nextNode={nextNode}
          onGraphChange={onGraphChange}
        />
      </div>
    </div>
  )
}

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

    return getSortedContainerChildren(containerNode, nodes)
  }, [containerNode, nodes])
  const internalEdges = useMemo(() => getInternalEdges(containerId, children, edges), [children, containerId, edges])

  if (!containerNode)
    return null

  const title = getNodeTitle(containerNode, t)
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
              <div className="flex min-h-full min-w-max items-center p-8">
                {children.map((node, index) => {
                  const nextNode = children[index + 1]
                  const edge = nextNode ? findEdgeBetween(internalEdges, node, nextNode) : undefined

                  return (
                    <div key={node.id} className="flex items-center">
                      <SubgraphNodeCard
                        edge={edge}
                        nextNode={nextNode}
                        node={node}
                        onGraphChange={onGraphChange}
                        onSelect={onSelectNode}
                      />
                      {nextNode
                        ? <SubgraphConnection />
                        : (
                            <AddBlockButton
                              sourceNode={node}
                              onGraphChange={onGraphChange}
                              variant="terminal"
                            />
                          )}
                    </div>
                  )
                })}
              </div>
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
