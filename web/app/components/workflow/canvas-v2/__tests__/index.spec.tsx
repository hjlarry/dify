import type { ReactNode } from 'react'
import type { NodeChange } from 'reactflow'
import type {
  Edge,
  Node,
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
} from '../graph-adapter'
import { WorkflowCanvasV2 } from '../index'

const mockSetNodesInWorkflowStore = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasWidth = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasHeight = vi.hoisted(() => vi.fn())
const mockSetMousePosition = vi.hoisted(() => vi.fn())
const mockReactFlowProps = vi.hoisted(() => vi.fn())
let mockNodesReadOnly = false

type MockReactFlowProps = {
  children?: ReactNode
  edges?: Array<{ data?: Record<string, unknown>, id: string }>
  nodes?: Array<{ data?: Record<string, unknown>, id: string }>
  nodesDraggable?: boolean
  onNodesChange?: (changes: NodeChange[]) => void
}

vi.mock('reactflow', () => ({
  applyNodeChanges: (changes: NodeChange[], nodes: Node[]) => {
    return nodes.map((node) => {
      const positionChange = changes.find(change => 'id' in change && change.id === node.id && change.type === 'position')
      if (!positionChange || positionChange.type !== 'position' || !positionChange.position)
        return node

      return {
        ...node,
        position: positionChange.position,
      }
    })
  },
  default: (props: MockReactFlowProps) => {
    const {
      children,
      edges,
      nodes,
      nodesDraggable,
      onNodesChange,
    } = props

    mockReactFlowProps({
      edges,
      nodes,
      nodesDraggable,
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
    setViewport: vi.fn(),
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
  useNodesReadOnly: () => ({
    nodesReadOnly: mockNodesReadOnly,
  }),
  useWorkflowReadOnly: () => ({
    workflowReadOnly: false,
  }),
}))

vi.mock('../../operator/control', () => ({
  default: () => <div data-testid="workflow-control" />,
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
  data?: Partial<Node['data']>
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
  })
})
