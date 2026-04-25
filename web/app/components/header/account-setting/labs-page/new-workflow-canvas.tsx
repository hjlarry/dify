import { Switch } from '@langgenius/dify-ui/switch'
import { useTranslation } from 'react-i18next'
import {
  useNewWorkflowCanvasEnabled,
  useSetNewWorkflowCanvasEnabled,
} from '@/app/components/workflow/canvas-v2/hooks'

const NewWorkflowCanvas = () => {
  const { t } = useTranslation()
  const enabled = useNewWorkflowCanvasEnabled()
  const setEnabled = useSetNewWorkflowCanvasEnabled()

  return (
    <div className="flex items-center justify-between rounded-xl bg-background-section-burn p-4">
      <div className="mr-6 min-w-0">
        <div className="system-md-medium text-text-primary">
          {t('settings.labs.newWorkflowCanvas.title', { ns: 'common' })}
        </div>
        <div className="mt-1 system-xs-regular text-text-tertiary">
          {t('settings.labs.newWorkflowCanvas.description', { ns: 'common' })}
        </div>
      </div>
      <Switch
        size="lg"
        checked={enabled}
        aria-label={t('settings.labs.newWorkflowCanvas.title', { ns: 'common' })}
        onCheckedChange={setEnabled}
      />
    </div>
  )
}

export default NewWorkflowCanvas
