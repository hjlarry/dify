import type { CommonNodeType } from '../../types'
import { ErrorHandleTypeEnum } from '../../nodes/_base/components/error-handle/types'
import { BlockEnum } from '../../types'

type BranchLabelOptions = {
  sourceNodeData?: CommonNodeType
  sourceHandleId?: string | null
  failBranchLabel: string
}

type BranchOrderOptions = {
  sourceNodeData?: CommonNodeType
  sourceHandleId?: string | null
}

const UNKNOWN_BRANCH_ORDER = 5000
const TERMINAL_BRANCH_ORDER = 10000

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}

const findRecordById = (
  value: unknown,
  idField: string,
  id: string,
) => {
  if (!Array.isArray(value))
    return undefined

  return value.find((item): item is Record<string, unknown> => {
    return isRecord(item) && item[idField] === id
  })
}

const findRecordIndexById = (
  value: unknown,
  idField: string,
  id: string,
) => {
  if (!Array.isArray(value))
    return -1

  return value.findIndex(item => isRecord(item) && item[idField] === id)
}

const getIfElseLabel = (sourceNodeData: CommonNodeType, sourceHandleId: string) => {
  if (sourceHandleId === 'false')
    return 'ELSE'

  const cases = (sourceNodeData as CommonNodeType & Record<string, unknown>).cases
  const caseIndex = Array.isArray(cases)
    ? cases.findIndex(item => isRecord(item) && item.case_id === sourceHandleId)
    : -1

  if (caseIndex === 0 || sourceHandleId === 'true')
    return 'IF'

  if (caseIndex > 0)
    return 'ELIF'

  return undefined
}

const getQuestionClassifierLabel = (sourceNodeData: CommonNodeType, sourceHandleId: string) => {
  const matchedClass = findRecordById(
    (sourceNodeData as CommonNodeType & Record<string, unknown>).classes,
    'id',
    sourceHandleId,
  )
  const className = matchedClass?.name

  return typeof className === 'string' && className ? className : undefined
}

const getHumanInputLabel = (sourceNodeData: CommonNodeType, sourceHandleId: string) => {
  if (sourceHandleId === '__timeout')
    return 'Timeout'

  const matchedAction = findRecordById(
    (sourceNodeData as CommonNodeType & Record<string, unknown>).user_actions,
    'id',
    sourceHandleId,
  )
  const actionTitle = matchedAction?.title

  return typeof actionTitle === 'string' && actionTitle ? actionTitle : undefined
}

export const getCanvasV2BranchOrder = ({
  sourceNodeData,
  sourceHandleId,
}: BranchOrderOptions) => {
  if (sourceHandleId === ErrorHandleTypeEnum.failBranch)
    return TERMINAL_BRANCH_ORDER

  if (!sourceNodeData || !sourceHandleId)
    return UNKNOWN_BRANCH_ORDER

  if (sourceNodeData.type === BlockEnum.IfElse) {
    if (sourceHandleId === 'true')
      return 0

    if (sourceHandleId === 'false')
      return TERMINAL_BRANCH_ORDER

    const caseIndex = findRecordIndexById(
      (sourceNodeData as CommonNodeType & Record<string, unknown>).cases,
      'case_id',
      sourceHandleId,
    )

    return caseIndex >= 0 ? caseIndex : UNKNOWN_BRANCH_ORDER
  }

  if (sourceNodeData.type === BlockEnum.QuestionClassifier) {
    const classIndex = findRecordIndexById(
      (sourceNodeData as CommonNodeType & Record<string, unknown>).classes,
      'id',
      sourceHandleId,
    )

    return classIndex >= 0 ? classIndex : UNKNOWN_BRANCH_ORDER
  }

  if (sourceNodeData.type === BlockEnum.HumanInput) {
    if (sourceHandleId === '__timeout')
      return TERMINAL_BRANCH_ORDER

    const actionIndex = findRecordIndexById(
      (sourceNodeData as CommonNodeType & Record<string, unknown>).user_actions,
      'id',
      sourceHandleId,
    )

    return actionIndex >= 0 ? actionIndex : UNKNOWN_BRANCH_ORDER
  }

  return 0
}

export const getCanvasV2BranchLabel = ({
  sourceNodeData,
  sourceHandleId,
  failBranchLabel,
}: BranchLabelOptions) => {
  if (sourceHandleId === ErrorHandleTypeEnum.failBranch)
    return failBranchLabel

  if (!sourceNodeData || !sourceHandleId)
    return undefined

  if (sourceNodeData.type === BlockEnum.IfElse)
    return getIfElseLabel(sourceNodeData, sourceHandleId)

  if (sourceNodeData.type === BlockEnum.QuestionClassifier)
    return getQuestionClassifierLabel(sourceNodeData, sourceHandleId)

  if (sourceNodeData.type === BlockEnum.HumanInput)
    return getHumanInputLabel(sourceNodeData, sourceHandleId)

  return undefined
}
