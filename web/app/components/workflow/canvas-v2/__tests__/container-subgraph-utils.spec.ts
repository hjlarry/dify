import type {
  Edge,
  Node,
} from '../../types'
import { BlockEnum } from '../../types'
import {
  getContainerChildren,
  getInternalEdges,
  getSharedBranchMerge,
  getSortedContainerChildren,
  sortOutgoingEdges,
} from '../container-subgraph-utils'

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

describe('container-subgraph-utils', () => {
  describe('getContainerChildren', () => {
    it('should prefer direct parent children over container metadata', () => {
      const container = makeNode({
        id: 'loop',
        data: {
          type: BlockEnum.Loop,
          _children: [
            { nodeId: 'metadata-child', nodeType: BlockEnum.Code },
          ],
        },
      })
      const directChild = makeNode({
        id: 'direct-child',
        parentId: 'loop',
      })
      const metadataChild = makeNode({
        id: 'metadata-child',
      })

      expect(getContainerChildren(container, [container, directChild, metadataChild]).map(node => node.id)).toEqual(['direct-child'])
    })

    it('should prepend the start node when metadata children omit it', () => {
      const container = makeNode({
        id: 'loop',
        data: {
          type: BlockEnum.Loop,
          start_node_id: 'loop-start',
          _children: [
            { nodeId: 'code', nodeType: BlockEnum.Code },
          ],
        },
      })
      const startNode = makeNode({
        id: 'loop-start',
        data: { type: BlockEnum.LoopStart },
      })
      const codeNode = makeNode({
        id: 'code',
      })

      expect(getContainerChildren(container, [container, codeNode, startNode]).map(node => node.id)).toEqual(['loop-start', 'code'])
    })
  })

  describe('container edge ordering', () => {
    it('should sort children by internal edges and append disconnected children by position', () => {
      const container = makeNode({
        id: 'loop',
        data: {
          type: BlockEnum.Loop,
          start_node_id: 'loop-start',
        },
      })
      const nodes = [
        container,
        makeNode({
          id: 'loop-start',
          parentId: 'loop',
          position: { x: 0, y: 0 },
          data: { type: BlockEnum.LoopStart, isInLoop: true, loop_id: 'loop' },
        }),
        makeNode({
          id: 'first',
          parentId: 'loop',
          position: { x: 500, y: 0 },
          data: { isInLoop: true, loop_id: 'loop' },
        }),
        makeNode({
          id: 'second',
          parentId: 'loop',
          position: { x: 250, y: 0 },
          data: { isInLoop: true, loop_id: 'loop' },
        }),
        makeNode({
          id: 'disconnected',
          parentId: 'loop',
          position: { x: 750, y: 0 },
          data: { isInLoop: true, loop_id: 'loop' },
        }),
      ]
      const edges = [
        makeEdge({
          id: 'start-first',
          source: 'loop-start',
          target: 'first',
          data: { isInLoop: true, loop_id: 'loop', sourceType: BlockEnum.LoopStart, targetType: BlockEnum.Code },
        }),
        makeEdge({
          id: 'first-second',
          source: 'first',
          target: 'second',
          data: { isInLoop: true, loop_id: 'loop' },
        }),
      ]

      expect(getSortedContainerChildren(container, nodes, edges).map(node => node.id)).toEqual([
        'loop-start',
        'first',
        'second',
        'disconnected',
      ])
    })

    it('should include only edges inside the target container', () => {
      const children = [
        makeNode({ id: 'start', parentId: 'loop' }),
        makeNode({ id: 'inside', parentId: 'loop' }),
        makeNode({ id: 'other', parentId: 'other-loop' }),
      ]
      const edges = [
        makeEdge({
          id: 'inside-loop',
          source: 'start',
          target: 'inside',
          data: { loop_id: 'loop', isInLoop: true },
        }),
        makeEdge({
          id: 'inside-other-loop',
          source: 'start',
          target: 'inside',
          data: { loop_id: 'other-loop', isInLoop: true },
        }),
        makeEdge({
          id: 'outside-children',
          source: 'start',
          target: 'other',
          data: { loop_id: 'loop', isInLoop: true },
        }),
      ]

      expect(getInternalEdges('loop', children.slice(0, 2), edges).map(edge => edge.id)).toEqual(['inside-loop'])
    })
  })

  describe('branch layout helpers', () => {
    it('should order IfElse outgoing edges by branch semantics before target position', () => {
      const routeNode = makeNode({
        id: 'route',
        data: {
          type: BlockEnum.IfElse,
          cases: [
            { case_id: 'case-a' },
            { case_id: 'case-b' },
          ],
        },
      })
      const nodeById = new Map([
        ['route', routeNode],
        ['else-node', makeNode({ id: 'else-node', position: { x: 100, y: -100 } })],
        ['elif-node', makeNode({ id: 'elif-node', position: { x: 100, y: 0 } })],
        ['if-node', makeNode({ id: 'if-node', position: { x: 100, y: 100 } })],
      ])
      const edges = [
        makeEdge({ id: 'else', source: 'route', sourceHandle: 'false', target: 'else-node' }),
        makeEdge({ id: 'elif', source: 'route', sourceHandle: 'case-b', target: 'elif-node' }),
        makeEdge({ id: 'if', source: 'route', sourceHandle: 'case-a', target: 'if-node' }),
      ]

      expect(sortOutgoingEdges(edges, nodeById, routeNode).map(edge => edge.id)).toEqual(['if', 'elif', 'else'])
    })

    it('should detect a one-step shared merge after branch targets', () => {
      const nodeById = new Map([
        ['route', makeNode({ id: 'route', data: { type: BlockEnum.IfElse, cases: [{ case_id: 'case-a' }] } })],
        ['if-node', makeNode({ id: 'if-node' })],
        ['else-node', makeNode({ id: 'else-node' })],
        ['join', makeNode({ id: 'join' })],
      ])
      const outgoingEdges = [
        makeEdge({ id: 'route-if', source: 'route', sourceHandle: 'case-a', target: 'if-node' }),
        makeEdge({ id: 'route-else', source: 'route', sourceHandle: 'false', target: 'else-node' }),
      ]
      const ifJoinEdge = makeEdge({ id: 'if-join', source: 'if-node', target: 'join' })
      const elseJoinEdge = makeEdge({ id: 'else-join', source: 'else-node', target: 'join' })
      const edgesBySource = new Map<string, Edge[]>([
        ['if-node', [ifJoinEdge]],
        ['else-node', [elseJoinEdge]],
      ])

      expect(getSharedBranchMerge({
        edgesBySource,
        nodeById,
        outgoingEdges,
      })).toEqual({
        branchEndEdgesBySourceId: new Map([
          ['if-node', ifJoinEdge],
          ['else-node', elseJoinEdge],
        ]),
        node: nodeById.get('join'),
      })
    })
  })
})
