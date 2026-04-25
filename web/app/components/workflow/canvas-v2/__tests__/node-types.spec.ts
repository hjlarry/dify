import {
  CUSTOM_EDGE,
  CUSTOM_NODE,
} from '../../constants'
import { CUSTOM_SIMPLE_NODE } from '../../simple-node/constants'
import CustomEdge from '../edges/custom-edge'
import {
  canvasV2EdgeTypes,
  canvasV2NodeTypes,
} from '../node-types'
import CompactNode from '../nodes/compact-node'

describe('canvasV2 graph types', () => {
  // V2 must use its own compact renderer for regular workflow nodes.
  describe('Rendering map', () => {
    it('should map regular and simple nodes to the compact node renderer', () => {
      expect(canvasV2NodeTypes[CUSTOM_NODE]).toBe(CompactNode)
      expect(canvasV2NodeTypes[CUSTOM_SIMPLE_NODE]).toBe(CompactNode)
    })

    it('should map custom edges to the V2 edge renderer', () => {
      expect(canvasV2EdgeTypes[CUSTOM_EDGE]).toBe(CustomEdge)
    })
  })
})
