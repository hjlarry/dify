import {
  CUSTOM_EDGE,
  CUSTOM_NODE,
} from '../constants'
import CustomDataSourceEmptyNode from '../nodes/data-source-empty'
import { CUSTOM_DATA_SOURCE_EMPTY_NODE } from '../nodes/data-source-empty/constants'
import { CUSTOM_ITERATION_START_NODE } from '../nodes/iteration-start/constants'
import { CUSTOM_LOOP_START_NODE } from '../nodes/loop-start/constants'
import CustomNoteNode from '../note-node'
import { CUSTOM_NOTE_NODE } from '../note-node/constants'
import { CUSTOM_SIMPLE_NODE } from '../simple-node/constants'
import CustomEdge from './edges/custom-edge'
import CompactNode from './nodes/compact-node'
import HiddenNode from './nodes/hidden-node'

export const canvasV2NodeTypes = {
  [CUSTOM_NODE]: CompactNode,
  [CUSTOM_NOTE_NODE]: CustomNoteNode,
  [CUSTOM_SIMPLE_NODE]: CompactNode,
  [CUSTOM_ITERATION_START_NODE]: HiddenNode,
  [CUSTOM_LOOP_START_NODE]: HiddenNode,
  [CUSTOM_DATA_SOURCE_EMPTY_NODE]: CustomDataSourceEmptyNode,
}

export const canvasV2EdgeTypes = {
  [CUSTOM_EDGE]: CustomEdge,
}
