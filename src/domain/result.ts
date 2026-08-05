export type AppErrorCode =
  | 'network'
  | 'timeout'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'validation'
  | 'cancelled'
  | 'storage'
  | 'playback'
  | 'unknown'

export type AppError = {
  readonly code: AppErrorCode
  readonly message: string
  readonly cause?: unknown
}

export type Result<T, E = AppError> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const appError = (
  code: AppErrorCode,
  message: string,
  cause?: unknown,
): AppError => ({
  code,
  message,
  ...(cause === undefined ? {} : { cause }),
})

export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } =>
  result.ok

export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } =>
  !result.ok

export const mapResult = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => U,
): Result<U, E> => (result.ok ? ok(mapper(result.value)) : result)

export const flatMapResult = <T, U, E>(
  result: Result<T, E>,
  mapper: (value: T) => Result<U, E>,
): Result<U, E> => (result.ok ? mapper(result.value) : result)
