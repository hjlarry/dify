import type { CommonNodeType } from '../../types'
import { ErrorHandleTypeEnum } from '../../nodes/_base/components/error-handle/types'
import { BlockEnum } from '../../types'

type BranchLabelOptions = {
  sourceNodeData?: CommonNodeType
  sourceHandleId?: string | null
  failBranchLabel: string
}

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
