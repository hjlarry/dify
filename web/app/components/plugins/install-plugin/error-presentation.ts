import type { SelectorParam, TFunction } from 'i18next'
import type { PluginAppError } from '../error'

export const PLUGIN_ERROR_CODE = {
  packageTooLarge: 'plugin_package_too_large',
} as const

export type PluginErrorCode = (typeof PLUGIN_ERROR_CODE)[keyof typeof PLUGIN_ERROR_CODE]
export type PluginErrorRetryability = 'immediate' | 'delayed' | 'after_change' | 'never' | 'unknown'
export type PluginErrorUserAction = 'repackage_plugin'
export type PluginErrorPresentationAction = 'close'

type PluginErrorPresentationDefinition = {
  messageSelector: SelectorParam<'plugin'>
  hintSelector?: SelectorParam<'plugin'>
  retryability: PluginErrorRetryability
  userAction?: PluginErrorUserAction
  action: PluginErrorPresentationAction
}

const pluginErrorPresentationRegistry = {
  [PLUGIN_ERROR_CODE.packageTooLarge]: {
    messageSelector: ($) => $['errors.plugin_package_too_large.message'],
    hintSelector: ($) => $['errors.plugin_package_too_large.hint'],
    retryability: 'after_change',
    userAction: 'repackage_plugin',
    action: 'close',
  },
} satisfies Record<PluginErrorCode, PluginErrorPresentationDefinition>

export type PluginErrorPresentation = {
  message: string
  hint?: string
  retryability: PluginErrorRetryability
  userAction?: PluginErrorUserAction
  action: PluginErrorPresentationAction
}

type PluginErrorPresentationFallback = {
  message: string
  hint?: string
  action: PluginErrorPresentationAction
}

function isPluginErrorCode(code: string | undefined): code is PluginErrorCode {
  return !!code && Object.hasOwn(pluginErrorPresentationRegistry, code)
}

export function resolvePluginErrorPresentation(
  error: PluginAppError,
  t: TFunction<'plugin'>,
  fallback: PluginErrorPresentationFallback,
): PluginErrorPresentation {
  if (isPluginErrorCode(error.code)) {
    const definition = pluginErrorPresentationRegistry[error.code]
    return {
      message: t(definition.messageSelector),
      hint: definition.hintSelector ? t(definition.hintSelector) : undefined,
      retryability: definition.retryability,
      userAction: definition.userAction,
      action: definition.action,
    }
  }

  return {
    message: fallback.message,
    hint: error.message ?? error.hint ?? fallback.hint,
    retryability: 'unknown',
    action: fallback.action,
  }
}
