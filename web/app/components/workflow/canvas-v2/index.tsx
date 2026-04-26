'use client'

import type {
  CSSProperties,
  FC,
} from 'react'
import type {
  EdgeMouseHandler,
  NodeChange,
  NodeMouseHandler,
  Viewport,
} from 'reactflow'
import type { CursorPosition, OnlineUser } from '../collaboration/types/collaboration'
import type { Shape as HooksStoreShape } from '../hooks-store'
import type {
  ConversationVariable,
  Edge,
  EnvironmentVariable,
  Node,
} from '../types'
import type { WorkflowGraph } from './canvas-state'
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogCancelButton,
  AlertDialogConfirmButton,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@langgenius/dify-ui/alert-dialog'
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import ReactFlow, {
  applyNodeChanges,
  Background,
  SelectionMode,
  useReactFlow,
} from 'reactflow'
import { useEventEmitterContextContext } from '@/context/event-emitter'
import CandidateNode from '../candidate-node'
import UserCursors from '../collaboration/components/user-cursors'
import {
  WORKFLOW_DATA_UPDATE,
} from '../constants'
import {
  useNodesReadOnly,
  useNodesSyncDraft,
  useWorkflowHistory,
  useWorkflowReadOnly,
  WorkflowHistoryEvent,
} from '../hooks'
import { HooksStoreContextProvider } from '../hooks-store'
import Control from '../operator/control'
import {
  useStore,
  useWorkflowStore,
} from '../store'
import {
  BlockEnum,
  ControlMode,
} from '../types'
import { setupScrollToNodeListener } from '../utils/node-navigation'
import {
  getGraphNodeChanges,
  getSelectableGraphNodeChanges,
  isSelectNodeChange,
  withConnectedNodeSelection,
  withSelectedGraphNode,
  withSelectedNodeData,
} from './canvas-state'
import {
  WORKFLOW_CANVAS_V2_TOPBAR_HEIGHT,
} from './constants'
import ContainerSubgraph from './container-subgraph'
import {
  getCanvasV2Graph,
  getCanvasV2SourceGraph,
} from './graph-adapter'
import {
  getCanvasV2LayoutNodes,
} from './layout/elk-layout'
import {
  canvasV2EdgeTypes,
  canvasV2NodeTypes,
} from './node-types'

type WorkflowDataUpdatePayload = {
  nodes: Node[]
  edges: Edge[]
  viewport?: Viewport
  hash?: string
  features?: unknown
  conversation_variables?: ConversationVariable[]
  environment_variables?: EnvironmentVariable[]
}

type WorkflowDataUpdateEvent = {
  type: typeof WORKFLOW_DATA_UPDATE
  payload: WorkflowDataUpdatePayload
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const isWorkflowDataUpdateEvent = (value: unknown): value is WorkflowDataUpdateEvent => {
  if (!isRecord(value) || value.type !== WORKFLOW_DATA_UPDATE || !isRecord(value.payload))
    return false

  return Array.isArray(value.payload.nodes) && Array.isArray(value.payload.edges)
}

const CONTAINER_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.Iteration,
  BlockEnum.Loop,
])

const withHoveredGraphEdge = (graph: WorkflowGraph, edgeId: string, hovering: boolean): WorkflowGraph => {
  const sourceGraph = getCanvasV2SourceGraph(graph)

  return {
    nodes: sourceGraph.nodes,
    edges: sourceGraph.edges.map((edge) => {
      if (edge.id !== edgeId)
        return edge

      if (edge.data?._hovering === hovering)
        return edge

      return {
        ...edge,
        data: {
          ...edge.data,
          _hovering: hovering,
        } as Edge['data'],
      }
    }),
  }
}

const getFreshGraph = (
  graph: WorkflowGraph,
  reactflow: ReturnType<typeof useReactFlow>,
) => {
  const currentNodes = reactflow.getNodes() as Node[]
  if (!currentNodes.length)
    return graph

  const currentEdges = reactflow.getEdges() as Edge[]
  const currentGraph = getCanvasV2SourceGraph({
    nodes: currentNodes,
    edges: currentEdges,
  })
  const graphNodeIds = new Set(graph.nodes.map(node => node.id))
  const graphEdgeIds = new Set(graph.edges.map(edge => edge.id))
  const hasNewerNodes = currentGraph.nodes.length !== graph.nodes.length
    || currentGraph.nodes.some(node => !graphNodeIds.has(node.id))
  const hasNewerEdges = currentGraph.edges.length !== graph.edges.length
    || currentGraph.edges.some(edge => !graphEdgeIds.has(edge.id))

  if (!hasNewerNodes && !hasNewerEdges)
    return graph

  return currentGraph
}

const getCurrentSourceGraph = (reactflow: ReturnType<typeof useReactFlow>): WorkflowGraph => {
  return getCanvasV2SourceGraph({
    nodes: reactflow.getNodes() as Node[],
    edges: reactflow.getEdges() as Edge[],
  })
}

export type WorkflowCanvasV2Props = {
  nodes: Node[]
  edges: Edge[]
  viewport?: Viewport
  children?: React.ReactNode
  onWorkflowDataUpdate?: (v: WorkflowDataUpdatePayload) => void
  cursors?: Record<string, CursorPosition>
  myUserId?: string | null
  onlineUsers?: OnlineUser[]
}

export const WorkflowCanvasV2: FC<WorkflowCanvasV2Props> = memo(({
  nodes: originalNodes,
  edges: originalEdges,
  viewport,
  children,
  onWorkflowDataUpdate,
  cursors,
  myUserId,
  onlineUsers,
}) => {
  const { t } = useTranslation()
  const workflowContainerRef = useRef<HTMLDivElement>(null)
  const workflowStore = useWorkflowStore()
  const reactflow = useReactFlow()
  const { eventEmitter } = useEventEmitterContextContext()
  const [graph, setGraph] = useState<WorkflowGraph>({
    nodes: originalNodes,
    edges: originalEdges,
  })
  const [activeContainerId, setActiveContainerId] = useState<string>()
  const controlMode = useStore(s => s.controlMode)
  const showUserCursors = useStore(s => s.showUserCursors)
  const workflowCanvasHeight = useStore(s => s.workflowCanvasHeight)
  const bottomPanelHeight = useStore(s => s.bottomPanelHeight)
  const setWorkflowCanvasWidth = useStore(s => s.setWorkflowCanvasWidth)
  const setWorkflowCanvasHeight = useStore(s => s.setWorkflowCanvasHeight)
  const setMousePosition = useStore(s => s.setMousePosition)
  const showConfirm = useStore(s => s.showConfirm)
  const setShowConfirm = useStore(s => s.setShowConfirm)
  const { nodesReadOnly } = useNodesReadOnly()
  const { workflowReadOnly } = useWorkflowReadOnly()
  const { handleSyncWorkflowDraft } = useNodesSyncDraft()
  const { saveStateToHistory } = useWorkflowHistory()
  const canvasRootStyle = useMemo(() => ({
    '--workflow-canvas-v2-topbar-height': `${WORKFLOW_CANVAS_V2_TOPBAR_HEIGHT}px`,
    '--workflow-panel-top-offset': `${WORKFLOW_CANVAS_V2_TOPBAR_HEIGHT}px`,
  }) as CSSProperties, [])
  const canvasBodyStyle = useMemo(() => ({
    top: WORKFLOW_CANVAS_V2_TOPBAR_HEIGHT,
  }) as CSSProperties, [])
  const controlHeight = useMemo(() => {
    if (typeof workflowCanvasHeight !== 'number')
      return '100%'

    return Math.max(workflowCanvasHeight - bottomPanelHeight - WORKFLOW_CANVAS_V2_TOPBAR_HEIGHT, 0)
  }, [bottomPanelHeight, workflowCanvasHeight])
  const viewGraph = useMemo(() => getCanvasV2Graph(graph), [graph])

  useEffect(() => {
    workflowStore.getState().setNodes(graph.nodes)
  }, [graph.nodes, workflowStore])

  useEffect(() => {
    const container = workflowContainerRef.current
    if (!container || typeof ResizeObserver === 'undefined')
      return

    const resizeContainerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { inlineSize, blockSize } = entry.borderBoxSize[0]!
        setWorkflowCanvasWidth(inlineSize)
        setWorkflowCanvasHeight(blockSize)
      }
    })

    resizeContainerObserver.observe(container)

    return () => {
      resizeContainerObserver.disconnect()
    }
  }, [setWorkflowCanvasHeight, setWorkflowCanvasWidth])

  eventEmitter?.useSubscription((event: unknown) => {
    if (!isWorkflowDataUpdateEvent(event))
      return

    const { payload } = event
    const nextGraph = {
      nodes: payload.nodes,
      edges: payload.edges,
    }
    const nextViewGraph = getCanvasV2Graph(nextGraph)

    setGraph(nextGraph)
    workflowStore.getState().setNodes(payload.nodes)
    reactflow.setNodes(nextViewGraph.nodes)
    reactflow.setEdges(nextViewGraph.edges)

    if (payload.viewport)
      reactflow.setViewport(payload.viewport)

    onWorkflowDataUpdate?.(payload)
  })

  useEffect(() => {
    return setupScrollToNodeListener(viewGraph.nodes, reactflow)
  }, [viewGraph.nodes, reactflow])

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const containerClientRect = workflowContainerRef.current?.getBoundingClientRect()
    if (!containerClientRect)
      return

    setMousePosition({
      pageX: event.clientX,
      pageY: event.clientY,
      elementX: event.clientX - containerClientRect.left,
      elementY: event.clientY - containerClientRect.top,
    })
  }, [setMousePosition])

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const graphChanges = getSelectableGraphNodeChanges(getGraphNodeChanges(changes), controlMode)
    if (!graphChanges.length)
      return

    setGraph((prevGraph) => {
      const baseGraph = getFreshGraph(prevGraph, reactflow)
      const nextNodes = withSelectedNodeData(applyNodeChanges(graphChanges, baseGraph.nodes) as Node[], graphChanges)
      const nextEdges = graphChanges.some(isSelectNodeChange)
        ? withConnectedNodeSelection(baseGraph.edges, nextNodes)
        : baseGraph.edges

      return {
        nodes: nextNodes,
        edges: nextEdges,
      }
    })
  }, [controlMode, reactflow])

  const handleSelectGraphNode = useCallback((nodeId: string) => {
    setGraph((prevGraph) => {
      return withSelectedGraphNode(getFreshGraph(prevGraph, reactflow), nodeId)
    })
  }, [reactflow])

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    if (controlMode === ControlMode.Comment)
      return

    handleSelectGraphNode(node.id)

    if (!CONTAINER_NODE_TYPES.has(node.data.type))
      return

    setActiveContainerId(node.id)
  }, [controlMode, handleSelectGraphNode])

  const handleEdgeMouseEnter = useCallback<EdgeMouseHandler>((_, edge) => {
    setGraph((prevGraph) => {
      return withHoveredGraphEdge(getFreshGraph(prevGraph, reactflow), edge.id, true)
    })
  }, [reactflow])

  const handleEdgeMouseLeave = useCallback<EdgeMouseHandler>((_, edge) => {
    setGraph((prevGraph) => {
      return withHoveredGraphEdge(getFreshGraph(prevGraph, reactflow), edge.id, false)
    })
  }, [reactflow])

  const handleSubgraphChange = useCallback((nextGraph: WorkflowGraph) => {
    setGraph(nextGraph)
  }, [])

  const handleConfirm = useCallback(() => {
    showConfirm?.onConfirm()
    setGraph(getCurrentSourceGraph(reactflow))
  }, [reactflow, showConfirm])

  const handleLayout = useCallback(async () => {
    if (nodesReadOnly)
      return

    workflowStore.setState({ nodeAnimation: true })

    const currentNodes = reactflow.getNodes() as Node[]
    const currentEdges = reactflow.getEdges() as Edge[]
    const currentGraph = {
      nodes: currentNodes.length ? currentNodes : graph.nodes,
      edges: currentEdges.length ? currentEdges : graph.edges,
    }
    const nextNodes = await getCanvasV2LayoutNodes(currentGraph.nodes, currentGraph.edges)
    const nextGraph = {
      nodes: nextNodes,
      edges: currentGraph.edges,
    }

    workflowStore.getState().setNodes(nextNodes)
    setGraph(nextGraph)
    reactflow.setViewport({ x: 0, y: 0, zoom: 0.7 })
    saveStateToHistory(WorkflowHistoryEvent.LayoutOrganize)
    setTimeout(() => {
      handleSyncWorkflowDraft()
    })
  }, [graph, handleSyncWorkflowDraft, nodesReadOnly, reactflow, saveStateToHistory, workflowStore])

  const panOnDrag = useMemo(() => {
    if (controlMode === ControlMode.Hand)
      return true

    return [1]
  }, [controlMode])

  return (
    <div
      id="workflow-container"
      ref={workflowContainerRef}
      data-testid="workflow-canvas-v2"
      className="relative h-full w-full min-w-[960px] overflow-hidden"
      style={canvasRootStyle}
      onMouseMove={handleMouseMove}
    >
      <CandidateNode />
      <AlertDialog open={!!showConfirm} onOpenChange={open => !open && setShowConfirm(undefined)}>
        <AlertDialogContent>
          <div className="flex flex-col gap-2 px-6 pt-6 pb-4">
            <AlertDialogTitle className="w-full truncate title-2xl-semi-bold text-text-primary">
              {showConfirm?.title}
            </AlertDialogTitle>
            {showConfirm?.desc && (
              <AlertDialogDescription className="w-full system-md-regular wrap-break-word whitespace-pre-wrap text-text-tertiary">
                {showConfirm.desc}
              </AlertDialogDescription>
            )}
          </div>
          <AlertDialogActions>
            <AlertDialogCancelButton>{t('operation.cancel', { ns: 'common' })}</AlertDialogCancelButton>
            <AlertDialogConfirmButton onClick={handleConfirm}>
              {t('operation.confirm', { ns: 'common' })}
            </AlertDialogConfirmButton>
          </AlertDialogActions>
        </AlertDialogContent>
      </AlertDialog>
      {children}
      <div
        data-testid="workflow-canvas-v2-body"
        className="absolute inset-x-0 bottom-0"
        style={canvasBodyStyle}
      >
        <div
          data-testid="workflow-canvas-v2-control"
          className="pointer-events-none absolute top-0 left-0 z-10 flex w-12 items-center justify-center p-1 pl-2"
          style={{ height: controlHeight }}
        >
          <Control onLayout={handleLayout} />
        </div>
        <ReactFlow
          nodeTypes={canvasV2NodeTypes}
          edgeTypes={canvasV2EdgeTypes}
          nodes={viewGraph.nodes}
          edges={viewGraph.edges}
          onNodesChange={handleNodesChange}
          onNodeClick={handleNodeClick}
          onEdgeMouseEnter={handleEdgeMouseEnter}
          onEdgeMouseLeave={handleEdgeMouseLeave}
          defaultViewport={viewport}
          multiSelectionKeyCode={null}
          deleteKeyCode={null}
          nodesDraggable={!nodesReadOnly && controlMode !== ControlMode.Comment}
          nodesConnectable={false}
          nodesFocusable={!nodesReadOnly}
          edgesFocusable={false}
          panOnScroll={controlMode === ControlMode.Pointer && !workflowReadOnly}
          panOnDrag={panOnDrag}
          zoomOnPinch
          zoomOnScroll
          zoomOnDoubleClick
          selectionKeyCode={null}
          selectionMode={SelectionMode.Partial}
          selectionOnDrag={false}
          minZoom={0.25}
        >
          <Background
            gap={[14, 14]}
            size={2}
            className="bg-workflow-canvas-workflow-bg"
            color="var(--color-workflow-canvas-workflow-dot-color)"
          />
          {showUserCursors && cursors && (
            <UserCursors
              cursors={cursors}
              myUserId={myUserId || null}
              onlineUsers={onlineUsers || []}
            />
          )}
        </ReactFlow>
      </div>
      {activeContainerId && (
        <ContainerSubgraph
          containerId={activeContainerId}
          nodes={graph.nodes}
          edges={graph.edges}
          onClose={() => setActiveContainerId(undefined)}
          onGraphChange={handleSubgraphChange}
          onSelectNode={handleSelectGraphNode}
        />
      )}
    </div>
  )
})

WorkflowCanvasV2.displayName = 'WorkflowCanvasV2'

type WorkflowCanvasV2WithInnerContextProps = WorkflowCanvasV2Props & {
  hooksStore?: Partial<HooksStoreShape>
}

export const WorkflowCanvasV2WithInnerContext = memo(({
  hooksStore,
  ...restProps
}: WorkflowCanvasV2WithInnerContextProps) => {
  return (
    <HooksStoreContextProvider {...hooksStore}>
      <WorkflowCanvasV2 {...restProps} />
    </HooksStoreContextProvider>
  )
})

WorkflowCanvasV2WithInnerContext.displayName = 'WorkflowCanvasV2WithInnerContext'
