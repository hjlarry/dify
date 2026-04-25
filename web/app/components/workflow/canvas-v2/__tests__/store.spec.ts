import { NEW_WORKFLOW_CANVAS_ENABLED_KEY } from '../constants'

type StorageMock = Storage & {
  getStore: () => Record<string, string>
}

const createStorageMock = (initialStore: Record<string, string> = {}): StorageMock => {
  let store = { ...initialStore }

  return {
    get length() {
      return Object.keys(store).length
    },
    clear: vi.fn(() => {
      store = {}
    }),
    getItem: vi.fn((key: string) => store[key] ?? null),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    getStore: () => store,
  }
}

const loadStore = async (storage = createStorageMock()) => {
  vi.resetModules()
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })

  const module = await import('../store')
  return {
    storage,
    store: module.useNewWorkflowCanvasStore,
  }
}

describe('new workflow canvas store', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('State Management', () => {
    it('should initialize from the persisted enabled value', async () => {
      // Arrange
      const { store } = await loadStore(createStorageMock({
        [NEW_WORKFLOW_CANVAS_ENABLED_KEY]: 'true',
      }))

      // Assert
      expect(store.getState().enabled).toBe(true)
    })

    it('should default to disabled when no local preference exists', async () => {
      // Arrange
      const { store } = await loadStore()

      // Assert
      expect(store.getState().enabled).toBe(false)
    })

    it('should persist the enabled value', async () => {
      // Arrange
      const { storage, store } = await loadStore()

      // Act
      store.getState().setEnabled(true)

      // Assert
      expect(store.getState().enabled).toBe(true)
      expect(storage.getItem(NEW_WORKFLOW_CANVAS_ENABLED_KEY)).toBe('true')
    })

    it('should persist the disabled value', async () => {
      // Arrange
      const { storage, store } = await loadStore(createStorageMock({
        [NEW_WORKFLOW_CANVAS_ENABLED_KEY]: 'true',
      }))

      // Act
      store.getState().setEnabled(false)

      // Assert
      expect(store.getState().enabled).toBe(false)
      expect(storage.getItem(NEW_WORKFLOW_CANVAS_ENABLED_KEY)).toBe('false')
    })
  })
})
