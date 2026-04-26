import type {
  Edge,
  Node,
} from '../../../types'
import {
  CUSTOM_NODE,
} from '../../../constants'
import { CUSTOM_SIMPLE_NODE } from '../../../simple-node/constants'
import {
  BlockEnum,
} from '../../../types'
import {
  CANVAS_V2_HIDDEN_KEY,
  CANVAS_V2_NODE_HEIGHT,
  CANVAS_V2_NODE_WIDTH,
} from '../../graph-adapter'
import {
  getCanvasV2LayoutNodes,
} from '../elk-layout'

const mockGetLayoutByELK = vi.hoisted(() => vi.fn())

vi.mock('../../../utils/elk-layout', () => ({
  getLayoutByELK: (...args: unknown[]) => mockGetLayoutByELK(...args),
}))

type NodeFactoryInput = Omit<Partial<Node>, 'data' | 'id' | 'position' | 'type'> & Pick<Node, 'id'> & {
  data?: Partial<Node['data']>
  position?: Node['position']
  type?: Node['type']
}

type EdgeFactoryInput = Omit<Partial<Edge>, 'data' | 'id' | 'source' | 'target'> & Pick<Edge, 'id' | 'source' | 'target'> & {
  data?: Partial<Edge['data']>
}

const makeNode = ({
  data,
  id,
  position,
  type,
  ...node
}: NodeFactoryInput): Node => ({
  id,
  type: type ?? CUSTOM_NODE,
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
  target,
  ...edge
}: EdgeFactoryInput): Edge => ({
  id,
  source,
  target,
  data: {
    sourceType: BlockEnum.Code,
    targetType: BlockEnum.Code,
    ...data,
  } as Edge['data'],
  ...edge,
} as Edge)

describe('getCanvasV2LayoutNodes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetLayoutByELK.mockResolvedValue({
      nodes: new Map([
        ['start', { x: 0, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
        ['loop', { x: 260, y: 20, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
        ['end', { x: 520, y: 40, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
      ]),
      bounds: { minX: 0, minY: 0, maxX: 720, maxY: 88 },
    })
  })

  // V2 main layout treats containers as fixed compact nodes and keeps internal graphs out of ELK.
  describe('Layout input', () => {
    it('should layout visible root nodes with compact dimensions and ignore internal container graph', async () => {
      const nodes = [
        makeNode({ id: 'start', type: CUSTOM_SIMPLE_NODE, data: { type: BlockEnum.Start } }),
        makeNode({ id: 'loop', positionAbsolute: { x: 24, y: 64 }, data: { type: BlockEnum.Loop } }),
        makeNode({ id: 'loop-start', parentId: 'loop', data: { type: BlockEnum.LoopStart, isInLoop: true } }),
        makeNode({ id: 'loop-child', parentId: 'loop', data: { type: BlockEnum.Code, isInLoop: true } }),
        makeNode({ id: 'end', data: { type: BlockEnum.End } }),
      ]
      const edges = [
        makeEdge({ id: 'start-loop', source: 'start', target: 'loop' }),
        makeEdge({ id: 'loop-child-edge', source: 'loop-start', target: 'loop-child', data: { isInLoop: true } }),
        makeEdge({ id: 'loop-end', source: 'loop', target: 'end' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)
      const layoutNodes = mockGetLayoutByELK.mock.calls[0]![0] as Node[]
      const layoutEdges = mockGetLayoutByELK.mock.calls[0]![1] as Edge[]

      expect(layoutNodes.map(node => node.id)).toEqual(['start', 'loop', 'end'])
      layoutNodes.forEach((node) => {
        expect(node.type).toBe(CUSTOM_NODE)
        expect(node.width).toBe(CANVAS_V2_NODE_WIDTH)
        expect(node.height).toBe(CANVAS_V2_NODE_HEIGHT)
      })
      expect(layoutEdges.map(edge => edge.id)).toEqual(['start-loop', 'loop-end'])
      expect(result.find(node => node.id === 'loop-child')?.position).toEqual({ x: 0, y: 0 })
      expect(result.find(node => node.id === 'loop')?.position).toEqual({ x: 260, y: 0 })
      expect(result.find(node => node.id === 'loop')?.positionAbsolute).toBeUndefined()
      expect(nodes.find(node => node.id === 'loop')?.positionAbsolute).toEqual({ x: 24, y: 64 })
      expect(result.find(node => node.id === 'end')?.position).toEqual({ x: 520, y: 0 })
      expect((nodes[2]!.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBeUndefined()
    })

    it('should keep vertical offsets from ELK when the visible graph branches', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 20, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['case-a', { x: 260, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['case-b', { x: 260, y: 96, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 460, maxY: 144 },
      })
      const nodes = [
        makeNode({ id: 'start', type: CUSTOM_SIMPLE_NODE, data: { type: BlockEnum.Start } }),
        makeNode({ id: 'case-a' }),
        makeNode({ id: 'case-b' }),
      ]
      const edges = [
        makeEdge({ id: 'start-a', source: 'start', target: 'case-a' }),
        makeEdge({ id: 'start-b', source: 'start', target: 'case-b' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)

      expect(result.find(node => node.id === 'start')?.position).toEqual({ x: 0, y: 20 })
      expect(result.find(node => node.id === 'case-a')?.position).toEqual({ x: 260, y: 0 })
      expect(result.find(node => node.id === 'case-b')?.position).toEqual({ x: 260, y: 96 })
    })

    it('should align an odd fan-out source to the middle downstream node', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 104, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['llm', { x: 260, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['answer', { x: 260, y: 128, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['knowledge', { x: 260, y: 256, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 460, maxY: 304 },
      })
      const nodes = [
        makeNode({ id: 'start', type: CUSTOM_SIMPLE_NODE, data: { type: BlockEnum.Start } }),
        makeNode({ id: 'llm', data: { type: BlockEnum.LLM } }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer } }),
        makeNode({ id: 'knowledge', data: { type: BlockEnum.KnowledgeRetrieval } }),
      ]
      const edges = [
        makeEdge({ id: 'start-llm', source: 'start', target: 'llm' }),
        makeEdge({ id: 'start-answer', source: 'start', target: 'answer' }),
        makeEdge({ id: 'start-knowledge', source: 'start', target: 'knowledge' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)

      expect(result.find(node => node.id === 'start')?.position).toEqual({ x: 0, y: 128 })
      expect(result.find(node => node.id === 'llm')?.position).toEqual({ x: 260, y: 0 })
      expect(result.find(node => node.id === 'answer')?.position).toEqual({ x: 260, y: 128 })
      expect(result.find(node => node.id === 'knowledge')?.position).toEqual({ x: 260, y: 256 })
    })

    it('should align nodes in the same topological layer on the x axis', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 256, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['answer', { x: 260, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['answer-2', { x: 300, y: 128, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['code', { x: 280, y: 256, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['human-input', { x: 600, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
          ['answer-3', { x: 640, y: 128, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
          ['code-2', { x: 620, y: 256, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
          ['template', { x: 660, y: 384, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 860, maxY: 432 },
      })
      const nodes = [
        makeNode({ id: 'start', type: CUSTOM_SIMPLE_NODE, data: { type: BlockEnum.Start } }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer } }),
        makeNode({ id: 'answer-2', data: { type: BlockEnum.Answer } }),
        makeNode({ id: 'code', data: { type: BlockEnum.Code } }),
        makeNode({ id: 'human-input', data: { type: BlockEnum.HumanInput } }),
        makeNode({ id: 'answer-3', data: { type: BlockEnum.Answer } }),
        makeNode({ id: 'code-2', data: { type: BlockEnum.Code } }),
        makeNode({ id: 'template', data: { type: BlockEnum.TemplateTransform } }),
      ]
      const edges = [
        makeEdge({ id: 'start-answer', source: 'start', target: 'answer' }),
        makeEdge({ id: 'start-answer-2', source: 'start', target: 'answer-2' }),
        makeEdge({ id: 'start-code', source: 'start', target: 'code' }),
        makeEdge({ id: 'answer-human-input', source: 'answer', target: 'human-input' }),
        makeEdge({ id: 'answer-2-answer-3', source: 'answer-2', target: 'answer-3' }),
        makeEdge({ id: 'answer-2-code-2', source: 'answer-2', target: 'code-2' }),
        makeEdge({ id: 'answer-2-template', source: 'answer-2', target: 'template' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)

      expect(result.find(node => node.id === 'answer')?.position.x).toBe(260)
      expect(result.find(node => node.id === 'answer-2')?.position.x).toBe(260)
      expect(result.find(node => node.id === 'code')?.position.x).toBe(260)
      expect(result.find(node => node.id === 'human-input')?.position.x).toBe(600)
      expect(result.find(node => node.id === 'answer-3')?.position.x).toBe(600)
      expect(result.find(node => node.id === 'code-2')?.position.x).toBe(600)
      expect(result.find(node => node.id === 'template')?.position.x).toBe(600)
    })

    it('should align a linear component even when other visible nodes exist', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['list', { x: 260, y: 20, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['end', { x: 520, y: 40, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
          ['orphan', { x: 0, y: 160, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 720, maxY: 208 },
      })
      const nodes = [
        makeNode({ id: 'start', type: CUSTOM_SIMPLE_NODE, data: { type: BlockEnum.Start } }),
        makeNode({ id: 'list', data: { type: BlockEnum.ListFilter } }),
        makeNode({ id: 'end', data: { type: BlockEnum.End } }),
        makeNode({ id: 'orphan' }),
      ]
      const edges = [
        makeEdge({ id: 'start-list', source: 'start', target: 'list' }),
        makeEdge({ id: 'list-end', source: 'list', target: 'end' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)

      expect(result.find(node => node.id === 'start')?.position).toEqual({ x: 0, y: 0 })
      expect(result.find(node => node.id === 'list')?.position).toEqual({ x: 260, y: 0 })
      expect(result.find(node => node.id === 'end')?.position).toEqual({ x: 520, y: 0 })
      expect(result.find(node => node.id === 'orphan')?.position).toEqual({ x: 0, y: 160 })
    })

    it('should align a linear component when duplicate or temporary edges are present', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['list', { x: 260, y: 18, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['answer', { x: 520, y: 36, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 720, maxY: 84 },
      })
      const nodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
        makeNode({ id: 'list', data: { type: BlockEnum.ListFilter } }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer } }),
      ]
      const edges = [
        makeEdge({ id: 'start-list', source: 'start', target: 'list' }),
        makeEdge({ id: 'start-list-duplicate', source: 'start', target: 'list' }),
        makeEdge({ id: 'list-answer', source: 'list', target: 'answer' }),
        makeEdge({ id: 'temporary', source: 'answer', target: 'start', data: { _isTemp: true } }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)
      const layoutEdges = mockGetLayoutByELK.mock.calls[0]![1] as Edge[]

      expect(layoutEdges.map(edge => edge.id)).toEqual(['start-list', 'start-list-duplicate', 'list-answer'])
      expect(result.find(node => node.id === 'start')?.position).toEqual({ x: 0, y: 0 })
      expect(result.find(node => node.id === 'list')?.position).toEqual({ x: 260, y: 0 })
      expect(result.find(node => node.id === 'answer')?.position).toEqual({ x: 520, y: 0 })
    })

    it('should align linear runs before and after branch points without flattening branches', async () => {
      mockGetLayoutByELK.mockResolvedValue({
        nodes: new Map([
          ['start', { x: 0, y: 101.7142857142857, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 0 }],
          ['list', { x: 300, y: 109.7142857142857, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 1 }],
          ['answer', { x: 600, y: 117.7142857142857, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 2 }],
          ['if-else', { x: 920, y: 0, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 3 }],
          ['iteration', { x: 920, y: 128, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 3 }],
          ['code', { x: 1220, y: 136, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 4 }],
          ['aggregator', { x: 920, y: 256, width: CANVAS_V2_NODE_WIDTH, height: CANVAS_V2_NODE_HEIGHT, layer: 3 }],
        ]),
        bounds: { minX: 0, minY: 0, maxX: 1420, maxY: 304 },
      })
      const nodes = [
        makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
        makeNode({ id: 'list', data: { type: BlockEnum.ListFilter } }),
        makeNode({ id: 'answer', data: { type: BlockEnum.Answer } }),
        makeNode({ id: 'if-else', data: { type: BlockEnum.IfElse } }),
        makeNode({ id: 'iteration', data: { type: BlockEnum.Iteration } }),
        makeNode({ id: 'code', data: { type: BlockEnum.Code } }),
        makeNode({ id: 'aggregator', data: { type: BlockEnum.VariableAggregator } }),
      ]
      const edges = [
        makeEdge({ id: 'start-list', source: 'start', target: 'list' }),
        makeEdge({ id: 'list-answer', source: 'list', target: 'answer' }),
        makeEdge({ id: 'answer-if', source: 'answer', target: 'if-else' }),
        makeEdge({ id: 'answer-iteration', source: 'answer', target: 'iteration' }),
        makeEdge({ id: 'iteration-code', source: 'iteration', target: 'code' }),
        makeEdge({ id: 'answer-aggregator', source: 'answer', target: 'aggregator' }),
      ]

      const result = await getCanvasV2LayoutNodes(nodes, edges)

      expect(result.find(node => node.id === 'start')?.position).toEqual({ x: 0, y: 128 })
      expect(result.find(node => node.id === 'list')?.position).toEqual({ x: 300, y: 128 })
      expect(result.find(node => node.id === 'answer')?.position).toEqual({ x: 600, y: 128 })
      expect(result.find(node => node.id === 'if-else')?.position).toEqual({ x: 920, y: 0 })
      expect(result.find(node => node.id === 'iteration')?.position).toEqual({ x: 920, y: 128 })
      expect(result.find(node => node.id === 'code')?.position).toEqual({ x: 1220, y: 128 })
      expect(result.find(node => node.id === 'aggregator')?.position).toEqual({ x: 920, y: 256 })
    })
  })
})
