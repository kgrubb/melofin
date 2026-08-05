const SECRET_KEYS = [
  'authorization',
  'token',
  'accesstoken',
  'password',
  'secret',
  'apikey',
  'api_key',
] as const

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export type LogFields = Readonly<Record<string, unknown>>

const isSecretKey = (key: string): boolean =>
  SECRET_KEYS.some((secret) => key.toLowerCase().includes(secret))

export const redactValue = (key: string, value: unknown): unknown => {
  if (isSecretKey(key)) return '[REDACTED]'
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(String(index), item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        redactValue(k, v),
      ]),
    )
  }
  return value
}

export const redactFields = (fields: LogFields = {}): LogFields =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, redactValue(key, value)]),
  )

type LoggerSink = (level: LogLevel, message: string, fields: LogFields) => void

const defaultSink: LoggerSink = (level, message, fields) => {
  const payload = JSON.stringify({ level, message, ...fields, ts: new Date().toISOString() })
  if (level === 'error') {
    console.error(payload)
    return
  }
  if (level === 'warn') {
    console.warn(payload)
    return
  }
  console.log(payload)
}

export const createLogger = (sink: LoggerSink = defaultSink) => {
  const write = (level: LogLevel, message: string, fields?: LogFields) => {
    sink(level, message, redactFields(fields))
  }
  return {
    debug: (message: string, fields?: LogFields) => write('debug', message, fields),
    info: (message: string, fields?: LogFields) => write('info', message, fields),
    warn: (message: string, fields?: LogFields) => write('warn', message, fields),
    error: (message: string, fields?: LogFields) => write('error', message, fields),
  }
}

export const logger = createLogger()
