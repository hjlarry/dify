import {
  CUSTOM_NODE,
} from '../../constants'
import { CUSTOM_SIMPLE_NODE } from '../../simple-node/constants'
import {
  canvasV2NodeTypes,
} from '../node-types'
import CompactNode from '../nodes/compact-node'

describe('canvasV2NodeTypes', () => {
  // V2 must use its own compact renderer for regular workflow nodes.
  describe('Rendering map', () => {
    it('should map regular and simple nodes to the compact node renderer', () => {
      expect(canvasV2NodeTypes[CUSTOM_NODE]).toBe(CompactNode)
      expect(canvasV2NodeTypes[CUSTOM_SIMPLE_NODE]).toBe(CompactNode)
    })
  })
})
