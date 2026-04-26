import type { FC } from 'react'
import type {
  Edge,
  Node,
  OnSelectBlock,
} from '../types'
import { cn } from '@langgenius/dify-ui/cn'
import { intersection } from 'es-toolkit/array'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useReactFlow } from 'reactflow'
import BlockIcon from '../block-icon'
import BlockSelector from '../block-selector'
import {
  useAvailableBlocks,
  useNodesInteractions,
  useNodesReadOnly,
} from '../hooks'
import { BlockEnum } from '../types'
import {
  getContainerSubgraphNodeTitle,
  isContainerStartNode,
} from './container-subgraph-utils'
import { getCanvasV2SourceGraph } from './graph-adapter'
import {
  CANVAS_V2_NODE_ADD_ICON_CLASS_NAME,
  getCanvasV2NodeAddTriggerClassName,
} from './nodes/node-add-trigger'

export type ContainerSubgraphGraphChange = (graph: { nodes: Node[], edges: Edge[] }) => void

type AddBlockButtonProps = {
  edge?: Edge
  onGraphChange: ContainerSubgraphGraphChange
  sourceNode: Node
  targetNode?: Node
  variant?: 'node' | 'terminal'
}

type SubgraphTitleProps = {
  node: Node
  title: string
  onSelect: (nodeId: string) => void
}

type SubgraphConnectionProps = {
  label?: string
}

type SubgraphNodeAddButtonProps = {
  edge?: Edge
  node: Node
  nextNode?: Node
  onGraphChange: ContainerSubgraphGraphChange
}

type SubgraphNodeCardProps = {
  edge?: Edge
  nextNode?: Node
  node: Node
  onGraphChange: ContainerSubgraphGraphChange
  onSelect: (nodeId: string) => void
  showAddButton?: boolean
}

export const AddBlockButton: FC<AddBlockButtonProps> = ({
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

export const SubgraphTitle = ({
  node,
  title,
  onSelect,
}: SubgraphTitleProps) => {
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

export const SubgraphConnection = ({
  label,
}: SubgraphConnectionProps) => {
  return (
    <div className="relative flex h-12 w-20 shrink-0 items-center justify-center">
      <div className="h-0.5 w-full bg-workflow-link-line-normal" />
      {label && (
        <div
          data-testid="workflow-canvas-v2-container-subgraph-branch-label"
          className="absolute top-0 max-w-[72px] truncate rounded-md border-[0.5px] border-components-panel-border bg-components-panel-bg px-1.5 py-0.5 system-2xs-semibold-uppercase text-text-secondary shadow-xs"
          title={label}
        >
          {label}
        </div>
      )}
    </div>
  )
}

const SubgraphNodeAddButton = ({
  edge,
  node,
  nextNode,
  onGraphChange,
}: SubgraphNodeAddButtonProps) => {
  return (
    <AddBlockButton
      edge={edge}
      sourceNode={node}
      targetNode={edge ? nextNode : undefined}
      onGraphChange={onGraphChange}
    />
  )
}

export const SubgraphNodeCard = ({
  edge,
  nextNode,
  node,
  onGraphChange,
  onSelect,
  showAddButton = true,
}: SubgraphNodeCardProps) => {
  const { t } = useTranslation()
  const title = getContainerSubgraphNodeTitle(node, t)

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
        {showAddButton && (
          <div className="absolute top-1/2 -right-2.5 z-10 -translate-y-1/2">
            <SubgraphNodeAddButton
              edge={edge}
              node={node}
              nextNode={nextNode}
              onGraphChange={onGraphChange}
            />
          </div>
        )}
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
      {showAddButton && (
        <div className="absolute top-1/2 -right-2.5 z-10 -translate-y-1/2">
          <SubgraphNodeAddButton
            edge={edge}
            node={node}
            nextNode={nextNode}
            onGraphChange={onGraphChange}
          />
        </div>
      )}
    </div>
  )
}
