import { cn } from '@langgenius/dify-ui/cn'

type CanvasV2NodeAddTriggerClassNameOptions = {
  disabled?: boolean
  hoverClassName?: string
  open?: boolean
}

export const CANVAS_V2_NODE_ADD_ICON_CLASS_NAME = 'i-ri-add-line size-3'

export const getCanvasV2NodeAddTriggerClassName = ({
  disabled,
  hoverClassName = 'group-hover:opacity-100',
  open,
}: CanvasV2NodeAddTriggerClassNameOptions = {}) => {
  return cn(
    'flex size-4 items-center justify-center rounded-full border border-components-button-primary-border bg-components-button-primary-bg text-text-primary-on-surface opacity-0 shadow-xs outline-hidden transition-opacity duration-150 hover:border-components-button-primary-border-hover hover:bg-components-button-primary-bg-hover focus-visible:ring-2 focus-visible:ring-components-input-border-hover',
    hoverClassName,
    open && 'opacity-100',
    disabled && 'cursor-not-allowed opacity-50',
  )
}
