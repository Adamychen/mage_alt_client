import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Gateway } from './Gateway'

/** WebSocket simulado: estáticos de readyState, y helpers para disparar onopen/onmessage/onclose. */
class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  onclose: ((ev: { reason?: string; code?: number }) => void) | null = null
  onerror: (() => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
  }

  triggerOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  triggerMessage(data: string) {
    this.onmessage?.({ data })
  }

  triggerClose(reason = '', code = 1006) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ reason, code })
  }
}

function currentWs(g: Gateway): FakeWebSocket {
  return g.ws as unknown as FakeWebSocket
}

async function connectOpen(g: Gateway): Promise<void> {
  const p = g.connect('ws://proxy.test:8787')
  currentWs(g).triggerOpen()
  await vi.advanceTimersByTimeAsync(100)
  await p
}

describe('Gateway', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.useFakeTimers()
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('connect() resolves once onopen fires', async () => {
    const g = new Gateway()
    const p = g.connect('ws://proxy.test:8787')
    expect(g.isOpen).toBe(false)
    currentWs(g).triggerOpen()
    await vi.advanceTimersByTimeAsync(100)
    await p
    expect(g.isOpen).toBe(true)
  })

  it('send() resolves with the result matched by requestId', async () => {
    const g = new Gateway()
    await connectOpen(g)
    const first = g.send('getGameTypes')
    const second = g.send('getGameTypes')
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'getGameTypes', requestId: '0', ok: true, data: ['A'] }))
    const r1 = await first
    expect(r1.data).toEqual(['A'])
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'getGameTypes', requestId: '1', ok: true, data: ['B'] }))
    const r2 = await second
    expect(r2.data).toEqual(['B'])
    expect(currentWs(g).sent).toHaveLength(2)
    expect(JSON.parse(currentWs(g).sent[0])).toMatchObject({ requestId: '0', action: 'getGameTypes' })
    expect(JSON.parse(currentWs(g).sent[1])).toMatchObject({ requestId: '1', action: 'getGameTypes' })
  })

  it('does not confuse concurrent requests with the same action when results arrive out of order', async () => {
    const g = new Gateway()
    await connectOpen(g)
    const first = g.send('getGameTypes')
    const second = g.send('getGameTypes')
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'getGameTypes', requestId: '1', ok: true, data: ['second'] }))
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'getGameTypes', requestId: '0', ok: true, data: ['first'] }))
    expect((await first).data).toEqual(['first'])
    expect((await second).data).toEqual(['second'])
  })

  it('sends actions of different names without cross-matching results', async () => {
    const g = new Gateway()
    await connectOpen(g)
    const pA = g.send('actionA')
    const pB = g.send('actionB')
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'actionB', ok: true, data: 'B' }))
    const rB = await pB
    expect(rB.data).toBe('B')
    currentWs(g).triggerMessage(JSON.stringify({ type: 'result', action: 'actionA', ok: true, data: 'A' }))
    const rA = await pA
    expect(rA.data).toBe('A')
  })

  it('close() rejects pending requests with "disconnected"', async () => {
    const g = new Gateway()
    await connectOpen(g)
    const p = g.send('joinTable', { tableId: 't1' })
    g.close()
    const res = await p
    expect(res.ok).toBe(false)
    expect(res.error).toBe('disconnected')
    expect(g.isOpen).toBe(false)
  })

  it('send() while disconnected resolves with "not connected"', async () => {
    const g = new Gateway()
    const res = await g.send('quitMatch')
    expect(res.ok).toBe(false)
    expect(res.error).toBe('not connected')
  })

  it('reconnects after an unexpected close with backoff', async () => {
    const g = new Gateway()
    await connectOpen(g)
    const first = currentWs(g)
    const onClose = vi.fn()
    g.events.onClose = onClose
    first.triggerClose('gone', 1006)
    expect(onClose).toHaveBeenCalledWith('gone')
    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(g.isOpen).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(FakeWebSocket.instances).toHaveLength(2)
    const second = currentWs(g)
    expect(second).not.toBe(first)
    expect(g.isOpen).toBe(false)
    second.triggerOpen()
    expect(g.isOpen).toBe(true)
  })

  it('does not reconnect after a user-initiated close', async () => {
    const g = new Gateway()
    await connectOpen(g)
    g.close()
    await vi.advanceTimersByTimeAsync(20000)
    expect(FakeWebSocket.instances).toHaveLength(1)
  })
})
