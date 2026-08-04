import { normalizePluginError } from '../error'

describe('normalizePluginError', () => {
  it('normalizes the XMLHttpRequest rejected by plugin package upload', async () => {
    const xhr = {
      get responseText(): string {
        throw new DOMException(
          'The value is only accessible if responseType is empty or text.',
          'InvalidStateError',
        )
      },
      response: {
        code: 'plugin_package_too_large',
        hint: 'Choose a smaller package.',
        message: 'The plugin package is too large.',
        request_id: 'request-id',
      },
      status: 413,
    }

    await expect(normalizePluginError(xhr)).resolves.toEqual({
      code: 'plugin_package_too_large',
      hint: 'Choose a smaller package.',
      message: 'The plugin package is too large.',
      requestId: 'request-id',
      status: 413,
    })
  })

  it('reads a fetch Response without consuming its body', async () => {
    const response = new Response(
      JSON.stringify({
        code: 'plugin_package_invalid',
        message: 'The plugin package is invalid.',
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 422,
      },
    )

    await expect(normalizePluginError(response)).resolves.toEqual({
      code: 'plugin_package_invalid',
      message: 'The plugin package is invalid.',
      status: 422,
    })
    expect(response.bodyUsed).toBe(false)
  })

  it('prefers the semantic body of an ORPC error over its transport error', async () => {
    await expect(
      normalizePluginError({
        code: 'BAD_REQUEST',
        data: {
          body: {
            code: 'plugin_package_too_large',
            message: 'The plugin package is too large.',
            status: 413,
          },
        },
        message: 'Bad Request',
        status: 400,
      }),
    ).resolves.toEqual({
      code: 'plugin_package_too_large',
      message: 'The plugin package is too large.',
      status: 413,
    })
  })

  it('normalizes the structured error of a failed plugin task', async () => {
    await expect(
      normalizePluginError({
        error: {
          code: 'plugin_installation_failed',
          httpStatus: 502,
          message: 'The plugin could not be installed.',
          phase: 'install',
          requestId: 'task-request-id',
        },
        status: 'failed',
      }),
    ).resolves.toEqual({
      code: 'plugin_installation_failed',
      message: 'The plugin could not be installed.',
      requestId: 'task-request-id',
      status: 502,
    })
  })

  it('drops unregistered data and technical error messages', async () => {
    await expect(
      normalizePluginError({
        code: 'plugin_runtime_error',
        details: {
          secret: 'do-not-expose',
          stack: 'stack trace',
        },
        message: 'The plugin runtime failed.',
        unexpected: 'ignored',
      }),
    ).resolves.toEqual({
      code: 'plugin_runtime_error',
      message: 'The plugin runtime failed.',
    })

    await expect(normalizePluginError(new Error('secret technical failure'))).resolves.toBeNull()
    await expect(
      normalizePluginError('PluginInvokeError: secret technical failure'),
    ).resolves.toBeNull()
  })
})
