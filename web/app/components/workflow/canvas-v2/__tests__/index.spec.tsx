import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { WorkflowCanvasV2 } from '../index'

const mockSetNodesInWorkflowStore = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasWidth = vi.hoisted(() => vi.fn())
const mockSetWorkflowCanvasHeight = vi.hoisted(() => vi.fn())
const mockSetMousePosition = vi.hoisted(() => vi.fn())

vi.mock('reactflow', () => ({
  default: ({
    children,
  }: {
    children?: ReactNode
  }) => <div data-testid="react-flow">{children}</div>,
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

describe('WorkflowCanvasV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Renderer shell keeps legacy operation affordances until v2 replacements exist.
  describe('Rendering', () => {
    it('should render the quick operation layer with the canvas', () => {
      render(
        <WorkflowCanvasV2
          nodes={[{ id: 'node-1' }] as never}
          edges={[{ id: 'edge-1' }] as never}
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
    })
  })
})
