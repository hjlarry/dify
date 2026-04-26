import type {
  ComponentProps,
  ReactNode,
} from 'react'
import type {
  CommonNodeType,
  Edge,
  OnSelectBlock,
} from '../../../types'
import { fireEvent, render, screen } from '@testing-library/react'
import {
  BlockEnum,
  NodeRunningStatus,
} from '../../../types'
import {
  CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY,
  CANVAS_V2_HIDDEN_KEY,
} from '../../graph-adapter'
import CompactNode from '../compact-node'

let mockNodesReadOnly = false
let mockReactFlowEdges: Edge[] = []
let mockReactFlowNodeInternals = new Map<string, { data: CommonNodeType }>()
const mockHandleNodeAdd = vi.fn()
const mockAvailableBlocks = [BlockEnum.Code, BlockEnum.LLM, BlockEnum.Answer]

vi.mock('reactflow', () => ({
  Handle: ({
    id,
    type,
  }: {
    id: string
    type: string
  }) => <div data-testid={`${type}-handle-${id}`} />,
  Position: {
    Left: 'left',
    Right: 'right',
  },
  useStore: (selector: (state: {
    edges: Edge[]
    nodeInternals: Map<string, { data: CommonNodeType }>
  }) => unknown) => selector({
    edges: mockReactFlowEdges,
    nodeInternals: mockReactFlowNodeInternals,
  }),
}))

vi.mock('../../../block-icon', () => ({
  default: ({
    type,
  }: {
    type: BlockEnum
  }) => <div data-testid={`block-icon-${type}`} />,
}))

vi.mock('../../../hooks', () => ({
  useAvailableBlocks: () => ({
    availableNextBlocks: mockAvailableBlocks,
    availablePrevBlocks: mockAvailableBlocks,
  }),
  useNodesInteractions: () => ({
    handleNodeAdd: mockHandleNodeAdd,
  }),
  useNodesReadOnly: () => ({
    nodesReadOnly: mockNodesReadOnly,
  }),
  useToolIcon: () => '',
}))

vi.mock('../../../block-selector', () => ({
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
      data-testid="workflow-canvas-v2-node-add-selector"
      onClick={() => {
        if (!disabled)
          onSelect(BlockEnum.Code)
      }}
    >
      {trigger?.(false)}
    </div>
  ),
}))

vi.mock('../../../nodes/_base/components/node-control', () => ({
  default: () => <div data-testid="node-control" />,
}))

vi.mock('../../../nodes/_base/components/node-handle', () => ({
  NodeTargetHandle: ({
    handleId,
  }: {
    handleId: string
  }) => <div data-testid={`target-selector-handle-${handleId}`} />,
}))

const renderCompactNode = (
  data: Partial<ComponentProps<typeof CompactNode>['data']> = {},
) => {
  const props = {
    id: 'node-1',
    data: {
      title: 'Generate answer',
      desc: 'Long prompt and configuration summary',
      type: BlockEnum.LLM,
      ...data,
    },
  } as ComponentProps<typeof CompactNode>

  return render(<CompactNode {...props} />)
}

describe('CompactNode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNodesReadOnly = false
    mockReactFlowEdges = []
    mockReactFlowNodeInternals = new Map()
  })

  // Compact canvas nodes expose structure, not configuration summaries.
  describe('Rendering', () => {
    it('should render a fixed compact node with title and handles only', () => {
      renderCompactNode()

      expect(screen.getByTestId('workflow-canvas-v2-compact-node')).toHaveClass('h-12', 'w-[200px]')
      expect(screen.getByTestId('block-icon-llm')).toBeInTheDocument()
      expect(screen.getByText('Generate answer')).toBeInTheDocument()
      expect(screen.queryByText('Long prompt and configuration summary')).not.toBeInTheDocument()
      expect(screen.getByTestId('target-selector-handle-target')).toBeInTheDocument()
      expect(screen.getByTestId('source-handle-source')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-node-add')).toHaveClass('size-4')
      expect(screen.getByTestId('node-control')).toBeInTheDocument()
    })

    it('should insert from the node-side add button when the compact node has one next node', () => {
      mockReactFlowEdges = [
        {
          id: 'edge-1',
          source: 'node-1',
          sourceHandle: 'source',
          target: 'node-2',
          targetHandle: 'target',
          data: {
            sourceType: BlockEnum.LLM,
            targetType: BlockEnum.Answer,
          },
        } as Edge,
      ]
      mockReactFlowNodeInternals = new Map([
        [
          'node-2',
          {
            data: {
              title: 'Answer',
              desc: '',
              type: BlockEnum.Answer,
            } as CommonNodeType,
          },
        ],
      ])

      renderCompactNode()

      fireEvent.click(screen.getByTestId('workflow-canvas-v2-node-add-selector'))

      expect(mockHandleNodeAdd).toHaveBeenCalledWith(
        {
          nodeType: BlockEnum.Code,
          pluginDefaultValue: undefined,
        },
        {
          nextNodeId: 'node-2',
          nextNodeTargetHandle: 'target',
          prevNodeId: 'node-1',
          prevNodeSourceHandle: 'source',
        },
      )
    })

    it('should show configuration summaries only after hover without resizing the node', () => {
      renderCompactNode({
        model: {
          completion_params: {},
          mode: 'chat',
          name: 'gpt-4o',
          provider: 'openai',
        },
      } as Partial<ComponentProps<typeof CompactNode>['data']>)

      expect(screen.queryByTestId('workflow-canvas-v2-node-summary')).not.toBeInTheDocument()

      const compactNode = screen.getByTestId('workflow-canvas-v2-compact-node')
      fireEvent.mouseEnter(compactNode)

      expect(compactNode).toHaveClass('h-12', 'w-[200px]')
      expect(screen.getByTestId('workflow-canvas-v2-node-summary')).toHaveClass('absolute', 'top-full')
      expect(screen.getByText('Long prompt and configuration summary')).toBeInTheDocument()
      expect(screen.getByText('openai / gpt-4o')).toBeInTheDocument()

      fireEvent.mouseLeave(compactNode)

      expect(screen.queryByTestId('workflow-canvas-v2-node-summary')).not.toBeInTheDocument()
    })

    it('should keep configuration summaries visible while selected', () => {
      renderCompactNode({
        answer: 'Hello {{name}}',
        selected: true,
        type: BlockEnum.Answer,
      } as Partial<ComponentProps<typeof CompactNode>['data']>)

      expect(screen.getByTestId('workflow-canvas-v2-node-summary')).toBeInTheDocument()
      expect(screen.getByText('Hello {{name}}')).toBeInTheDocument()
    })

    it('should keep status visible and hide node controls while running', () => {
      renderCompactNode({
        _runningStatus: NodeRunningStatus.Running,
      })

      expect(screen.getByTestId('workflow-canvas-v2-node-status-running')).toBeInTheDocument()
      expect(screen.queryByTestId('node-control')).not.toBeInTheDocument()
    })

    it('should keep paused status visible on compact nodes', () => {
      renderCompactNode({
        _runningStatus: NodeRunningStatus.Paused,
      })

      expect(screen.getByTestId('workflow-canvas-v2-compact-node')).toHaveClass('border-state-accent-solid!')
      expect(screen.getByTestId('workflow-canvas-v2-node-status-paused')).toBeInTheDocument()
      expect(screen.queryByTestId('node-control')).not.toBeInTheDocument()
    })

    it('should keep one-step listening status visible on compact nodes', () => {
      renderCompactNode({
        _singleRunningStatus: NodeRunningStatus.Listening,
      })

      expect(screen.getByTestId('workflow-canvas-v2-compact-node')).toHaveClass('border-state-accent-solid!')
      expect(screen.getByTestId('workflow-canvas-v2-node-status-listening')).toBeInTheDocument()
      expect(screen.queryByTestId('node-control')).not.toBeInTheDocument()
    })

    it('should preserve branch source handles without rendering branch details', () => {
      renderCompactNode({
        type: BlockEnum.IfElse,
        title: 'Route request',
        desc: 'Condition A equals foo',
        cases: [
          { case_id: 'case-a' },
          { case_id: 'case-b' },
        ],
        _connectedSourceHandleIds: ['case-a', 'case-b', 'false'],
      } as Partial<ComponentProps<typeof CompactNode>['data']>)

      expect(screen.getByText('Route request')).toBeInTheDocument()
      expect(screen.queryByText('Condition A equals foo')).not.toBeInTheDocument()
      expect(screen.queryByTestId('source-handle-source')).not.toBeInTheDocument()
      expect(screen.queryByTestId('workflow-canvas-v2-node-add')).not.toBeInTheDocument()
      expect(screen.getByTestId('source-handle-case-a')).toBeInTheDocument()
      expect(screen.getByTestId('source-handle-case-b')).toBeInTheDocument()
      expect(screen.getByTestId('source-handle-false')).toBeInTheDocument()
    })

    it('should show a collapsed child count for container nodes', () => {
      renderCompactNode({
        type: BlockEnum.Iteration,
        title: 'Loop over files',
        [CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]: 3,
      } as Partial<ComponentProps<typeof CompactNode>['data']>)

      expect(screen.getByText('Loop over files')).toBeInTheDocument()
      expect(screen.getByTestId('workflow-canvas-v2-container-count')).toHaveTextContent('3')
    })

    it('should not render internal container children in the main canvas', () => {
      renderCompactNode({
        [CANVAS_V2_HIDDEN_KEY]: true,
      } as Partial<ComponentProps<typeof CompactNode>['data']>)

      expect(screen.queryByTestId('workflow-canvas-v2-compact-node')).not.toBeInTheDocument()
    })
  })
})
