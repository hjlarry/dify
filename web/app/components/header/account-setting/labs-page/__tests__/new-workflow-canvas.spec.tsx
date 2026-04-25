import { fireEvent, render, screen } from '@testing-library/react'
import { useNewWorkflowCanvasStore } from '@/app/components/workflow/canvas-v2/store'
import NewWorkflowCanvas from '../new-workflow-canvas'

describe('NewWorkflowCanvas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNewWorkflowCanvasStore.setState({ enabled: false })
  })

  describe('Rendering', () => {
    it('should render the experimental new workflow canvas setting', () => {
      // Act
      render(<NewWorkflowCanvas />)

      // Assert
      expect(screen.getByText('common.settings.labs.newWorkflowCanvas.title')).toBeInTheDocument()
      expect(screen.getByText('common.settings.labs.newWorkflowCanvas.description')).toBeInTheDocument()
      expect(screen.getByRole('switch', { name: 'common.settings.labs.newWorkflowCanvas.title' })).toHaveAttribute('aria-checked', 'false')
    })
  })

  describe('User Interactions', () => {
    it('should enable the lab feature when the switch is clicked', () => {
      // Arrange
      render(<NewWorkflowCanvas />)

      // Act
      fireEvent.click(screen.getByRole('switch', { name: 'common.settings.labs.newWorkflowCanvas.title' }))

      // Assert
      expect(useNewWorkflowCanvasStore.getState().enabled).toBe(true)
    })

    it('should disable the lab feature when the switch is clicked again', () => {
      // Arrange
      useNewWorkflowCanvasStore.getState().setEnabled(true)
      render(<NewWorkflowCanvas />)

      // Act
      fireEvent.click(screen.getByRole('switch', { name: 'common.settings.labs.newWorkflowCanvas.title' }))

      // Assert
      expect(useNewWorkflowCanvasStore.getState().enabled).toBe(false)
    })
  })
})
