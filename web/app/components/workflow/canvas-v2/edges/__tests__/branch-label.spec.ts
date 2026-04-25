import { ErrorHandleTypeEnum } from '../../../nodes/_base/components/error-handle/types'
import {
  BlockEnum,
} from '../../../types'
import { getCanvasV2BranchLabel } from '../branch-label'

const failBranchLabel = 'Fail branch'

describe('getCanvasV2BranchLabel', () => {
  // Labels are derived from source node data without changing workflow DSL.
  describe('Branch labels', () => {
    it('should resolve IfElse handles to IF, ELIF, and ELSE labels', () => {
      const sourceNodeData = {
        type: BlockEnum.IfElse,
        title: 'Route',
        desc: '',
        cases: [
          { case_id: 'case-a' },
          { case_id: 'case-b' },
        ],
      }

      expect(getCanvasV2BranchLabel({ sourceNodeData: sourceNodeData as never, sourceHandleId: 'case-a', failBranchLabel })).toBe('IF')
      expect(getCanvasV2BranchLabel({ sourceNodeData: sourceNodeData as never, sourceHandleId: 'case-b', failBranchLabel })).toBe('ELIF')
      expect(getCanvasV2BranchLabel({ sourceNodeData: sourceNodeData as never, sourceHandleId: 'false', failBranchLabel })).toBe('ELSE')
      expect(getCanvasV2BranchLabel({ sourceNodeData: sourceNodeData as never, sourceHandleId: 'true', failBranchLabel })).toBe('IF')
    })

    it('should resolve classifier and human input handles to user-facing names', () => {
      expect(getCanvasV2BranchLabel({
        sourceNodeData: {
          type: BlockEnum.QuestionClassifier,
          title: 'Classify',
          desc: '',
          classes: [{ id: 'refund', name: 'Refund request' }],
        } as never,
        sourceHandleId: 'refund',
        failBranchLabel,
      })).toBe('Refund request')

      expect(getCanvasV2BranchLabel({
        sourceNodeData: {
          type: BlockEnum.HumanInput,
          title: 'Review',
          desc: '',
          user_actions: [{ id: 'approve', title: 'Approve' }],
        } as never,
        sourceHandleId: 'approve',
        failBranchLabel,
      })).toBe('Approve')

      expect(getCanvasV2BranchLabel({
        sourceNodeData: {
          type: BlockEnum.HumanInput,
          title: 'Review',
          desc: '',
          user_actions: [],
        } as never,
        sourceHandleId: '__timeout',
        failBranchLabel,
      })).toBe('Timeout')
    })

    it('should resolve fail branch labels and ignore unknown handles', () => {
      expect(getCanvasV2BranchLabel({
        sourceNodeData: undefined,
        sourceHandleId: ErrorHandleTypeEnum.failBranch,
        failBranchLabel,
      })).toBe(failBranchLabel)

      expect(getCanvasV2BranchLabel({
        sourceNodeData: {
          type: BlockEnum.QuestionClassifier,
          title: 'Classify',
          desc: '',
          classes: [],
        } as never,
        sourceHandleId: 'missing',
        failBranchLabel,
      })).toBeUndefined()
    })
  })
})
