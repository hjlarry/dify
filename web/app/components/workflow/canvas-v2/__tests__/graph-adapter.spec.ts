import type {
  Edge,
  Node,
} from '../../types'
import {
  BlockEnum,
} from '../../types'
import {
  CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY,
  CANVAS_V2_HIDDEN_KEY,
  CANVAS_V2_NODE_HEIGHT,
  CANVAS_V2_NODE_WIDTH,
  getCanvasV2Graph,
  getCanvasV2SourceGraph,
} from '../graph-adapter'

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

describe('getCanvasV2Graph', () => {
  // V2 derives a display graph and leaves the original workflow graph intact.
  describe('Container collapsing', () => {
    it('should hide container children and internal edges while preserving outer edges', () => {
      const nodes = [
        makeNode({
          id: 'iteration-1',
          positionAbsolute: { x: 12, y: 24 },
          data: {
            type: BlockEnum.Iteration,
            title: 'Loop over files',
            desc: '',
          },
        }),
        makeNode({
          id: 'iteration-start',
          parentId: 'iteration-1',
          data: {
            type: BlockEnum.IterationStart,
            title: '',
            desc: '',
            isInIteration: true,
          },
        }),
        makeNode({
          id: 'iteration-child',
          parentId: 'iteration-1',
          data: {
            type: BlockEnum.Code,
            title: 'Transform',
            desc: '',
            isInIteration: true,
          },
        }),
        makeNode({
          id: 'after',
          data: {
            type: BlockEnum.End,
            title: 'End',
            desc: '',
          },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'internal-by-flag',
          source: 'iteration-start',
          target: 'iteration-child',
          data: {
            sourceType: BlockEnum.IterationStart,
            targetType: BlockEnum.Code,
            isInIteration: true,
            iteration_id: 'iteration-1',
          },
        }),
        makeEdge({
          id: 'internal-by-node',
          source: 'iteration-child',
          target: 'after',
        }),
        makeEdge({
          id: 'external',
          source: 'iteration-1',
          target: 'after',
          data: {
            sourceType: BlockEnum.Iteration,
            targetType: BlockEnum.End,
          },
        }),
      ]

      const result = getCanvasV2Graph({ nodes, edges })

      expect(result.nodes.map(node => node.id)).toEqual(['iteration-1', 'iteration-start', 'iteration-child', 'after'])
      expect(result.nodes.filter(node => !(node.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).map(node => node.id)).toEqual(['iteration-1', 'after'])
      expect((result.nodes.find(node => node.id === 'iteration-start')?.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBe(true)
      expect((result.nodes.find(node => node.id === 'iteration-child')?.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBe(true)
      expect(result.edges.map(edge => edge.id)).toEqual(['internal-by-flag', 'internal-by-node', 'external'])
      expect(result.edges.filter(edge => !(edge.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).map(edge => edge.id)).toEqual(['external'])
      expect((result.edges.find(edge => edge.id === 'internal-by-flag')?.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBe(true)
      expect((result.edges.find(edge => edge.id === 'internal-by-node')?.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBe(true)
      expect((result.nodes[0]!.data as Record<string, unknown>)[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]).toBe(1)
      expect(result.nodes[0]).toEqual(expect.objectContaining({
        width: CANVAS_V2_NODE_WIDTH,
        height: CANVAS_V2_NODE_HEIGHT,
        style: expect.objectContaining({
          width: CANVAS_V2_NODE_WIDTH,
          height: CANVAS_V2_NODE_HEIGHT,
        }),
      }))
      expect(result.nodes[0]!.data).toEqual(expect.objectContaining({
        width: CANVAS_V2_NODE_WIDTH,
        height: CANVAS_V2_NODE_HEIGHT,
      }))
      expect(result.nodes[0]!.positionAbsolute).toBeUndefined()
      expect((nodes[0]!.data as Record<string, unknown>)[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]).toBeUndefined()
      expect(nodes[0]!.width).toBeUndefined()
      expect(nodes[0]!.positionAbsolute).toEqual({ x: 12, y: 24 })
      expect((nodes.find(node => node.id === 'iteration-child')?.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBeUndefined()
    })

    it('should use container metadata when direct children are not present', () => {
      const result = getCanvasV2Graph({
        nodes: [
          makeNode({
            id: 'loop-1',
            data: {
              type: BlockEnum.Loop,
              title: 'Retry loop',
              desc: '',
              _children: [
                { nodeId: 'loop-start', nodeType: BlockEnum.LoopStart },
                { nodeId: 'code-1', nodeType: BlockEnum.Code },
                { nodeId: 'llm-1', nodeType: BlockEnum.LLM },
              ],
            },
          }),
        ],
        edges: [],
      })

      expect((result.nodes[0]!.data as Record<string, unknown>)[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]).toBe(2)
    })

    it('should recompute v2 metadata instead of preserving stale display flags', () => {
      const result = getCanvasV2Graph({
        nodes: [
          makeNode({
            id: 'start',
            data: {
              type: BlockEnum.Start,
              title: 'Start',
              desc: '',
              [CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]: 3,
              [CANVAS_V2_HIDDEN_KEY]: true,
            } as Partial<Node['data']>,
          }),
          makeNode({
            id: 'end',
            data: {
              type: BlockEnum.End,
              title: 'End',
              desc: '',
              [CANVAS_V2_HIDDEN_KEY]: true,
            } as Partial<Node['data']>,
          }),
        ],
        edges: [
          makeEdge({
            id: 'start-end',
            source: 'start',
            target: 'end',
            data: {
              sourceType: BlockEnum.Start,
              targetType: BlockEnum.End,
              [CANVAS_V2_HIDDEN_KEY]: true,
            } as Partial<Edge['data']>,
          }),
        ],
      })

      expect((result.nodes[0]!.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBeUndefined()
      expect((result.nodes[0]!.data as Record<string, unknown>)[CANVAS_V2_COLLAPSED_CHILDREN_COUNT_KEY]).toBeUndefined()
      expect((result.nodes[1]!.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBeUndefined()
      expect((result.edges[0]!.data as Record<string, unknown>)[CANVAS_V2_HIDDEN_KEY]).toBeUndefined()
    })

    it('should render edges as non-focusable and keep edge selection out of the source graph', () => {
      const selectedEdge = makeEdge({
        id: 'start-end',
        source: 'start',
        target: 'end',
        focusable: true,
        selected: true,
      })

      const viewGraph = getCanvasV2Graph({
        nodes: [
          makeNode({ id: 'start', data: { type: BlockEnum.Start } }),
          makeNode({ id: 'end', data: { type: BlockEnum.End } }),
        ],
        edges: [selectedEdge],
      })
      const sourceGraph = getCanvasV2SourceGraph({
        nodes: viewGraph.nodes,
        edges: viewGraph.edges,
      })

      expect(viewGraph.edges[0]).toEqual(expect.objectContaining({
        focusable: false,
        selected: false,
      }))
      expect(sourceGraph.edges[0]!.focusable).toBeUndefined()
      expect(sourceGraph.edges[0]!.selected).toBeUndefined()
    })
  })
})
