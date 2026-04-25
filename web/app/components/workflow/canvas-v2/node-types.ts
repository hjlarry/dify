import {
  CUSTOM_EDGE,
  CUSTOM_NODE,
} from '../constants'
import CustomEdge from '../custom-edge'
import CustomNode from '../nodes'
import CustomDataSourceEmptyNode from '../nodes/data-source-empty'
import { CUSTOM_DATA_SOURCE_EMPTY_NODE } from '../nodes/data-source-empty/constants'
import CustomIterationStartNode from '../nodes/iteration-start'
import { CUSTOM_ITERATION_START_NODE } from '../nodes/iteration-start/constants'
import CustomLoopStartNode from '../nodes/loop-start'
import { CUSTOM_LOOP_START_NODE } from '../nodes/loop-start/constants'
import CustomNoteNode from '../note-node'
import { CUSTOM_NOTE_NODE } from '../note-node/constants'
import CustomSimpleNode from '../simple-node'
import { CUSTOM_SIMPLE_NODE } from '../simple-node/constants'

export const canvasV2NodeTypes = {
  [CUSTOM_NODE]: CustomNode,
  [CUSTOM_NOTE_NODE]: CustomNoteNode,
  [CUSTOM_SIMPLE_NODE]: CustomSimpleNode,
  [CUSTOM_ITERATION_START_NODE]: CustomIterationStartNode,
  [CUSTOM_LOOP_START_NODE]: CustomLoopStartNode,
  [CUSTOM_DATA_SOURCE_EMPTY_NODE]: CustomDataSourceEmptyNode,
}

export const canvasV2EdgeTypes = {
  [CUSTOM_EDGE]: CustomEdge,
}
