import { useNewWorkflowCanvasStore } from './store'

export const useNewWorkflowCanvasEnabled = () => {
  return useNewWorkflowCanvasStore(state => state.enabled)
}

export const useSetNewWorkflowCanvasEnabled = () => {
  return useNewWorkflowCanvasStore(state => state.setEnabled)
}
