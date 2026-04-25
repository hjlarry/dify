import type { ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { Position } from 'reactflow'
import { BlockEnum, NodeRunningStatus } from '../../../types'
import CustomEdge from '../custom-edge'

const mockUseAvailableBlocks = vi.hoisted(() => vi.fn())
const mockUseNodesInteractions = vi.hoisted(() => vi.fn())
const mockBlockSelector = vi.hoisted(() => vi.fn())
const mockGradientRender = vi.hoisted(() => vi.fn())

let sourceNodeData: Record<string, unknown> | undefined

vi.mock('reactflow', () => ({
  BaseEdge: (props: {
    id: string
    path: string
    style: {
      stroke: string
      strokeWidth: number
      opacity: number
      strokeDasharray?: string
    }
  }) => (
    <div
      data-testid="base-edge"
      data-id={props.id}
      data-path={props.path}
      data-stroke={props.style.stroke}
      data-stroke-width={props.style.strokeWidth}
      data-opacity={props.style.opacity}
      data-dasharray={props.style.strokeDasharray}
    />
  ),
  EdgeLabelRenderer: ({ children }: { children?: ReactNode }) => <div data-testid="edge-label">{children}</div>,
  getBezierPath: () => ['M 0 0', 24, 48],
  Position: {
    Right: 'right',
    Left: 'left',
  },
  useStore: (selector: (state: { nodeInternals: Map<string, { data: Record<string, unknown> }> }) => unknown) => selector({
    nodeInternals: sourceNodeData
      ? new Map([['source-node', { data: sourceNodeData }]])
      : new Map(),
  }),
}))

vi.mock('../../../hooks', () => ({
  useAvailableBlocks: (...args: unknown[]) => mockUseAvailableBlocks(...args),
  useNodesInteractions: () => mockUseNodesInteractions(),
}))

vi.mock('../../../block-selector', () => ({
  __esModule: true,
  default: (props: {
    onOpenChange: (open: boolean) => void
    onSelect: (nodeType: string, pluginDefaultValue?: Record<string, unknown>) => void
    availableBlocksTypes: string[]
    triggerClassName?: (open: boolean) => string
  }) => {
    mockBlockSelector(props)
    return (
      <button
        type="button"
        data-testid="block-selector"
        data-trigger-class={props.triggerClassName?.(false)}
        onClick={() => {
          props.onOpenChange(true)
          props.onSelect('llm', { provider: 'openai' })
        }}
      >
        {props.availableBlocksTypes.join(',')}
      </button>
    )
  },
}))

vi.mock('../../../custom-edge-linear-gradient-render', () => ({
  __esModule: true,
  default: (props: {
    id: string
    startColor: string
    stopColor: string
  }) => {
    mockGradientRender(props)
    return <div data-testid="edge-gradient">{props.id}</div>
  },
}))

describe('CanvasV2 CustomEdge', () => {
  const mockHandleNodeAdd = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    sourceNodeData = {
      type: BlockEnum.IfElse,
      title: 'Route',
      desc: '',
      cases: [
        { case_id: 'case-a' },
        { case_id: 'case-b' },
      ],
    }
    mockUseNodesInteractions.mockReturnValue({
      handleNodeAdd: mockHandleNodeAdd,
    })
    mockUseAvailableBlocks.mockImplementation((nodeType: BlockEnum) => {
      if (nodeType === BlockEnum.Code)
        return { availablePrevBlocks: [BlockEnum.Code, BlockEnum.LLM] }

      return { availableNextBlocks: [BlockEnum.LLM, BlockEnum.Tool] }
    })
  })

  // V2 edge keeps the existing insert affordance and adds visible branch labels.
  describe('Rendering', () => {
    it('should render branch labels and keep edge insertion behavior', () => {
      render(
        <CustomEdge
          id="edge-1"
          source="source-node"
          sourceHandleId="case-b"
          target="target-node"
          targetHandleId="target"
          sourceX={100}
          sourceY={120}
          sourcePosition={Position.Right}
          targetX={300}
          targetY={220}
          targetPosition={Position.Left}
          selected={false}
          data={{
            sourceType: BlockEnum.IfElse,
            targetType: BlockEnum.Code,
            _hovering: true,
            _waitingRun: true,
          } as never}
        />,
      )

      expect(screen.getByTestId('base-edge')).toHaveAttribute('data-stroke', 'var(--color-workflow-link-line-normal)')
      expect(screen.getByText('ELIF')).toBeInTheDocument()
      expect(screen.getByTestId('block-selector')).toHaveTextContent(BlockEnum.LLM)
      expect(screen.getByTestId('block-selector')).toHaveAttribute('data-trigger-class', expect.stringContaining('group-hover/edge-label:opacity-100'))
      expect(screen.getByText('ELIF').parentElement).toHaveStyle({
        transform: 'translate(-50%, -50%) translate(24px, 48px)',
        opacity: '0.7',
      })

      fireEvent.click(screen.getByTestId('block-selector'))

      expect(mockHandleNodeAdd).toHaveBeenCalledWith(
        {
          nodeType: 'llm',
          pluginDefaultValue: { provider: 'openai' },
        },
        {
          prevNodeId: 'source-node',
          prevNodeSourceHandle: 'case-b',
          nextNodeId: 'target-node',
          nextNodeTargetHandle: 'target',
        },
      )
    })

    it('should render gradient edges and classifier names', () => {
      sourceNodeData = {
        type: BlockEnum.QuestionClassifier,
        title: 'Classify',
        desc: '',
        classes: [{ id: 'refund', name: 'Refund request' }],
      }

      render(
        <CustomEdge
          id="edge-classifier"
          source="source-node"
          sourceHandleId="refund"
          target="target-node"
          targetHandleId="target"
          sourceX={100}
          sourceY={120}
          sourcePosition={Position.Right}
          targetX={300}
          targetY={220}
          targetPosition={Position.Left}
          selected={false}
          data={{
            sourceType: BlockEnum.QuestionClassifier,
            targetType: BlockEnum.Code,
            _sourceRunningStatus: NodeRunningStatus.Succeeded,
            _targetRunningStatus: NodeRunningStatus.Running,
          } as never}
        />,
      )

      expect(screen.getByTestId('edge-gradient')).toHaveTextContent('edge-classifier')
      expect(screen.getByTestId('base-edge')).toHaveAttribute('data-stroke', 'url(#edge-classifier)')
      expect(screen.getByText('Refund request')).toBeInTheDocument()
    })

    it('should keep unlabeled edges hidden until hover', () => {
      sourceNodeData = {
        type: BlockEnum.Start,
        title: 'Start',
        desc: '',
      }

      render(
        <CustomEdge
          id="edge-normal"
          source="source-node"
          sourceHandleId="source"
          target="target-node"
          targetHandleId="target"
          sourceX={0}
          sourceY={0}
          sourcePosition={Position.Right}
          targetX={100}
          targetY={100}
          targetPosition={Position.Left}
          selected={false}
          data={{
            sourceType: BlockEnum.Start,
            targetType: BlockEnum.Code,
          } as never}
        />,
      )

      expect(screen.queryByText('IF')).not.toBeInTheDocument()
      expect(screen.getByTestId('block-selector').parentElement).toHaveStyle({
        opacity: '0',
        pointerEvents: 'none',
      })
    })
  })
})
