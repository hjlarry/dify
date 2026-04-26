import type {
  FC,
  MouseEvent,
} from 'react'
import type { NodeProps as ReactFlowNodeProps } from 'reactflow'
import type {
  CommonNodeType,
  Edge,
  OnSelectBlock,
} from '../../types'
import { cn } from '@langgenius/dify-ui/cn'
import { intersection } from 'es-toolkit/array'
import {
  memo,
  useCallback,
  useMemo,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Handle,
  Position,
  useStore as useReactFlowStore,
} from 'reactflow'
import BlockIcon from '../../block-icon'
import BlockSelector from '../../block-selector'
import {
  useAvailableBlocks,
  useNodesInteractions,
  useNodesReadOnly,
  useToolIcon,
} from '../../hooks'
import NodeControl from '../../nodes/_base/components/node-control'
import {
  BlockEnum,
  NodeRunningStatus,
} from '../../types'
import {
  CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY,
  CANVAS_V2_HIDDEN_KEY,
} from '../graph-adapter'
import CompactNodeStatusIcon from './compact-node-status'
import {
  CANVAS_V2_NODE_ADD_ICON_CLASS_NAME,
  getCanvasV2NodeAddTriggerClassName,
} from './node-add-trigger'
import NodeSummaryPreview from './node-summary-preview'

type CompactNodeProps = ReactFlowNodeProps<CommonNodeType>

const BRANCH_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.IfElse,
  BlockEnum.QuestionClassifier,
  BlockEnum.HumanInput,
])

const COMPACT_HANDLE_CLASS_NAME = 'z-1 h-4! w-4! rounded-none! border-none! bg-transparent! opacity-0! outline-hidden!'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const getStringFieldList = (value: unknown, fieldName: string) => {
  if (!Array.isArray(value))
    return []

  return value.reduce<string[]>((result, item) => {
    if (!isRecord(item))
      return result

    const fieldValue = item[fieldName]
    if (typeof fieldValue === 'string' && fieldValue)
      result.push(fieldValue)

    return result
  }, [])
}

const getBranchSourceHandleIds = (data: CommonNodeType) => {
  const record = data as CommonNodeType & Record<string, unknown>

  if (data.type === BlockEnum.IfElse)
    return [...getStringFieldList(record.cases, 'case_id'), 'false']

  if (data.type === BlockEnum.QuestionClassifier)
    return getStringFieldList(record.classes, 'id')

  if (data.type === BlockEnum.HumanInput)
    return [...getStringFieldList(record.user_actions, 'id'), '__timeout']

  return []
}

const getDisplayStatus = (data: CommonNodeType) => {
  return data._singleRunningStatus || data._runningStatus
}

const getCompactNodeStatusBorderClassName = (status?: NodeRunningStatus) => {
  if (
    status === NodeRunningStatus.Running
    || status === NodeRunningStatus.Listening
    || status === NodeRunningStatus.Retry
    || status === NodeRunningStatus.Paused
  ) {
    return 'border-state-accent-solid!'
  }

  if (status === NodeRunningStatus.Succeeded)
    return 'border-state-success-solid!'

  if (status === NodeRunningStatus.Failed)
    return 'border-state-destructive-solid!'

  if (status === NodeRunningStatus.Exception || status === NodeRunningStatus.Stopped)
    return 'border-state-warning-solid!'
}

const getCollapsedChildrenCount = (data: CommonNodeType) => {
  const count = (data as CommonNodeType & Record<string, unknown>)[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]

  return typeof count === 'number' && Number.isFinite(count) ? count : undefined
}

const isCanvasV2Hidden = (data: CommonNodeType) => {
  return (data as CommonNodeType & Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY] === true
}

const isCanvasV2HiddenEdge = (edge: Edge) => {
  return (edge.data as Edge['data'] & Record<string, unknown> | undefined)?.[CANVAS_V2_HIDDEN_KEY] === true
}

const CompactTargetHandle = ({
  data,
  handleId,
  id,
}: {
  data: CommonNodeType
  handleId: string
  id: string
}) => {
  const { handleNodeAdd } = useNodesInteractions()
  const { nodesReadOnly } = useNodesReadOnly()
  const [open, setOpen] = useState(false)
  const connected = data._connectedTargetHandleIds?.includes(handleId)
  const { availablePrevBlocks } = useAvailableBlocks(data.type, data.isInIteration || data.isInLoop)
  const isConnectable = availablePrevBlocks.length > 0

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleHandleClick = useCallback((event: MouseEvent) => {
    event.stopPropagation()
    if (!connected && isConnectable && !nodesReadOnly)
      setOpen(v => !v)
  }, [connected, isConnectable, nodesReadOnly])

  const handleSelect = useCallback<OnSelectBlock>((nodeType, pluginDefaultValue) => {
    handleNodeAdd(
      {
        nodeType,
        pluginDefaultValue,
      },
      {
        nextNodeId: id,
        nextNodeTargetHandle: handleId,
      },
    )
  }, [handleNodeAdd, handleId, id])

  return (
    <Handle
      id={handleId}
      type="target"
      position={Position.Left}
      className={cn(
        COMPACT_HANDLE_CLASS_NAME,
        'top-1/2! left-0!',
      )}
      isConnectable={isConnectable}
      onClick={handleHandleClick}
    >
      {!connected && isConnectable && !nodesReadOnly && (
        <BlockSelector
          open={open}
          onOpenChange={handleOpenChange}
          onSelect={handleSelect}
          asChild
          placement="left"
          triggerClassName={triggerOpen => cn(
            'pointer-events-none absolute top-0 left-0 opacity-0 transition-opacity duration-150',
            'group-hover:opacity-100',
            data.selected && 'opacity-100',
            triggerOpen && 'opacity-100',
          )}
          availableBlocksTypes={availablePrevBlocks}
        />
      )}
    </Handle>
  )
}

const CompactSourceHandle = ({
  handleId,
}: {
  handleId: string
}) => {
  return (
    <Handle
      id={handleId}
      type="source"
      position={Position.Right}
      className={cn(
        COMPACT_HANDLE_CLASS_NAME,
        'top-1/2! right-0!',
      )}
      isConnectable={false}
    />
  )
}

const CompactNodeAddButton = ({
  data,
  id,
  sourceHandleId,
}: {
  data: CommonNodeType
  id: string
  sourceHandleId: string
}) => {
  const { t } = useTranslation()
  const { nodesReadOnly } = useNodesReadOnly()
  const { handleNodeAdd } = useNodesInteractions()
  const [open, setOpen] = useState(false)
  const isInsideContainer = Boolean(data.isInIteration || data.isInLoop)
  const outgoingTarget = useReactFlowStore(useCallback((state) => {
    const visibleOutgoingEdges = (state.edges as Edge[]).filter(edge => (
      edge.source === id
      && (edge.sourceHandle || 'source') === sourceHandleId
      && !isCanvasV2HiddenEdge(edge)
    ))

    if (visibleOutgoingEdges.length !== 1)
      return undefined

    const edge = visibleOutgoingEdges[0]!
    const targetNodeData = state.nodeInternals.get(edge.target)?.data as CommonNodeType | undefined

    return {
      edge,
      targetType: targetNodeData?.type,
    }
  }, [id, sourceHandleId]))
  const { availableNextBlocks } = useAvailableBlocks(data.type, isInsideContainer)
  const { availablePrevBlocks } = useAvailableBlocks(outgoingTarget?.targetType ?? BlockEnum.End, isInsideContainer)
  const availableBlocksTypes = outgoingTarget?.targetType
    ? intersection(availableNextBlocks, availablePrevBlocks)
    : availableNextBlocks
  const disabled = nodesReadOnly || availableBlocksTypes.length === 0

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleSelect = useCallback<OnSelectBlock>((nodeType, pluginDefaultValue) => {
    const edge = outgoingTarget?.edge

    handleNodeAdd(
      {
        nodeType,
        pluginDefaultValue,
      },
      {
        nextNodeId: edge?.target,
        nextNodeTargetHandle: edge?.targetHandle || 'target',
        prevNodeId: id,
        prevNodeSourceHandle: edge?.sourceHandle || sourceHandleId,
      },
    )
  }, [handleNodeAdd, id, outgoingTarget?.edge, sourceHandleId])

  const renderTrigger = useCallback((triggerOpen: boolean) => {
    return (
      <button
        type="button"
        data-testid="workflow-canvas-v2-node-add"
        className={getCanvasV2NodeAddTriggerClassName({
          open: triggerOpen,
          disabled,
        })}
        aria-label={t('common.addBlock', { ns: 'workflow' })}
      >
        <span className={CANVAS_V2_NODE_ADD_ICON_CLASS_NAME} />
      </button>
    )
  }, [disabled, t])

  return (
    <div className="absolute top-1/2 -right-2 z-10 -translate-y-1/2">
      <BlockSelector
        disabled={disabled}
        open={open}
        onOpenChange={handleOpenChange}
        onSelect={handleSelect}
        availableBlocksTypes={availableBlocksTypes}
        popupClassName="min-w-[256px]!"
        placement="bottom"
        trigger={renderTrigger}
        triggerInnerClassName="inline-flex"
      />
    </div>
  )
}

const CompactNode: FC<CompactNodeProps> = ({
  id,
  data,
}) => {
  const { nodesReadOnly } = useNodesReadOnly()
  const toolIcon = useToolIcon(data)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const branchSourceHandleIds = useMemo(() => getBranchSourceHandleIds(data), [data])
  if (isCanvasV2Hidden(data))
    return null

  const isBranchNode = BRANCH_NODE_TYPES.has(data.type)
  const displayStatus = getDisplayStatus(data)
  const showSelectedBorder = Boolean(data.selected || data._isBundled || data._isEntering)
  const statusBorderClassName = !showSelectedBorder ? getCompactNodeStatusBorderClassName(displayStatus) : undefined
  const collapsedChildrenCount = getCollapsedChildrenCount(data)

  return (
    <div
      className={cn(
        'group relative flex h-12 w-[200px] items-center rounded-lg border bg-workflow-block-bg px-3 shadow-xs',
        showSelectedBorder ? 'border-components-option-card-option-selected-border' : 'border-workflow-block-border',
        statusBorderClassName,
        data._waitingRun && 'opacity-70',
        data._isBundled && 'shadow-lg!',
      )}
      data-testid="workflow-canvas-v2-compact-node"
      onMouseEnter={() => setSummaryOpen(true)}
      onMouseLeave={() => setSummaryOpen(false)}
    >
      {!data._isCandidate && (
        <CompactTargetHandle
          data={data}
          handleId="target"
          id={id}
        />
      )}
      {!isBranchNode && !data._isCandidate && (
        <CompactSourceHandle
          handleId="source"
        />
      )}
      {isBranchNode && !data._isCandidate && branchSourceHandleIds.map(handleId => (
        <CompactSourceHandle
          key={handleId}
          handleId={handleId}
        />
      ))}
      {!isBranchNode && !data._isCandidate && (
        <CompactNodeAddButton
          data={data}
          id={id}
          sourceHandleId="source"
        />
      )}
      {!displayStatus && !nodesReadOnly && !data._isCandidate && (
        <NodeControl
          id={id}
          data={data}
        />
      )}
      <BlockIcon
        className="mr-2 shrink-0"
        type={data.type}
        size="sm"
        toolIcon={toolIcon}
      />
      <div
        title={data.title}
        className="min-w-0 flex-1 truncate system-sm-semibold-uppercase text-text-primary"
      >
        {data.title}
      </div>
      {collapsedChildrenCount !== undefined && (
        <div
          data-testid="workflow-canvas-v2-container-count"
          className="ml-2 flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md bg-workflow-block-parma-bg px-1 system-2xs-semibold-uppercase text-text-tertiary"
        >
          {collapsedChildrenCount}
        </div>
      )}
      {displayStatus && (
        <CompactNodeStatusIcon
          status={displayStatus}
          className="ml-2 h-3.5 w-3.5"
        />
      )}
      <NodeSummaryPreview
        data={data}
        open={summaryOpen || Boolean(data.selected)}
      />
    </div>
  )
}

export default memo(CompactNode)
