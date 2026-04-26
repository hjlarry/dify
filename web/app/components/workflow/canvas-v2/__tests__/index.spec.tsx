import type { ReactNode } from 'react'
import type {
  EdgeMouseHandler,
  NodeChange,
  NodeMouseHandler,
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
const mockAvailableBlocks = vi.hoisted(() => ['code', 'answer'])
let mockNodesReadOnly = false

type MockReactFlowProps = {
  children?: ReactNode
  edges?: Array<{ data?: Record<string, unknown>, focusable?: boolean, id: string, selected?: boolean }>
  edgesFocusable?: boolean
  nodes?: Array<{ data?: Record<string, unknown>, id: string }>
  nodesDraggable?: boolean
  onEdgeMouseEnter?: EdgeMouseHandler
  onEdgeMouseLeave?: EdgeMouseHandler
  onNodeClick?: NodeMouseHandler
  onNodesChange?: (changes: NodeChange[]) => void
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
      edges,
      edgesFocusable,
      nodes,
      nodesDraggable,
      onEdgeMouseEnter,
      onEdgeMouseLeave,
      onNodeClick,
      onNodesChange,
    } = props

    mockReactFlowProps({
      edges,
      edgesFocusable,
      nodes,
      nodesDraggable,
      onEdgeMouseEnter,
      onEdgeMouseLeave,
      onNodeClick,
      onNodesChange,
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

vi.mock('../../hooks', () => ({
  useAvailableBlocks: () => ({
    availableNextBlocks: mockAvailableBlocks,
    availablePrevBlocks: mockAvailableBlocks,
  }),
  useNodesInteractions: () => ({
    handleNodeAdd: mockHandleNodeAdd,
  }),
  useNodesSyncDraft: () => ({
    handleSyncWorkflowDraft: mockHandleSyncWorkflowDraft,
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

vi.mock('../../store', () => ({
  useStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    controlMode: 'pointer',
    showUserCursors: true,
    workflowCanvasHeight: 600,
    bottomPanelHeight: 100,
    setWorkflowCanvasWidth: mockSetWorkflowCanvasWidth,
    setWorkflowCanvasHeight: mockSetWorkflowCanvasHeight,
    setMousePosition: mockSetMousePosition,
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
      expect(screen.getByTestId('workflow-canvas-v2-control')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-control')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-children')).toBeInTheDocument()
      expect(screen.getByTestId('react-flow')).toBeInTheDocument()
      expect(mockReactFlowProps).toHaveBeenLastCalledWith(expect.objectContaining({
        edgesFocusable: false,
        nodesDraggable: true,
        onNodesChange: expect.any(Function),
      }))
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
