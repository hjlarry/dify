import type { EdgeProps } from 'reactflow'
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
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useStore as useReactFlowStore,
} from 'reactflow'
import BlockSelector from '../../block-selector'
import CustomEdgeLinearGradientRender from '../../custom-edge-linear-gradient-render'
import {
  useAvailableBlocks,
  useNodesInteractions,
} from '../../hooks'
import { ErrorHandleTypeEnum } from '../../nodes/_base/components/error-handle/types'
import {
  BlockEnum,
  NodeRunningStatus,
} from '../../types'
import {
  getEdgeColor,
} from '../../utils'
import {
  CANVAS_V2_HIDDEN_KEY,
} from '../graph-adapter'
import { getCanvasV2BranchLabel } from './branch-label'

type CanvasV2EdgeData = Edge['data'] & {
  _dimmed?: boolean
}

const CanvasV2CustomEdge = ({
  id,
  data,
  source,
  sourceHandleId,
  target,
  targetHandleId,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
}: EdgeProps) => {
  const { t } = useTranslation()
  const [
    edgePath,
    labelX,
    labelY,
  ] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition: Position.Right,
    targetX,
    targetY,
    targetPosition: Position.Left,
    borderRadius: 0,
  })
  const [open, setOpen] = useState(false)
  const [isTriggerHovered, setIsTriggerHovered] = useState(false)
  const { handleNodeAdd } = useNodesInteractions()
  const edgeData = data as CanvasV2EdgeData | undefined
  const sourceNodeData = useReactFlowStore(
    useCallback(state => state.nodeInternals.get(source)?.data as CommonNodeType | undefined, [source]),
  )
  const { availablePrevBlocks } = useAvailableBlocks(edgeData?.targetType ?? BlockEnum.End, edgeData?.isInIteration || edgeData?.isInLoop)
  const { availableNextBlocks } = useAvailableBlocks(edgeData?.sourceType ?? BlockEnum.Start, edgeData?.isInIteration || edgeData?.isInLoop)
  const branchLabel = getCanvasV2BranchLabel({
    sourceNodeData,
    sourceHandleId,
    failBranchLabel: t('nodes.common.errorHandle.failBranch.title', { ns: 'workflow' }),
  })
  const {
    _sourceRunningStatus,
    _targetRunningStatus,
  } = edgeData || {}
  const isLabelVisible = !!branchLabel

  const linearGradientId = useMemo(() => {
    if (
      (
        _sourceRunningStatus === NodeRunningStatus.Succeeded
        || _sourceRunningStatus === NodeRunningStatus.Failed
        || _sourceRunningStatus === NodeRunningStatus.Exception
      ) && (
        _targetRunningStatus === NodeRunningStatus.Succeeded
        || _targetRunningStatus === NodeRunningStatus.Failed
        || _targetRunningStatus === NodeRunningStatus.Exception
        || _targetRunningStatus === NodeRunningStatus.Running
      )
    ) {
      return id
    }
  }, [_sourceRunningStatus, _targetRunningStatus, id])

  const handleOpenChange = useCallback((v: boolean) => {
    setOpen(v)
  }, [])

  const handleInsert = useCallback<OnSelectBlock>((nodeType, pluginDefaultValue) => {
    handleNodeAdd(
      {
        nodeType,
        pluginDefaultValue,
      },
      {
        prevNodeId: source,
        prevNodeSourceHandle: sourceHandleId || 'source',
        nextNodeId: target,
        nextNodeTargetHandle: targetHandleId || 'target',
      },
    )
  }, [handleNodeAdd, source, sourceHandleId, target, targetHandleId])

  const stroke = useMemo(() => {
    if (selected)
      return getEdgeColor(NodeRunningStatus.Running)

    if (linearGradientId)
      return `url(#${linearGradientId})`

    if (edgeData?._connectedNodeIsHovering)
      return getEdgeColor(NodeRunningStatus.Running, sourceHandleId === ErrorHandleTypeEnum.failBranch)

    return getEdgeColor()
  }, [edgeData?._connectedNodeIsHovering, linearGradientId, selected, sourceHandleId])

  const edgeOpacity = edgeData?._dimmed ? 0.3 : (edgeData?._waitingRun ? 0.7 : 1)
  const hidden = (edgeData as CanvasV2EdgeData & Record<string, unknown> | undefined)?.[CANVAS_V2_HIDDEN_KEY] === true

  if (hidden)
    return null

  return (
    <>
      {linearGradientId && (
        <CustomEdgeLinearGradientRender
          id={linearGradientId}
          startColor={getEdgeColor(_sourceRunningStatus)}
          stopColor={getEdgeColor(_targetRunningStatus)}
          position={{
            x1: sourceX,
            y1: sourceY,
            x2: targetX,
            y2: targetY,
          }}
        />
      )}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth: 2,
          opacity: edgeOpacity,
          strokeDasharray: edgeData?._isTemp ? '8 8' : undefined,
        }}
      />
      {isLabelVisible && (
        <EdgeLabelRenderer>
          <div
            className={cn(
              // eslint-disable-next-line tailwindcss/no-unknown-classes
              'group/edge-label nopan nodrag flex items-center gap-1 transition-opacity duration-150',
              (edgeData?.isInIteration || edgeData?.isInLoop) && 'z-11',
            )}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              opacity: edgeOpacity,
            }}
            onMouseEnter={() => setIsTriggerHovered(true)}
            onMouseLeave={() => setIsTriggerHovered(false)}
          >
            <div
              className="max-w-[160px] truncate rounded-md border-[0.5px] border-components-panel-border bg-components-panel-bg px-1.5 py-0.5 system-2xs-semibold-uppercase text-text-secondary shadow-xs"
              title={branchLabel}
            >
              {branchLabel}
            </div>
            <BlockSelector
              open={open}
              onOpenChange={handleOpenChange}
              asChild
              onSelect={handleInsert}
              availableBlocksTypes={intersection(availablePrevBlocks, availableNextBlocks)}
              triggerClassName={triggerOpen => cn(
                'transition-all hover:scale-150',
                !triggerOpen && !isTriggerHovered && 'opacity-0',
                !triggerOpen && 'group-hover/edge-label:opacity-100',
              )}
            />
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

export default memo(CanvasV2CustomEdge)
