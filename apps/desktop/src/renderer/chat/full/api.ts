import { PASSWORD_HEADER } from '@sharescreen/shared'
import type { ChatState } from '@sharescreen/shared'

export type Access = NonNullable<ChatState['access']>

/** Erro da API com o código que o servidor mandou (o app traduz). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code)
  }
}

export function authHeaders(access: Access, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { authorization: `Bearer ${access.token}`, ...extra }
  if (access.password) headers[PASSWORD_HEADER] = access.password
  return headers
}

/** Pedido ao servidor da call com o token de quem está nela. */
export async function api<T>(
  access: Access,
  path: string,
  init: { method?: string; json?: unknown; body?: BodyInit; headers?: Record<string, string> } = {},
): Promise<T> {
  const headers = authHeaders(access, init.headers)
  if (init.json !== undefined) headers['content-type'] = 'application/json'
  let response: Response
  try {
    response = await fetch(`${access.serverUrl}${path}`, {
      method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    throw new ApiError('offline', 0)
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ApiError(body?.error ?? 'failed', response.status)
  }
  return (await response.json()) as T
}

/** Caminho do servidor (fotos, anexos, emojis) → URL completa. */
export function serverFile(access: Access | null, path: string | null | undefined): string | null {
  return path && access ? `${access.serverUrl}${path}` : null
}
