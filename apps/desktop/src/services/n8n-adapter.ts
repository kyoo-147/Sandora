/**
 * Sandora Desktop - n8n Thin Automation Adapter
 *
 * Minimal coupling client for local or remote n8n sidecar:
 * 1. Health check (GET /healthz)
 * 2. Open workflow editor (GET /workflow/:id)
 * 3. Trigger workflow via webhook (POST /webhook/:path)
 */

export const DEFAULT_N8N_BASE_URL = 'http://127.0.0.1:5678'

export interface N8nHealthResult {
  online: boolean
  status?: string
  statusCode?: number
  error?: string
}

export interface N8nWebhookResult<T = unknown> {
  success: boolean
  statusCode?: number
  result?: T
  error?: string
}

/**
 * Check if the n8n instance is running and reachable.
 */
export async function checkN8nHealth(baseUrl = DEFAULT_N8N_BASE_URL, timeoutMs = 3000): Promise<N8nHealthResult> {
  const url = `${baseUrl.replace(/\/+$/, '')}/healthz`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json().catch(() => ({ status: 'ok' }))
      return { online: true, statusCode: res.status, status: data.status || 'ok' }
    }
    return { online: false, statusCode: res.status, error: `HTTP ${res.status}: ${res.statusText}` }
  } catch (err: unknown) {
    clearTimeout(timer)
    return { online: false, error: err instanceof Error ? err.message : 'Unreachable' }
  }
}

/**
 * Get the direct URL to view/edit a workflow in the n8n UI.
 */
export function getN8nWorkflowUrl(workflowId: string, baseUrl = DEFAULT_N8N_BASE_URL): string {
  return `${baseUrl.replace(/\/+$/, '')}/workflow/${encodeURIComponent(workflowId)}`
}

/**
 * Open the workflow in the user's default browser or new tab.
 */
export function openN8nWorkflowEditor(workflowId: string, baseUrl = DEFAULT_N8N_BASE_URL): void {
  const url = getN8nWorkflowUrl(workflowId, baseUrl)
  if (typeof window !== 'undefined' && window.open) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

/**
 * Trigger an n8n workflow via its Webhook trigger node.
 */
export async function triggerN8nWebhook<T = unknown>(
  path: string,
  payload: Record<string, unknown> = {},
  baseUrl = DEFAULT_N8N_BASE_URL,
  timeoutMs = 30000
): Promise<N8nWebhookResult<T>> {
  const cleanPath = path.replace(/^\/+/, '')
  const url = `${baseUrl.replace(/\/+$/, '')}/webhook/${cleanPath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Sandora-Desktop-Adapter/1.0'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    clearTimeout(timer)

    if (res.ok) {
      const result = (await res.json().catch(() => ({}))) as T
      return { success: true, statusCode: res.status, result }
    }
    const errText = await res.text().catch(() => '')
    return { success: false, statusCode: res.status, error: errText || `HTTP ${res.status}` }
  } catch (err: unknown) {
    clearTimeout(timer)
    return { success: false, error: err instanceof Error ? err.message : 'Network error' }
  }
}
