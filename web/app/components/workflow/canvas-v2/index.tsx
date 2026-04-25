'use client'

import type { FC } from 'react'
import type {
  NodeChange,
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
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
  useWorkflowReadOnly,
} from '../hooks'
import { HooksStoreContextProvider } from '../hooks-store'
import Control from '../operator/control'
import {
  useStore,
  useWorkflowStore,
} from '../store'
import {
  ControlMode,
} from '../types'
import { setupScrollToNodeListener } from '../utils/node-navigation'
import {
  getCanvasV2Graph,
} from './graph-adapter'
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

type WorkflowGraph = {
  nodes: Node[]
  edges: Edge[]
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
  const workflowContainerRef = useRef<HTMLDivElement>(null)
  const workflowStore = useWorkflowStore()
  const reactflow = useReactFlow()
  const { eventEmitter } = useEventEmitterContextContext()
  const [graph, setGraph] = useState<WorkflowGraph>({
    nodes: originalNodes,
    edges: originalEdges,
  })
  const controlMode = useStore(s => s.controlMode)
  const showUserCursors = useStore(s => s.showUserCursors)
  const workflowCanvasHeight = useStore(s => s.workflowCanvasHeight)
  const bottomPanelHeight = useStore(s => s.bottomPanelHeight)
  const setWorkflowCanvasWidth = useStore(s => s.setWorkflowCanvasWidth)
  const setWorkflowCanvasHeight = useStore(s => s.setWorkflowCanvasHeight)
  const setMousePosition = useStore(s => s.setMousePosition)
  const { nodesReadOnly } = useNodesReadOnly()
  const { workflowReadOnly } = useWorkflowReadOnly()
  const controlHeight = useMemo(() => {
    if (!workflowCanvasHeight)
      return '100%'

    return workflowCanvasHeight - bottomPanelHeight
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
    setGraph(prevGraph => ({
      nodes: applyNodeChanges(changes, prevGraph.nodes) as Node[],
      edges: prevGraph.edges,
    }))
  }, [])

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
      onMouseMove={handleMouseMove}
    >
      <CandidateNode />
      <div
        data-testid="workflow-canvas-v2-control"
        className="pointer-events-none absolute top-0 left-0 z-10 flex w-12 items-center justify-center p-1 pl-2"
        style={{ height: controlHeight }}
      >
        <Control />
      </div>
      {children}
      <ReactFlow
        nodeTypes={canvasV2NodeTypes}
        edgeTypes={canvasV2EdgeTypes}
        nodes={viewGraph.nodes}
        edges={viewGraph.edges}
        onNodesChange={handleNodesChange}
        defaultViewport={viewport}
        multiSelectionKeyCode={null}
        deleteKeyCode={null}
        nodesDraggable={!nodesReadOnly && controlMode !== ControlMode.Comment}
        nodesConnectable={false}
        nodesFocusable={!nodesReadOnly}
        edgesFocusable={!nodesReadOnly}
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
