import { describe, expect, it, vi } from 'vitest'
import { checkN8nHealth, getN8nWorkflowUrl, triggerN8nWebhook } from './n8n-adapter'

describe('n8n-adapter', () => {
  it('formats workflow editor URL correctly', () => {
    expect(getN8nWorkflowUrl('wf_123')).toBe('http://127.0.0.1:5678/workflow/wf_123')
    expect(getN8nWorkflowUrl('special:id', 'http://n8n.local:5678/')).toBe('http://n8n.local:5678/workflow/special%3Aid')
  })

  it('checks health when online', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'ok' })
    })

    const res = await checkN8nHealth('http://127.0.0.1:5678')
    expect(res.online).toBe(true)
    expect(res.statusCode).toBe(200)
    expect(res.status).toBe('ok')
  })

  it('handles offline instance gracefully', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

    const res = await checkN8nHealth('http://127.0.0.1:5678')
    expect(res.online).toBe(false)
    expect(res.error).toBe('Connection refused')
  })

  it('triggers webhook successfully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ executionId: 'exec_abc_123', status: 'finished' })
    })

    const res = await triggerN8nWebhook<{ executionId: string; status: string }>(
      'run-research',
      { query: 'competitor analysis' },
      'http://127.0.0.1:5678'
    )
    expect(res.success).toBe(true)
    expect(res.result?.executionId).toBe('exec_abc_123')
  })
})
