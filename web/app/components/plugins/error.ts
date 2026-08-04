export type PluginAppError = Readonly<{
  code?: string
  hint?: string
  message?: string
  requestId?: string
  status?: number
}>

const MAX_NESTING_DEPTH = 4
const SEMANTIC_ERROR_CODE_PATTERN = /^[a-z][a-z0-9_]*$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown) {
  if (typeof value !== 'string') return undefined

  const normalized = value.trim()
  return normalized || undefined
}

function semanticErrorCode(value: unknown) {
  const code = nonEmptyString(value)
  return code && SEMANTIC_ERROR_CODE_PATTERN.test(code) ? code : undefined
}

function httpErrorStatus(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : undefined
}

function recordStatus(value: Record<string, unknown>) {
  return (
    httpErrorStatus(value.status) ??
    httpErrorStatus(value.httpStatus) ??
    httpErrorStatus(value.http_status)
  )
}

function recordRequestId(value: Record<string, unknown>) {
  return nonEmptyString(value.request_id) ?? nonEmptyString(value.requestId)
}

function recordResponseText(value: Record<string, unknown>) {
  try {
    return value.responseText
  } catch {
    return undefined
  }
}

function payloadError(
  value: Record<string, unknown>,
  { includeMessage = true }: { includeMessage?: boolean } = {},
): PluginAppError | null {
  const code = semanticErrorCode(value.code)
  const message = includeMessage
    ? (nonEmptyString(value.message) ?? nonEmptyString(value.error))
    : undefined
  const hint = nonEmptyString(value.hint)
  const requestId = recordRequestId(value)
  const status = recordStatus(value)

  if (!code && !message && !hint && !requestId && !status) return null

  return {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(status ? { status } : {}),
    ...(hint ? { hint } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

function withEnvelopeFields(
  error: PluginAppError,
  envelope: Record<string, unknown>,
): PluginAppError {
  const status = error.status ?? recordStatus(envelope)
  const requestId = error.requestId ?? recordRequestId(envelope)

  return {
    ...error,
    ...(status ? { status } : {}),
    ...(requestId ? { requestId } : {}),
  }
}

function parsedJson(value: string) {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

async function normalizePluginErrorValue(
  value: unknown,
  depth: number,
): Promise<PluginAppError | null> {
  if (depth > MAX_NESTING_DEPTH) return null

  if (value instanceof Response) {
    let normalized: PluginAppError | null = null
    try {
      normalized = await normalizePluginErrorValue(await value.clone().json(), depth + 1)
    } catch {}

    const status = httpErrorStatus(value.status)
    if (normalized)
      return status ? { ...normalized, status: normalized.status ?? status } : normalized

    return status ? { status } : null
  }

  if (typeof value === 'string') {
    const json = parsedJson(value)
    return json === undefined ? null : normalizePluginErrorValue(json, depth + 1)
  }

  if (!isRecord(value)) return null

  const data = isRecord(value.data) ? value.data : null
  const candidates: unknown[] = []
  if (data && 'body' in data) candidates.push(data.body)
  if ('response' in value) candidates.push(value.response)
  if (isRecord(value.error)) candidates.push(value.error)
  if (data) candidates.push(data)
  const responseText = recordResponseText(value)
  if (typeof responseText === 'string') candidates.push(responseText)

  for (const candidate of candidates) {
    if (candidate === value) continue

    const normalized = await normalizePluginErrorValue(candidate, depth + 1)
    if (normalized) return withEnvelopeFields(normalized, value)
  }

  return payloadError(value, { includeMessage: !(value instanceof Error) })
}

/**
 * Converts plugin transport failures into feature-owned data. It deliberately does not translate,
 * render, or preserve unregistered detail fields.
 */
export function normalizePluginError(error: unknown): Promise<PluginAppError | null> {
  return normalizePluginErrorValue(error, 0)
}
