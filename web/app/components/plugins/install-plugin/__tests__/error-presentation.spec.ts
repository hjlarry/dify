import type { TFunction } from 'i18next'
import { describe, expect, it } from 'vitest'
import { resolvePluginErrorPresentation } from '../error-presentation'

const translations = {
  'errors.plugin_package_too_large.hint': 'Choose a smaller package.',
  'errors.plugin_package_too_large.message': 'Package too large',
}

const t = ((selector: (resource: typeof translations) => string) =>
  selector(translations)) as TFunction<'plugin'>

describe('resolvePluginErrorPresentation', () => {
  it('uses the registered localized presentation for a known code', () => {
    expect(
      resolvePluginErrorPresentation(
        {
          code: 'plugin_package_too_large',
          message: 'Raw backend message',
          status: 413,
        },
        t,
        { message: 'Upload failed', action: 'close' },
      ),
    ).toEqual({
      message: 'Package too large',
      hint: 'Choose a smaller package.',
      retryability: 'after_change',
      userAction: 'repackage_plugin',
      action: 'close',
    })
  })

  it('uses the safe backend message as the hint for an unknown code', () => {
    expect(
      resolvePluginErrorPresentation(
        { code: 'unknown_upload_error', message: 'Upload service unavailable' },
        t,
        { message: 'Upload failed', action: 'close' },
      ),
    ).toEqual({
      message: 'Upload failed',
      hint: 'Upload service unavailable',
      retryability: 'unknown',
      action: 'close',
    })
  })

  it('does not treat Object prototype properties as registered error codes', () => {
    expect(
      resolvePluginErrorPresentation({ code: 'constructor', message: 'Backend fallback' }, t, {
        message: 'Upload failed',
        action: 'close',
      }),
    ).toEqual({
      message: 'Upload failed',
      hint: 'Backend fallback',
      retryability: 'unknown',
      action: 'close',
    })
  })

  it('uses the caller fallback when an unknown error has no message', () => {
    expect(
      resolvePluginErrorPresentation({}, t, {
        message: 'Upload failed',
        hint: 'Try again later',
        action: 'close',
      }),
    ).toEqual({
      message: 'Upload failed',
      hint: 'Try again later',
      retryability: 'unknown',
      action: 'close',
    })
  })
})
