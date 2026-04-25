import { create } from 'zustand'
import { NEW_WORKFLOW_CANVAS_ENABLED_KEY } from './constants'

type NewWorkflowCanvasStoreShape = {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

const getLocalStorage = (): Storage | undefined => {
  try {
    return typeof globalThis === 'undefined' ? undefined : globalThis.localStorage
  }
  catch {
    return undefined
  }
}

const readEnabled = () => {
  const storage = getLocalStorage()
  if (!storage)
    return false

  return storage.getItem(NEW_WORKFLOW_CANVAS_ENABLED_KEY) === 'true'
}

const writeStorage = (enabled: boolean) => {
  const storage = getLocalStorage()
  if (storage)
    storage.setItem(NEW_WORKFLOW_CANVAS_ENABLED_KEY, String(enabled))
}

export const useNewWorkflowCanvasStore = create<NewWorkflowCanvasStoreShape>(set => ({
  enabled: readEnabled(),
  setEnabled: (enabled) => {
    writeStorage(enabled)
    set({ enabled })
  },
}))
