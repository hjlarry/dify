import type { NodeChange } from 'reactflow'
import type {
  Edge,
  Node,
} from '../../types'
import { BlockEnum, ControlMode } from '../../types'
import {
  getGraphNodeChanges,
  getSelectableGraphNodeChanges,
  withConnectedNodeSelection,
  withSelectedGraphNode,
  withSelectedNodeData,
} from '../canvas-state'

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

describe('canvas-state', () => {
  describe('node changes', () => {
    it('should ignore React Flow dimensions changes for the workflow graph', () => {
      const positionChange = {
        id: 'node-1',
        type: 'position',
        position: { x: 24, y: 48 },
      } as NodeChange
      const dimensionsChange = {
        id: 'node-1',
        type: 'dimensions',
        dimensions: { width: 200, height: 48 },
      } as NodeChange

      expect(getGraphNodeChanges([dimensionsChange, positionChange])).toEqual([positionChange])
    })

    it('should block selection changes while comment mode is active', () => {
      const selectChange = {
        id: 'node-1',
        type: 'select',
        selected: true,
      } as NodeChange
      const positionChange = {
        id: 'node-1',
        type: 'position',
        position: { x: 24, y: 48 },
      } as NodeChange

      expect(getSelectableGraphNodeChanges([selectChange, positionChange], ControlMode.Comment)).toEqual([positionChange])
      expect(getSelectableGraphNodeChanges([selectChange, positionChange], ControlMode.Pointer)).toEqual([selectChange, positionChange])
    })
  })

  describe('selection metadata', () => {
    it('should return the same node list when there are no selection changes', () => {
      const nodes = [makeNode({ id: 'node-1' })]

      expect(withSelectedNodeData(nodes, [])).toBe(nodes)
    })

    it('should sync React Flow selection into node data', () => {
      const nodes = [
        makeNode({ id: 'node-1', selected: false, data: { selected: true } }),
        makeNode({ id: 'node-2', selected: false, data: { selected: false } }),
      ]
      const changes = [
        {
          id: 'node-1',
          type: 'select',
          selected: false,
        } as NodeChange,
      ]

      expect(withSelectedNodeData(nodes, changes)).toEqual([
        expect.objectContaining({
          id: 'node-1',
          selected: false,
          data: expect.objectContaining({ selected: false }),
        }),
        nodes[1],
      ])
    })

    it('should mark connected edges when a node is selected', () => {
      const nodes = [
        makeNode({ id: 'source', data: { selected: true } }),
        makeNode({ id: 'target' }),
        makeNode({ id: 'unrelated' }),
      ]
      const edges = [
        makeEdge({ id: 'selected-edge', source: 'source', target: 'target' }),
        makeEdge({ id: 'unselected-edge', source: 'target', target: 'unrelated' }),
      ]

      expect(withConnectedNodeSelection(edges, nodes)).toEqual([
        expect.objectContaining({
          id: 'selected-edge',
          data: expect.objectContaining({ _connectedNodeIsSelected: true }),
        }),
        expect.objectContaining({
          id: 'unselected-edge',
          data: expect.objectContaining({ _connectedNodeIsSelected: false }),
        }),
      ])
    })

    it('should select one graph node and refresh connected edge metadata', () => {
      const graph = {
        nodes: [
          makeNode({ id: 'source' }),
          makeNode({ id: 'target', selected: true, data: { selected: true } }),
        ],
        edges: [
          makeEdge({
            id: 'source-target',
            source: 'source',
            target: 'target',
            data: { _connectedNodeIsSelected: false },
          }),
        ],
      }

      expect(withSelectedGraphNode(graph, 'source')).toEqual({
        nodes: [
          expect.objectContaining({
            id: 'source',
            selected: true,
            data: expect.objectContaining({ selected: true }),
          }),
          expect.objectContaining({
            id: 'target',
            selected: false,
            data: expect.objectContaining({ selected: false }),
          }),
        ],
        edges: [
          expect.objectContaining({
            id: 'source-target',
            data: expect.objectContaining({ _connectedNodeIsSelected: true }),
          }),
        ],
      })
    })
  })
})
