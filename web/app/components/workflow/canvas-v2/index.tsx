'use client'

import type { FC } from 'react'
import type {
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

const getGraphNodeChanges = (changes: NodeChange[]) => {
  return changes.filter(change => change.type !== 'dimensions')
}

const isSelectNodeChange = (change: NodeChange): change is Extract<NodeChange, { type: 'select' }> => {
  return change.type === 'select'
}

const getSelectableGraphNodeChanges = (changes: NodeChange[], controlMode: unknown) => {
  if (controlMode !== ControlMode.Comment)
    return changes

  return changes.filter(change => !isSelectNodeChange(change))
}

const withSelectedNodeData = (nodes: Node[], changes: NodeChange[]) => {
  const selectChanges = changes.filter(isSelectNodeChange)
  if (!selectChanges.length)
    return nodes

  const selectedChangeIds = new Set(selectChanges.filter(change => change.selected).map(change => change.id))

  return nodes.map((node) => {
    const selected = selectedChangeIds.size > 0 ? selectedChangeIds.has(node.id) : Boolean(node.selected)

    if (node.data.selected === selected && node.selected === selected)
      return node

    return {
      ...node,
      selected,
      data: {
        ...node.data,
        selected,
      },
    }
  })
}

const withConnectedNodeSelection = (edges: Edge[], nodes: Node[]) => {
  const selectedNodeIds = new Set(nodes.filter(node => node.data.selected).map(node => node.id))

  return edges.map((edge) => {
    const connectedNodeIsSelected = selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target)
    const edgeData = edge.data as Edge['data'] & Record<string, unknown>

    if (edgeData?._connectedNodeIsSelected === connectedNodeIsSelected)
      return edge

    return {
      ...edge,
      data: {
        ...edge.data,
        _connectedNodeIsSelected: connectedNodeIsSelected,
      } as Edge['data'],
    }
  })
}

const withSelectedGraphNode = (graph: WorkflowGraph, nodeId: string): WorkflowGraph => {
  const nodes = graph.nodes.map((node) => {
    const selected = node.id === nodeId

    if (node.data.selected === selected && node.selected === selected)
      return node

    return {
      ...node,
      selected,
      data: {
        ...node.data,
        selected,
      },
    } as Node
  })

  return {
    nodes,
    edges: withConnectedNodeSelection(graph.edges, nodes),
  }
}

const CONTAINER_NODE_TYPES = new Set<BlockEnum>([
  BlockEnum.Iteration,
  BlockEnum.Loop,
])

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
  const [activeContainerId, setActiveContainerId] = useState<string>()
  const controlMode = useStore(s => s.controlMode)
  const showUserCursors = useStore(s => s.showUserCursors)
  const workflowCanvasHeight = useStore(s => s.workflowCanvasHeight)
  const bottomPanelHeight = useStore(s => s.bottomPanelHeight)
  const setWorkflowCanvasWidth = useStore(s => s.setWorkflowCanvasWidth)
  const setWorkflowCanvasHeight = useStore(s => s.setWorkflowCanvasHeight)
  const setMousePosition = useStore(s => s.setMousePosition)
  const { nodesReadOnly } = useNodesReadOnly()
  const { workflowReadOnly } = useWorkflowReadOnly()
  const { handleSyncWorkflowDraft } = useNodesSyncDraft()
  const { saveStateToHistory } = useWorkflowHistory()
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

  const handleSubgraphChange = useCallback((nextGraph: WorkflowGraph) => {
    setGraph(nextGraph)
  }, [])

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
      onMouseMove={handleMouseMove}
    >
      <CandidateNode />
      <div
        data-testid="workflow-canvas-v2-control"
        className="pointer-events-none absolute top-0 left-0 z-10 flex w-12 items-center justify-center p-1 pl-2"
        style={{ height: controlHeight }}
      >
        <Control onLayout={handleLayout} />
      </div>
      {children}
      <ReactFlow
        nodeTypes={canvasV2NodeTypes}
        edgeTypes={canvasV2EdgeTypes}
        nodes={viewGraph.nodes}
        edges={viewGraph.edges}
        onNodesChange={handleNodesChange}
        onNodeClick={handleNodeClick}
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
