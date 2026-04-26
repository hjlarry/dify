import type {
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import type {
  EdgeMouseHandler,
  NodeChange,
  NodeMouseHandler,
  OnConnect,
  OnConnectEnd,
  OnConnectStart,
  OnSelectionChangeFunc,
} from 'reactflow'
import type {
  Edge,
  Node,
  OnSelectBlock,
} from '../../types'
import {
  act,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  BlockEnum,
} from '../../types'
import {
  CANVAS_V2_HIDDEN_KEY,
  CANVAS_V2_NODE_HEIGHT,
  CANVAS_V2_NODE_WIDTH,
} from '../graph-adapter'
import { WorkflowCanvasV2 } from '../index'

const mockSetNodesInWorkflowStore = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasWidth = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasHeight = vi.hoisted(() => vi.fn())
const mockSetMousePosition = vi.hoisted(() => vi.fn())
const mockReactFlowProps = vi.hoisted(() => vi.fn())
const mockReactFlowSetNodes = vi.hoisted(() => vi.fn())
const mockReactFlowSetViewport = vi.hoisted(() => vi.fn())
const mockReactFlowGetNodes = vi.hoisted(() => vi.fn())
const mockReactFlowGetEdges = vi.hoisted(() => vi.fn())
const mockHandleSyncWorkflowDraft = vi.hoisted(() => vi.fn())
const mockSaveStateToHistory = vi.hoisted(() => vi.fn())
const mockWorkflowStoreSetState = vi.hoisted(() => vi.fn())
const mockGetCanvasV2LayoutNodes = vi.hoisted(() => vi.fn())
const mockHandleNodeAdd = vi.hoisted(() => vi.fn())
const mockHandleNodeConnect = vi.hoisted(() => vi.fn())
const mockHandleNodeConnectStart = vi.hoisted(() => vi.fn())
const mockHandleNodeConnectEnd = vi.hoisted(() => vi.fn())
const mockHandleNodeEnter = vi.hoisted(() => vi.fn())
const mockHandleNodeLeave = vi.hoisted(() => vi.fn())
const mockHandleNodeContextMenu = vi.hoisted(() => vi.fn())
const mockHandleEdgeContextMenu = vi.hoisted(() => vi.fn())
const mockHandleSelectionStart = vi.hoisted(() => vi.fn())
const mockHandleSelectionChange = vi.hoisted(() => vi.fn())
const mockHandleSelectionDrag = vi.hoisted(() => vi.fn())
const mockHandleSelectionContextMenu = vi.hoisted(() => vi.fn())
const mockHandlePaneContextMenu = vi.hoisted(() => vi.fn())
const mockIsValidConnection = vi.hoisted(() => vi.fn())
const mockAvailableBlocks = vi.hoisted(() => ['code', 'answer'])
const mockSetShowConfirm = vi.hoisted(() => vi.fn())
const mockSetShowUserCursors = vi.hoisted(() => vi.fn())
const mockSetShowUserComments = vi.hoisted(() => vi.fn())
const mockUseCanvasV2Shortcuts = vi.hoisted(() => vi.fn())
let mockNodesReadOnly = false
let mockShowConfirm: { title: string, desc?: string, onConfirm: () => void } | undefined

type MockReactFlowProps = {
  children?: ReactNode
  connectionLineComponent?: unknown
  edges?: Array<{ data?: Record<string, unknown>, focusable?: boolean, id: string, selected?: boolean }>
  edgesFocusable?: boolean
  isValidConnection?: unknown
  nodes?: Array<{ data?: Record<string, unknown>, id: string }>
  nodesConnectable?: boolean
  nodesDraggable?: boolean
  onConnect?: OnConnect
  onConnectEnd?: OnConnectEnd
  onConnectStart?: OnConnectStart
  onEdgeMouseEnter?: EdgeMouseHandler
  onEdgeMouseLeave?: EdgeMouseHandler
  onEdgeContextMenu?: EdgeMouseHandler
  onNodeClick?: NodeMouseHandler
  onNodeContextMenu?: NodeMouseHandler
  onNodeMouseEnter?: NodeMouseHandler
  onNodeMouseLeave?: NodeMouseHandler
  onNodesChange?: (changes: NodeChange[]) => void
  onSelectionChange?: OnSelectionChangeFunc
  onSelectionContextMenu?: (event: ReactMouseEvent) => void
  onSelectionDrag?: (event: ReactMouseEvent, nodes: Node[]) => void
  onSelectionStart?: () => void
  onPaneContextMenu?: (event: ReactMouseEvent) => void
  selectionOnDrag?: boolean
}

vi.mock('reactflow', () => ({
  applyNodeChanges: (changes: NodeChange[], nodes: Node[]) => {
    const resetChanges = changes.filter((change): change is Extract<NodeChange, { type: 'reset' }> => change.type === 'reset')
    if (resetChanges.length)
      return resetChanges.map(change => change.item as Node)

    const addChanges = changes.filter((change): change is Extract<NodeChange, { type: 'add' }> => change.type === 'add')
    const initialNodes = addChanges.map(change => change.item as Node)

    return nodes.reduce<Node[]>((result, node) => {
      const nodeChanges = changes.filter(change => 'id' in change && change.id === node.id)
      if (!nodeChanges.length) {
        result.push(node)
        return result
      }

      let nextNode = node
      for (const nodeChange of nodeChanges) {
        if (nodeChange.type === 'remove')
          return result

        if (nodeChange.type === 'position') {
          nextNode = {
            ...nextNode,
            ...(nodeChange.position && { position: nodeChange.position }),
            ...(nodeChange.positionAbsolute && { positionAbsolute: nodeChange.positionAbsolute }),
          } as Node
        }

        if (nodeChange.type === 'select') {
          nextNode = {
            ...nextNode,
            selected: nodeChange.selected,
          } as Node
        }
      }

      result.push(nextNode)
      return result
    }, initialNodes)
  },
  default: (props: MockReactFlowProps) => {
    const {
      children,
      connectionLineComponent,
      edges,
      edgesFocusable,
      isValidConnection,
      nodes,
      nodesConnectable,
      nodesDraggable,
      onConnect,
      onConnectEnd,
      onConnectStart,
      onEdgeMouseEnter,
      onEdgeMouseLeave,
      onEdgeContextMenu,
      onNodeClick,
      onNodeContextMenu,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodesChange,
      onSelectionChange,
      onSelectionContextMenu,
      onSelectionDrag,
      onSelectionStart,
      onPaneContextMenu,
      selectionOnDrag,
    } = props

    mockReactFlowProps({
      connectionLineComponent,
      edges,
      edgesFocusable,
      isValidConnection,
      nodes,
      nodesConnectable,
      nodesDraggable,
      onConnect,
      onConnectEnd,
      onConnectStart,
      onEdgeMouseEnter,
      onEdgeMouseLeave,
      onEdgeContextMenu,
      onNodeClick,
      onNodeContextMenu,
      onNodeMouseEnter,
      onNodeMouseLeave,
      onNodesChange,
      onSelectionChange,
      onSelectionContextMenu,
      onSelectionDrag,
      onSelectionStart,
      onPaneContextMenu,
      selectionOnDrag,
    })
    return <div data-testid="react-flow">{children}</div>
  },
  Background: () => <div data-testid="react-flow-background" />,
  SelectionMode: {
    Partial: 'partial',
  },
  useEdgesState: (edges: unknown[]) => [edges, vi.fn(), vi.fn()],
  useNodesState: (nodes: unknown[]) => [nodes, vi.fn(), vi.fn()],
  useReactFlow: () => ({
    getEdges: mockReactFlowGetEdges,
    getNodes: mockReactFlowGetNodes,
    setNodes: mockReactFlowSetNodes,
    setViewport: mockReactFlowSetViewport,
  }),
}))

vi.mock('@langgenius/dify-ui/alert-dialog', () => ({
  AlertDialog: ({
    children,
    open,
  }: {
    children?: ReactNode
    open?: boolean
  }) => open ? <div data-testid="workflow-canvas-v2-confirm">{children}</div> : null,
  AlertDialogActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogCancelButton: ({ children }: { children?: ReactNode }) => (
    <button type="button">{children}</button>
  ),
  AlertDialogConfirmButton: ({
    children,
    onClick,
  }: {
    children?: ReactNode
    onClick?: () => void
  }) => (
    <button
      type="button"
      data-testid="workflow-canvas-v2-confirm-submit"
      onClick={onClick}
    >
      {children}
    </button>
  ),
  AlertDialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/context/event-emitter', () => ({
  useEventEmitterContextContext: () => ({
    eventEmitter: undefined,
  }),
}))

vi.mock('../../candidate-node', () => ({
  default: () => <div data-testid="candidate-node" />,
}))

vi.mock('../../collaboration/components/user-cursors', () => ({
  default: () => <div data-testid="user-cursors" />,
}))

vi.mock('../../custom-connection-line', () => ({
  default: () => null,
}))

vi.mock('../../panel-contextmenu', () => ({
  default: () => <div data-testid="panel-contextmenu" />,
}))

vi.mock('../../node-contextmenu', () => ({
  default: () => <div data-testid="node-contextmenu" />,
}))

vi.mock('../../edge-contextmenu', () => ({
  default: () => <div data-testid="edge-contextmenu" />,
}))

vi.mock('../../selection-contextmenu', () => ({
  default: () => <div data-testid="selection-contextmenu" />,
}))

vi.mock('../../hooks', () => ({
  useAvailableBlocks: () => ({
    availableNextBlocks: mockAvailableBlocks,
    availablePrevBlocks: mockAvailableBlocks,
  }),
  useNodesInteractions: () => ({
    handleNodeAdd: mockHandleNodeAdd,
    handleNodeConnect: mockHandleNodeConnect,
    handleNodeConnectStart: mockHandleNodeConnectStart,
    handleNodeConnectEnd: mockHandleNodeConnectEnd,
    handleNodeEnter: mockHandleNodeEnter,
    handleNodeLeave: mockHandleNodeLeave,
    handleNodeContextMenu: mockHandleNodeContextMenu,
  }),
  useEdgesInteractions: () => ({
    handleEdgeContextMenu: mockHandleEdgeContextMenu,
  }),
  useNodesSyncDraft: () => ({
    handleSyncWorkflowDraft: mockHandleSyncWorkflowDraft,
  }),
  useSelectionInteractions: () => ({
    handleSelectionStart: mockHandleSelectionStart,
    handleSelectionChange: mockHandleSelectionChange,
    handleSelectionDrag: mockHandleSelectionDrag,
    handleSelectionContextMenu: mockHandleSelectionContextMenu,
  }),
  usePanelInteractions: () => ({
    handlePaneContextMenu: mockHandlePaneContextMenu,
  }),
  useWorkflow: () => ({
    isValidConnection: mockIsValidConnection,
  }),
  useNodesReadOnly: () => ({
    nodesReadOnly: mockNodesReadOnly,
  }),
  useWorkflowHistory: () => ({
    saveStateToHistory: mockSaveStateToHistory,
  }),
  useWorkflowReadOnly: () => ({
    workflowReadOnly: false,
  }),
  WorkflowHistoryEvent: {
    LayoutOrganize: 'LayoutOrganize',
  },
}))

vi.mock('../../operator/control', () => ({
  default: ({
    onLayout,
  }: {
    onLayout: () => void
  }) => (
    <button
      type="button"
      data-testid="workflow-control"
      onClick={onLayout}
    />
  ),
}))

vi.mock('../../operator/zoom-in-out', () => ({
  default: ({
    isCommentMode,
    showMiniMap,
    showMiniMapOption,
    showUserComments,
    showUserCursors,
  }: {
    isCommentMode?: boolean
    showMiniMap?: boolean
    showMiniMapOption?: boolean
    showUserComments?: boolean
    showUserCursors?: boolean
  }) => (
    <div
      data-testid="workflow-canvas-v2-zoom-control-inner"
      data-comment-mode={String(isCommentMode)}
      data-show-mini-map={String(showMiniMap)}
      data-show-mini-map-option={String(showMiniMapOption)}
      data-show-user-comments={String(showUserComments)}
      data-show-user-cursors={String(showUserCursors)}
    />
  ),
}))

vi.mock('../../block-selector', () => ({
  default: ({
    disabled,
    onSelect,
    trigger,
  }: {
    disabled?: boolean
    onSelect: OnSelectBlock
    trigger?: (open: boolean) => ReactNode
  }) => (
    <div
      data-testid="workflow-canvas-v2-container-subgraph-selector"
      onClick={() => {
        if (!disabled)
          onSelect('code' as Parameters<OnSelectBlock>[0])
      }}
    >
      {trigger?.(false)}
    </div>
  ),
}))

vi.mock('../layout/elk-layout', () => ({
  getCanvasV2LayoutNodes: (...args: unknown[]) => mockGetCanvasV2LayoutNodes(...args),
}))

vi.mock('../shortcuts', () => ({
  useCanvasV2Shortcuts: (...args: unknown[]) => mockUseCanvasV2Shortcuts(...args),
}))

vi.mock('../../store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    controlMode: 'pointer',
    showUserCursors: true,
    setShowUserCursors: mockSetShowUserCursors,
    showUserComments: true,
    setShowUserComments: mockSetShowUserComments,
    workflowCanvasHeight: 600,
    bottomPanelHeight: 100,
    setWorkflowCanvasWidth: mockSetWorkflowCanvasWidth,
    setWorkflowCanvasHeight: mockSetWorkflowCanvasHeight,
    setMousePosition: mockSetMousePosition,
    setShowConfirm: mockSetShowConfirm,
    showConfirm: mockShowConfirm,
  }),
  useWorkflowStore: () => ({
    getState: () => ({
      setNodes: mockSetNodesInWorkflowStore,
    }),
    setState: mockWorkflowStoreSetState,
  }),
}))

vi.mock('../../utils/node-navigation', () => ({
  setupScrollToNodeListener: () => vi.fn(),
}))

vi.mock('../node-types', () => ({
  canvasV2EdgeTypes: {},
  canvasV2NodeTypes: {},
}))

type NodeFactoryInput = Omit<Partial<Node>, 'data' | 'id' | 'position' | 'type'> & Pick<Node, 'id'> & {
  data?: Partial<Node['data']> & Record<string, unknown>
  position?: Node['position']
  type?: Node['type']
}

type EdgeFactoryInput = Omit<Partial<Edge>, 'data' | 'id' | 'source' | 'sourceHandle' | 'target' | 'targetHandle'> & Pick<Edge, 'id' | 'source' | 'target'> & {
  data?: Partial<Edge['data']>
  sourceHandle?: Edge['sourceHandle']
  targetHandle?: Edge['targetHandle']
}

const makeNode = ({
  data,
  id,
  position,
  type,
  ...node
}: NodeFactoryInput): Node => ({
  id,
  type: type ?? 'custom',
  position: position ?? { x: 0, y: 0 },
  data: {
    type: BlockEnum.Code,
    title: id,
    desc: '',
    ...data,
  } as Node['data'],
  ...node,
} as Node)

const makeEdge = ({
  data,
  id,
  source,
  sourceHandle,
  target,
  targetHandle,
  ...edge
}: EdgeFactoryInput): Edge => ({
  id,
  source,
  target,
  sourceHandle: sourceHandle ?? 'source',
  targetHandle: targetHandle ?? 'target',
  data: {
    sourceType: BlockEnum.Code,
    targetType: BlockEnum.Code,
    ...data,
  } as Edge['data'],
  ...edge,
} as Edge)

describe('WorkflowCanvasV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNodesReadOnly = false
    mockShowConfirm = undefined
    mockReactFlowGetNodes.mockReturnValue([])
    mockReactFlowGetEdges.mockReturnValue([])
    mockGetCanvasV2LayoutNodes.mockImplementation(async (nodes: Node[]) => nodes)
  })

  // Renderer shell keeps legacy operation affordances until v2 replacements exist.
  describe('Rendering', () => {
    it('should render the quick operation layer with the canvas', () => {
      render(
        <WorkflowCanvasV2
          nodes={[makeNode({ id: 'node-1' })]}
          edges={[makeEdge({ id: 'edge-1', source: 'node-1', target: 'node-1' })]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        >
          <div data-testid="workflow-children" />
        </WorkflowCanvasV2>,
      )

      expect(screen.getByTestId('workflow-canvas-v2')).toBeInTheDocument()
      expect(screen.getByTestId('candidate-node')).toBeInTheDocument()
      expect(screen.getByTestId('panel-contextmenu')).toBeInTheDocument()
      expect(screen.getByTestId('node-contextmenu')).toBeInTheDocument()
      expect(screen.getByTestId('edge-contextmenu')).toBeInTheDocument()
      expect(screen.getByTestId('selection-contextmenu')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-control')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-control')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-zoom-controls')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-zoom-control-inner')).toHaveAttribute('data-show-mini-map', 'false')
      expect(screen.getByTestId('workflow-canvas-v2-zoom-control-inner')).toHaveAttribute('data-show-mini-map-option', 'false')
      expect(screen.getByTestId('workflow-children')).toBeInTheDocument()
      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
      expect(mockUseCanvasV2Shortcuts).toHaveBeenCalledWith(expect.objectContaining({
        handleLayout: expect.any(Function),
        onGraphChange: expect.any(Function),
      }))
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        connectionLineComponent: expect.any(Function),
        edgesFocusable: false,
        isValidConnection: mockIsValidConnection,
        nodesConnectable: true,
        nodesDraggable: true,
        onConnect: expect.any(Function),
        onConnectEnd: expect.any(Function),
        onConnectStart: expect.any(Function),
        onEdgeContextMenu: expect.any(Function),
        onNodeContextMenu: expect.any(Function),
        onNodeMouseEnter: expect.any(Function),
        onNodeMouseLeave: expect.any(Function),
        onNodesChange: expect.any(Function),
        onPaneContextMenu: expect.any(Function),
        onSelectionChange: expect.any(Function),
        onSelectionContextMenu: expect.any(Function),
        onSelectionDrag: expect.any(Function),
        onSelectionStart: expect.any(Function),
        selectionOnDrag: true,
      }))
    })

    it('should render workflow confirmation and sync the graph after confirming', async () => {
      const loopNode = makeNode({
        id: 'loop-1',
        data: { type: BlockEnum.Loop, title: 'Loop', desc: '' },
      })
      const afterNode = makeNode({
        id: 'after',
        data: { type: BlockEnum.Answer, title: 'After', desc: '' },
        position: { x: 260, y: 0 },
      })
      const confirm = vi.fn(() => {
        mockReactFlowGetNodes.mockReturnValue([afterNode])
        mockReactFlowGetEdges.mockReturnValue([])
      })
      mockShowConfirm = {
        title: 'Delete loop',
        desc: 'Delete children',
        onConfirm: confirm,
      }

      render(
        <WorkflowCanvasV2
          nodes={[loopNode, afterNode]}
          edges={[makeEdge({ id: 'loop-after', source: 'loop-1', target: 'after' })]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      expect(screen.getByTestId('workflow-canvas-v2-confirm')).toBeInTheDocument()
      expect(screen.getByText('Delete loop')).toBeInTheDocument()

      act(() => {
        screen.getByTestId('workflow-canvas-v2-confirm-submit').click()
      })

      expect(confirm).toHaveBeenCalledTimes(1)
      await waitFor(() => {
        expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
          edges: [],
          nodes: [
            expect.objectContaining({ id: 'after' }),
          ],
        }))
      })
    })

    it('should render the collapsed view graph and keep raw nodes in workflow store', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: { type: BlockEnum.Loop, title: 'Loop', desc: '' },
        }),
        makeNode({
          id: 'loop-child',
          parentId: 'loop-1',
          data: { type: BlockEnum.Code, title: 'Child', desc: '', isInLoop: true },
        }),
        makeNode({
          id: 'after',
          data: { type: BlockEnum.End, title: 'End', desc: '' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'internal',
          source: 'loop-child',
          target: 'after',
          data: { isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'external',
          source: 'loop-1',
          target: 'after',
          data: { sourceType: BlockEnum.Loop, targetType: BlockEnum.End },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      expect(mockSetNodesInWorkflowStore).toHaveBeenCalledWith(nodes)
      expect(mockReactFlowProps).toHaveBeenCalledWith(expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'loop-1' }),
          expect.objectContaining({
            data: expect.objectContaining({ [CANVAS_V2_HIDDEN_KEY]: true }),
            id: 'loop-child',
          }),
          expect.objectContaining({ id: 'after' }),
        ],
        edges: [
          expect.objectContaining({
            data: expect.objectContaining({ [CANVAS_V2_HIDDEN_KEY]: true }),
            id: 'internal',
          }),
          expect.objectContaining({ id: 'external' }),
        ],
      }))
    })

    it('should track edge hover state for middle insertion controls', () => {
      const nodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
        makeNode({ id: 'code' }),
      ]
      const edge = makeEdge({
        id: 'start-code',
        source: 'start',
        target: 'code',
        data: { sourceType: BlockEnum.Start, targetType: BlockEnum.Code },
        focusable: true,
        selected: true,
      })
      const currentNodes = [
        {
          ...nodes[0]!,
          data: {
            ...nodes[0]!.data,
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          height: CANVAS_V2_NODE_HEIGHT,
          style: {
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          width: CANVAS_V2_NODE_WIDTH,
        },
        {
          ...nodes[1]!,
          data: {
            ...nodes[1]!.data,
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          height: CANVAS_V2_NODE_HEIGHT,
          style: {
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          width: CANVAS_V2_NODE_WIDTH,
        },
      ]

      mockReactFlowGetNodes.mockReturnValue(currentNodes)
      mockReactFlowGetEdges.mockReturnValue([edge])

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[edge]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onEdgeMouseEnter?.({} as never, edge)
      })

      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        edges: [
          expect.objectContaining({
            data: expect.objectContaining({ _hovering: true }),
            id: 'start-code',
            focusable: false,
            selected: false,
          }),
        ],
      }))

      const hoveredReactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        hoveredReactFlowProps.onEdgeMouseLeave?.({} as never, edge)
      })

      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        edges: [
          expect.objectContaining({
            data: expect.objectContaining({ _hovering: false }),
            id: 'start-code',
            focusable: false,
            selected: false,
          }),
        ],
      }))
    })

    it('should delegate node connection to legacy interactions and sync the v2 graph', async () => {
      const nodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start, title: 'Start' } }),
        makeNode({ id: 'code', position: { x: 260, y: 0 } }),
      ]
      const nextNodes = nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          _connectedSourceHandleIds: node.id === 'start' ? ['source'] : node.data._connectedSourceHandleIds,
          _connectedTargetHandleIds: node.id === 'code' ? ['target'] : node.data._connectedTargetHandleIds,
        },
      }))
      const nextEdges = [
        makeEdge({
          id: 'start-source-code-target',
          source: 'start',
          target: 'code',
          data: { sourceType: BlockEnum.Start, targetType: BlockEnum.Code },
        }),
      ]

      mockHandleNodeConnect.mockImplementation(() => {
        mockReactFlowGetNodes.mockReturnValue(nextNodes)
        mockReactFlowGetEdges.mockReturnValue(nextEdges)
      })

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onConnect?.({
          source: 'start',
          sourceHandle: 'source',
          target: 'code',
          targetHandle: 'target',
        })
      })

      expect(mockHandleNodeConnect).toHaveBeenCalledWith({
        source: 'start',
        sourceHandle: 'source',
        target: 'code',
        targetHandle: 'target',
      })
      expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith(nextNodes)
      await waitFor(() => {
        expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
          edges: [
            expect.objectContaining({ id: 'start-source-code-target' }),
          ],
          nodes: [
            expect.objectContaining({ id: 'start' }),
            expect.objectContaining({ id: 'code' }),
          ],
        }))
      })
    })

    it('should delegate selection changes and sync bundled nodes for multi-select', async () => {
      const nodes = [
        makeNode({ id: 'code-1' }),
        makeNode({ id: 'code-2', position: { x: 260, y: 0 } }),
      ]
      const bundledNodes = nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          _isBundled: true,
        },
      }))

      mockHandleSelectionChange.mockImplementation(() => {
        mockReactFlowGetNodes.mockReturnValue(bundledNodes)
        mockReactFlowGetEdges.mockReturnValue([])
      })

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onSelectionChange?.({
          edges: [],
          nodes,
        })
      })

      expect(mockHandleSelectionChange).toHaveBeenCalledWith({
        edges: [],
        nodes,
      })
      expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith(bundledNodes)
      await waitFor(() => {
        expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
          nodes: [
            expect.objectContaining({
              data: expect.objectContaining({ _isBundled: true }),
              id: 'code-1',
            }),
            expect.objectContaining({
              data: expect.objectContaining({ _isBundled: true }),
              id: 'code-2',
            }),
          ],
        }))
      })
    })

    it('should delegate node context menu and sync selection from the workflow store', async () => {
      const nodes = [
        makeNode({ id: 'code-1' }),
        makeNode({ id: 'code-2', position: { x: 260, y: 0 } }),
      ]
      const selectedNodes = nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          selected: node.id === 'code-2',
        },
      }))
      mockHandleNodeContextMenu.mockImplementation(() => {
        mockReactFlowGetNodes.mockReturnValue(selectedNodes)
        mockReactFlowGetEdges.mockReturnValue([])
      })

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeContextMenu?.({} as never, nodes[1]!)
      })

      expect(mockHandleNodeContextMenu).toHaveBeenCalledWith({}, nodes[1])
      await waitFor(() => {
        expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
          nodes: [
            expect.objectContaining({
              data: expect.objectContaining({ selected: false }),
              id: 'code-1',
            }),
            expect.objectContaining({
              data: expect.objectContaining({ selected: true }),
              id: 'code-2',
            }),
          ],
        }))
      })
    })

    it('should delegate edge context menu and sync cleared node selection from the workflow store', async () => {
      const selectedNode = makeNode({
        id: 'code-1',
        data: { selected: true },
      })
      const nextNode = {
        ...selectedNode,
        data: {
          ...selectedNode.data,
          selected: false,
        },
      }
      const edge = makeEdge({
        id: 'code-1-code-1',
        source: 'code-1',
        target: 'code-1',
      })
      mockHandleEdgeContextMenu.mockImplementation(() => {
        mockReactFlowGetNodes.mockReturnValue([nextNode])
        mockReactFlowGetEdges.mockReturnValue([edge])
      })

      render(
        <WorkflowCanvasV2
          nodes={[selectedNode]}
          edges={[edge]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onEdgeContextMenu?.({} as never, edge)
      })

      expect(mockHandleEdgeContextMenu).toHaveBeenCalledWith({}, edge)
      await waitFor(() => {
        expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
          nodes: [
            expect.objectContaining({
              data: expect.objectContaining({ selected: false }),
              id: 'code-1',
            }),
          ],
        }))
      })
    })

    it('should delegate pane and selection context menus to legacy interactions', () => {
      const nodes = [
        makeNode({ id: 'code-1' }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps
      const paneEvent = { clientX: 10, clientY: 20 } as ReactMouseEvent
      const selectionEvent = { clientX: 30, clientY: 40 } as ReactMouseEvent

      act(() => {
        reactFlowProps.onPaneContextMenu?.(paneEvent)
        reactFlowProps.onSelectionContextMenu?.(selectionEvent)
      })

      expect(mockHandlePaneContextMenu).toHaveBeenCalledWith(paneEvent)
      expect(mockHandleSelectionContextMenu).toHaveBeenCalledWith(selectionEvent)
    })

    it('should select the container and open its subgraph when clicking a loop node', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            type: BlockEnum.Loop,
            title: 'Loop',
            desc: '',
            start_node_id: 'loop-start',
            _children: [
              { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
              { nodeId: 'code-1', nodeType: BlockEnum.Code },
            ],
          },
        }),
        makeNode({
          id: 'loop-start',
          parentId: 'loop-1',
          data: { type: BlockEnum.LoopStart, title: '', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-1',
          parentId: 'loop-1',
          position: { x: 260, y: 0 },
          data: { type: BlockEnum.Code, title: 'Code child', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'loop-start-code',
          source: 'loop-start',
          target: 'code-1',
          data: { sourceType: BlockEnum.LoopStart, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeClick?.({} as never, nodes[0]!)
      })

      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph-linear-layout')).toBeInTheDocument()
      expect(screen.getByText('Loop')).toBeInTheDocument()
      expect(screen.getByText('Code child')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph-start')).toBeInTheDocument()
      expect(screen.getAllByTestId('workflow-canvas-v2-container-subgraph-node')).toHaveLength(1)
      expect(screen.queryByRole('button', { name: /common\.operation\.back/ })).not.toBeInTheDocument()
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              selected: true,
            }),
            id: 'loop-1',
            selected: true,
          }),
        ]),
      }))

      act(() => {
        screen.getByRole('button', { name: 'Code child' }).click()
      })

      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              selected: false,
            }),
            id: 'loop-1',
            selected: false,
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              selected: true,
            }),
            id: 'code-1',
            selected: true,
          }),
        ]),
      }))

      act(() => {
        screen.getByRole('button', { name: 'Loop' }).click()
      })

      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: expect.arrayContaining([
          expect.objectContaining({
            data: expect.objectContaining({
              selected: true,
            }),
            id: 'loop-1',
            selected: true,
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              selected: false,
            }),
            id: 'code-1',
            selected: false,
          }),
        ]),
      }))

      act(() => {
        screen.getByRole('button', { name: /common\.operation\.close/ }).click()
      })

      expect(screen.queryByTestId('workflow-canvas-v2-container-subgraph')).not.toBeInTheDocument()
    })

    it('should add a node between connected container children from the subgraph', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            type: BlockEnum.Loop,
            title: 'Loop',
            desc: '',
            start_node_id: 'loop-start',
            _children: [
              { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
              { nodeId: 'code-1', nodeType: BlockEnum.Code },
            ],
          },
        }),
        makeNode({
          id: 'loop-start',
          parentId: 'loop-1',
          data: { type: BlockEnum.LoopStart, title: '', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-1',
          parentId: 'loop-1',
          position: { x: 260, y: 0 },
          data: { type: BlockEnum.Code, title: 'Code child', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'loop-start-code',
          source: 'loop-start',
          sourceHandle: 'source',
          target: 'code-1',
          targetHandle: 'target',
          data: { sourceType: BlockEnum.LoopStart, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeClick?.({} as never, nodes[0]!)
      })

      screen.getAllByTestId('workflow-canvas-v2-container-subgraph-add')[0]!.click()

      expect(mockHandleNodeAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          nodeType: BlockEnum.Code,
        }),
        {
          nextNodeId: 'code-1',
          nextNodeTargetHandle: 'target',
          prevNodeId: 'loop-start',
          prevNodeSourceHandle: 'source',
        },
      )
    })

    it('should order container subgraph nodes by internal edges when positions are stale', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            type: BlockEnum.Loop,
            title: 'Loop',
            desc: '',
            start_node_id: 'loop-start',
            _children: [
              { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
              { nodeId: 'code-first', nodeType: BlockEnum.Code },
              { nodeId: 'code-second', nodeType: BlockEnum.Code },
            ],
          },
        }),
        makeNode({
          id: 'loop-start',
          parentId: 'loop-1',
          data: { type: BlockEnum.LoopStart, title: '', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-first',
          parentId: 'loop-1',
          position: { x: 520, y: 0 },
          data: { type: BlockEnum.Code, title: 'Code first', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-second',
          parentId: 'loop-1',
          position: { x: 260, y: 0 },
          data: { type: BlockEnum.Code, title: 'Code second', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'loop-start-code-first',
          source: 'loop-start',
          target: 'code-first',
          data: { sourceType: BlockEnum.LoopStart, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'code-first-code-second',
          source: 'code-first',
          target: 'code-second',
          data: { sourceType: BlockEnum.Code, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeClick?.({} as never, nodes[0]!)
      })

      const subgraphNodes = screen.getAllByTestId('workflow-canvas-v2-container-subgraph-node')

      expect(subgraphNodes[0]).toHaveTextContent('Code first')
      expect(subgraphNodes[1]).toHaveTextContent('Code second')
    })

    it('should render container subgraph branches without flattening branch targets', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            type: BlockEnum.Loop,
            title: 'Loop',
            desc: '',
            start_node_id: 'loop-start',
            _children: [
              { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
              { nodeId: 'route', nodeType: BlockEnum.IfElse },
              { nodeId: 'code-if', nodeType: BlockEnum.Code },
              { nodeId: 'code-else', nodeType: BlockEnum.Code },
            ],
          },
        }),
        makeNode({
          id: 'loop-start',
          parentId: 'loop-1',
          data: { type: BlockEnum.LoopStart, title: '', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'route',
          parentId: 'loop-1',
          position: { x: 260, y: 0 },
          data: {
            type: BlockEnum.IfElse,
            title: 'Route',
            desc: '',
            cases: [{ case_id: 'case-a' }],
            isInLoop: true,
            loop_id: 'loop-1',
          },
        }),
        makeNode({
          id: 'code-if',
          parentId: 'loop-1',
          position: { x: 520, y: 80 },
          data: { type: BlockEnum.Code, title: 'Code if', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-else',
          parentId: 'loop-1',
          position: { x: 520, y: -80 },
          data: { type: BlockEnum.Code, title: 'Code else', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'loop-start-route',
          source: 'loop-start',
          target: 'route',
          data: { sourceType: BlockEnum.LoopStart, targetType: BlockEnum.IfElse, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'route-code-if',
          source: 'route',
          sourceHandle: 'case-a',
          target: 'code-if',
          data: { sourceType: BlockEnum.IfElse, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'route-code-else',
          source: 'route',
          sourceHandle: 'false',
          target: 'code-else',
          data: { sourceType: BlockEnum.IfElse, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeClick?.({} as never, nodes[0]!)
      })

      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph-branch-layout')).toBeInTheDocument()
      expect(screen.queryByTestId('workflow-canvas-v2-container-subgraph-linear-layout')).not.toBeInTheDocument()
      const branchRows = screen.getAllByTestId('workflow-canvas-v2-container-subgraph-branch')

      expect(branchRows).toHaveLength(2)
      expect(branchRows[0]).toHaveTextContent('IF')
      expect(branchRows[0]).toHaveTextContent('Code if')
      expect(branchRows[1]).toHaveTextContent('ELSE')
      expect(branchRows[1]).toHaveTextContent('Code else')
      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph-branch-spine')).toBeInTheDocument()
      expect(screen.getAllByTestId('workflow-canvas-v2-container-subgraph-branch-label').map(label => label.textContent)).toEqual(['IF', 'ELSE'])
      expect(screen.getByRole('button', { name: 'Code if' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Code else' })).toBeInTheDocument()
    })

    it('should render shared merge nodes once after container subgraph branches', () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            type: BlockEnum.Loop,
            title: 'Loop',
            desc: '',
            start_node_id: 'loop-start',
            _children: [
              { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
              { nodeId: 'route', nodeType: BlockEnum.IfElse },
              { nodeId: 'code-if', nodeType: BlockEnum.Code },
              { nodeId: 'code-else', nodeType: BlockEnum.Code },
              { nodeId: 'join', nodeType: BlockEnum.TemplateTransform },
            ],
          },
        }),
        makeNode({
          id: 'loop-start',
          parentId: 'loop-1',
          data: { type: BlockEnum.LoopStart, title: '', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'route',
          parentId: 'loop-1',
          position: { x: 260, y: 0 },
          data: {
            type: BlockEnum.IfElse,
            title: 'Route',
            desc: '',
            cases: [{ case_id: 'case-a' }],
            isInLoop: true,
            loop_id: 'loop-1',
          },
        }),
        makeNode({
          id: 'code-if',
          parentId: 'loop-1',
          position: { x: 520, y: -80 },
          data: { type: BlockEnum.Code, title: 'Code if', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'code-else',
          parentId: 'loop-1',
          position: { x: 520, y: 80 },
          data: { type: BlockEnum.Code, title: 'Code else', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
        makeNode({
          id: 'join',
          parentId: 'loop-1',
          position: { x: 780, y: 0 },
          data: { type: BlockEnum.TemplateTransform, title: 'Join', desc: '', isInLoop: true, loop_id: 'loop-1' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'loop-start-route',
          source: 'loop-start',
          target: 'route',
          data: { sourceType: BlockEnum.LoopStart, targetType: BlockEnum.IfElse, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'route-code-if',
          source: 'route',
          sourceHandle: 'case-a',
          target: 'code-if',
          data: { sourceType: BlockEnum.IfElse, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'route-code-else',
          source: 'route',
          sourceHandle: 'false',
          target: 'code-else',
          data: { sourceType: BlockEnum.IfElse, targetType: BlockEnum.Code, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'code-if-join',
          source: 'code-if',
          target: 'join',
          data: { sourceType: BlockEnum.Code, targetType: BlockEnum.TemplateTransform, isInLoop: true, loop_id: 'loop-1' },
        }),
        makeEdge({
          id: 'code-else-join',
          source: 'code-else',
          target: 'join',
          data: { sourceType: BlockEnum.Code, targetType: BlockEnum.TemplateTransform, isInLoop: true, loop_id: 'loop-1' },
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodeClick?.({} as never, nodes[0]!)
      })

      expect(screen.getByTestId('workflow-canvas-v2-container-subgraph-merge')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Join' })).toHaveLength(1)
    })

    it('should update the raw graph when visible nodes move', async () => {
      const nodes = [
        makeNode({ id: 'node-1' }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            id: 'node-1',
            type: 'position',
            position: { x: 24, y: 48 },
          },
        ])
      })

      await waitFor(() => {
        expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith([
          expect.objectContaining({
            id: 'node-1',
            position: { x: 24, y: 48 },
          }),
        ])
      })
    })

    it('should sync selected nodes into node data for the right panel', async () => {
      const nodes = [
        makeNode({ id: 'loop-1', data: { type: BlockEnum.Loop, title: 'Loop', desc: '' } }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer, title: 'Answer', desc: '' } }),
      ]
      const edges = [
        makeEdge({ id: 'loop-answer', source: 'loop-1', target: 'answer' }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            id: 'loop-1',
            selected: true,
            type: 'select',
          },
        ])
      })

      await waitFor(() => {
        expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith([
          expect.objectContaining({
            data: expect.objectContaining({
              selected: true,
              type: BlockEnum.Loop,
            }),
            id: 'loop-1',
            selected: true,
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              selected: false,
              type: BlockEnum.Answer,
            }),
            id: 'answer',
            selected: false,
          }),
        ])
      })
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        edges: [
          expect.objectContaining({
            data: expect.objectContaining({
              _connectedNodeIsSelected: true,
            }),
            id: 'loop-answer',
          }),
        ],
        nodes: [
          expect.objectContaining({
            data: expect.objectContaining({ selected: true }),
            id: 'loop-1',
          }),
          expect.objectContaining({
            data: expect.objectContaining({ selected: false }),
            id: 'answer',
          }),
        ],
      }))
    })

    it('should keep nodes added through React Flow interactions when selecting them', async () => {
      const initialNodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start, title: 'Start', desc: '' } }),
      ]
      const addedNode = makeNode({
        data: { type: BlockEnum.Answer, title: 'Answer', desc: '' },
        id: 'answer',
        position: { x: 260, y: 0 },
      })
      const currentNodes = [
        {
          ...initialNodes[0]!,
          data: {
            ...initialNodes[0]!.data,
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          height: CANVAS_V2_NODE_HEIGHT,
          style: {
            height: CANVAS_V2_NODE_HEIGHT,
            width: CANVAS_V2_NODE_WIDTH,
          },
          width: CANVAS_V2_NODE_WIDTH,
        },
        addedNode,
      ]

      mockReactFlowGetNodes.mockReturnValue(currentNodes)
      mockReactFlowGetEdges.mockReturnValue([])

      render(
        <WorkflowCanvasV2
          nodes={initialNodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            id: 'answer',
            selected: true,
            type: 'select',
          },
        ])
      })

      await waitFor(() => {
        expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith([
          expect.objectContaining({
            data: expect.objectContaining({
              selected: false,
              type: BlockEnum.Start,
            }),
            id: 'start',
            selected: false,
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              selected: true,
              type: BlockEnum.Answer,
            }),
            id: 'answer',
            selected: true,
          }),
        ])
      })

      const lastNodes = mockSetNodesInWorkflowStore.mock.calls.at(-1)?.[0] as Node[]
      expect(lastNodes).toHaveLength(2)
      expect(lastNodes[0]!.width).toBeUndefined()
      expect(lastNodes[0]!.height).toBeUndefined()
      expect(lastNodes[0]!.style).toBeUndefined()
      expect((lastNodes[0]!.data as Record<string, unknown>).width).toBeUndefined()
      expect((lastNodes[0]!.data as Record<string, unknown>).height).toBeUndefined()
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'start' }),
          expect.objectContaining({ id: 'answer' }),
        ],
      }))
    })

    it('should clear selected node data when React Flow clears selection', async () => {
      const nodes = [
        makeNode({
          id: 'loop-1',
          data: {
            selected: true,
            type: BlockEnum.Loop,
          },
          selected: true,
        }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer } }),
      ]
      const edges = [
        makeEdge({
          data: {
            _connectedNodeIsSelected: true,
          },
          id: 'loop-answer',
          source: 'loop-1',
          target: 'answer',
        }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            id: 'loop-1',
            selected: false,
            type: 'select',
          },
        ])
      })

      await waitFor(() => {
        expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith([
          expect.objectContaining({
            data: expect.objectContaining({ selected: false }),
            id: 'loop-1',
            selected: false,
          }),
          expect.objectContaining({
            data: expect.objectContaining({ selected: false }),
            id: 'answer',
            selected: false,
          }),
        ])
      })
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        edges: [
          expect.objectContaining({
            data: expect.objectContaining({
              _connectedNodeIsSelected: false,
            }),
            id: 'loop-answer',
          }),
        ],
      }))
    })

    it('should ignore React Flow measurement updates for compact nodes', () => {
      const nodes = [
        makeNode({ id: 'node-1' }),
      ]

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps
      const workflowStoreCallCount = mockSetNodesInWorkflowStore.mock.calls.length

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            dimensions: { width: 204, height: 52 },
            id: 'node-1',
            type: 'dimensions',
          },
        ])
      })

      expect(mockSetNodesInWorkflowStore).toHaveBeenCalledTimes(workflowStoreCallCount)
    })

    it('should apply non-measurement node changes to the raw graph', async () => {
      const nodes = [
        makeNode({ id: 'node-1' }),
      ]
      const nextNode = makeNode({
        id: 'node-2',
        data: { type: BlockEnum.Answer },
        position: { x: 260, y: 80 },
      })

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      const reactFlowProps = mockReactFlowProps.mock.calls.at(-1)?.[0] as MockReactFlowProps

      act(() => {
        reactFlowProps.onNodesChange?.([
          {
            item: nextNode,
            type: 'reset',
          },
        ])
      })

      await waitFor(() => {
        expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith([
          expect.objectContaining({
            id: 'node-2',
            position: { x: 260, y: 80 },
          }),
        ])
      })
    })

    it('should write organized nodes to workflow store before saving history', async () => {
      const nodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
        makeNode({ id: 'list', data: { type: BlockEnum.ListFilter } }),
      ]
      const edges = [
        makeEdge({ id: 'start-list', source: 'start', target: 'list' }),
      ]
      const nextNodes = [
        { ...nodes[0]!, position: { x: 0, y: 0 } },
        { ...nodes[1]!, position: { x: 260, y: 0 } },
      ]
      mockGetCanvasV2LayoutNodes.mockResolvedValueOnce(nextNodes)

      render(
        <WorkflowCanvasV2
          nodes={nodes}
          edges={edges}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      await act(async () => {
        screen.getByTestId('workflow-control').click()
      })

      expect(mockGetCanvasV2LayoutNodes).toHaveBeenCalledWith(nodes, edges)
      expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith(nextNodes)
      const organizedNodesStoreCallIndex = mockSetNodesInWorkflowStore.mock.calls.findIndex(call => call[0] === nextNodes)

      expect(organizedNodesStoreCallIndex).toBeGreaterThanOrEqual(0)
      expect(mockSetNodesInWorkflowStore.mock.invocationCallOrder[organizedNodesStoreCallIndex]).toBeLessThan(mockSaveStateToHistory.mock.invocationCallOrder[0]!)
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'start', position: { x: 0, y: 0 } }),
          expect.objectContaining({ id: 'list', position: { x: 260, y: 0 } }),
        ],
      }))
    })

    it('should organize the current React Flow graph when it has newer nodes', async () => {
      const staleNodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
      ]
      const currentNodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start }, position: { x: 0, y: 40 } }),
        makeNode({ id: 'list', data: { type: BlockEnum.ListFilter }, position: { x: 260, y: 60 } }),
      ]
      const currentEdges = [
        makeEdge({ id: 'start-list', source: 'start', target: 'list' }),
      ]
      const nextNodes = [
        { ...currentNodes[0]!, position: { x: 0, y: 0 } },
        { ...currentNodes[1]!, position: { x: 260, y: 0 } },
      ]
      mockReactFlowGetNodes.mockReturnValue(currentNodes)
      mockReactFlowGetEdges.mockReturnValue(currentEdges)
      mockGetCanvasV2LayoutNodes.mockResolvedValueOnce(nextNodes)

      render(
        <WorkflowCanvasV2
          nodes={staleNodes}
          edges={[]}
          viewport={{ x: 0, y: 0, zoom: 1 }}
        />,
      )

      await act(async () => {
        screen.getByTestId('workflow-control').click()
      })

      expect(mockGetCanvasV2LayoutNodes).toHaveBeenCalledWith(currentNodes, currentEdges)
      expect(mockSetNodesInWorkflowStore).toHaveBeenLastCalledWith(nextNodes)
      expect(mockReactFlowSetNodes).not.toHaveBeenCalled()
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        nodes: [
          expect.objectContaining({ id: 'start', position: { x: 0, y: 0 } }),
          expect.objectContaining({ id: 'list', position: { x: 260, y: 0 } }),
        ],
      }))
    })
  })
})
