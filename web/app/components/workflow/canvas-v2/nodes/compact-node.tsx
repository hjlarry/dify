import type { FC } from 'react'
import type { NodeProps as ReactFlowNodeProps } from 'reactflow'
import type { CommonNodeType } from '../../types'
import { cn } from '@langgenius/dify-ui/cn'
import { memo, useMemo, useState } from 'react'
import {
  Handle,
  Position,
} from 'reactflow'
import BlockIcon from '../../block-icon'
import {
  useNodesReadOnly,
  useToolIcon,
} from '../../hooks'
import NodeControl from '../../nodes/_base/components/node-control'
import {
  NodeSourceHandle,
  NodeTargetHandle,
} from '../../nodes/_base/components/node-handle'
import {
  BlockEnum,
  NodeRunningStatus,
} from '../../types'
import {
  CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY,
  CANVAS_V2_HIDDEN_KEY,
} from '../graph-adapter'
import CompactNodeStatusIcon from './compact-node-status'
import NodeSummaryPreview from './node-summary-preview'

type CompactNodeProps = ReactFlowNodeProps<CommonNodeType>

const BRANCH_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.IfElse,
  BlockEnum.QuestionClassifier,
  BlockEnum.HumanInput,
])

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

const CompactBranchSourceHandle = ({
  data,
  handleId,
}: {
  data: CommonNodeType
  handleId: string
}) => {
  const connected = data._connectedSourceHandleIds?.includes(handleId)

  return (
    <Handle
      id={handleId}
      type="source"
      position={Position.Right}
      className={cn(
        'z-1 h-4! w-4! rounded-none! border-none! bg-transparent! outline-hidden!',
        'after:absolute after:top-1 after:right-1.5 after:h-2 after:w-0.5 after:bg-workflow-link-line-handle',
        data._runningStatus === NodeRunningStatus.Succeeded && 'after:bg-workflow-link-line-success-handle',
        data._runningStatus === NodeRunningStatus.Failed && 'after:bg-workflow-link-line-error-handle',
        data._runningStatus === NodeRunningStatus.Exception && 'after:bg-workflow-link-line-failure-handle',
        !connected && 'after:opacity-0',
        'top-1/2! -right-[9px]! -translate-y-1/2!',
      )}
      isConnectable={false}
    />
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
        <NodeTargetHandle
          id={id}
          data={data}
          handleClassName="top-1/2! -left-[9px]! -translate-y-1/2!"
          handleId="target"
        />
      )}
      {!isBranchNode && !data._isCandidate && (
        <NodeSourceHandle
          id={id}
          data={data}
          handleClassName="top-1/2! -right-[9px]! -translate-y-1/2!"
          handleId="source"
        />
      )}
      {isBranchNode && !data._isCandidate && branchSourceHandleIds.map(handleId => (
        <CompactBranchSourceHandle
          key={handleId}
          data={data}
          handleId={handleId}
        />
      ))}
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
