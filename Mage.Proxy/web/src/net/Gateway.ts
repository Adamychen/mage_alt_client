import type { EventEnvelope, LobbyEnvelope, ProxyMessage, ResultEnvelope } from './types'

export interface GatewayEvents {
  onMessage?: (msg: ProxyMessage) => void
  onOpen?: () => void
  onClose?: (reason: string) => void
}

interface PendingRequest<T = unknown> {
  id: string
  action: string
  resolve: (res: ResultEnvelope & { data?: T }) => void
}

/**
 * Cliente WebSocket del proxy: reconexión con backoff, promesas por acción,
 * y notificación de mensajes al listener (store).
 */
export class Gateway {
  ws: WebSocket | null = null
  events: GatewayEvents = {}
  private url = ''
  private pending = new Map<string, PendingRequest>()
  private pendingByAction = new Map<string, string[]>()
  private seq = 0
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private userClosed = false
  private connectedAt = 0

  constructor(events: GatewayEvents = {}) {
    this.events = events
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN
  }

  get elapsedSecs() {
    return this.isOpen ? Math.round((Date.now() - this.connectedAt) / 1000) : 0
  }

  connect(url: string): Promise<void> {
    this.url = url
    this.userClosed = false
    this.reconnectAttempts = 0
    this.open()
    return this.waitOpen(5000)
  }

  private open() {
    this.cleanup()
    const ws = new WebSocket(this.url)
    this.ws = ws
    ws.onopen = () => {
      this.reconnectAttempts = 0
      this.connectedAt = Date.now()
      this.events.onOpen?.()
    }
    ws.onmessage = (ev) => this.handleMessage(ev.data)
    ws.onerror = () => ws.close()
    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      const reason = ev.reason || `close(${ev.code})`
      this.events.onClose?.(reason)
      this.rejectAll(reason)
      if (!this.userClosed && this.url) this.scheduleReconnect()
    }
  }

  private cleanup() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private scheduleReconnect() {
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.open(), delay)
  }

  private waitOpen(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const tick = () => {
        if (this.isOpen) return resolve()
        if (Date.now() - started > timeoutMs) return reject(new Error('timeout connecting to proxy'))
        setTimeout(tick, 50)
      }
      tick()
    })
  }

  private handleMessage(data: unknown) {
    let msg: ProxyMessage
    try {
      msg = JSON.parse(String(data)) as ProxyMessage
    } catch {
      console.warn('[gateway] mensaje no JSON', data)
      return
    }
    if (msg.type === 'result') {
      this.resolvePending(msg)
    }
    this.events.onMessage?.(msg)
  }

  private resolvePending(msg: ResultEnvelope) {
    let requestId = msg.requestId === undefined || msg.requestId === null ? undefined : String(msg.requestId)
    if (requestId === undefined) {
      const ids = this.pendingByAction.get(msg.action)
      requestId = ids?.shift()
      if (ids && !ids.length) this.pendingByAction.delete(msg.action)
    } else {
      const ids = this.pendingByAction.get(msg.action)
      if (ids) {
        const index = ids.indexOf(requestId)
        if (index >= 0) ids.splice(index, 1)
        if (!ids.length) this.pendingByAction.delete(msg.action)
      }
    }
    if (!requestId) return
    const req = this.pending.get(requestId)
    if (!req) return
    this.pending.delete(requestId)
    req.resolve(msg)
  }

  private rejectAll(reason: string) {
    for (const [, req] of this.pending) {
      req.resolve({ type: 'result', action: req.action, requestId: req.id, ok: false, error: reason, data: undefined })
    }
    this.pending.clear()
    this.pendingByAction.clear()
  }

  /** Envía una acción y resuelve con el result del proxy (emparejado por requestId). */
  send<T = unknown>(action: string, args: Record<string, unknown> = {}): Promise<ResultEnvelope & { data?: T }> {
    if (!this.isOpen) return Promise.resolve({ type: 'result', action, ok: false, error: 'not connected', errorCode: 'NOT_CONNECTED', data: undefined })
    const id = String(this.seq++)
    return new Promise<ResultEnvelope & { data?: T }>((resolve) => {
      this.pending.set(id, { id, action, resolve: resolve as PendingRequest['resolve'] })
      const ids = this.pendingByAction.get(action) ?? []
      ids.push(id)
      this.pendingByAction.set(action, ids)
      this.ws?.send(JSON.stringify({ requestId: id, action, args }))
    })
  }

  close() {
    this.userClosed = true
    this.cleanup()
    this.ws?.close()
    this.ws = null
    this.rejectAll('disconnected')
  }
}

/** Tipos de evento que el store debe interpretar. */
export function isEvent(msg: ProxyMessage): msg is EventEnvelope {
  return msg.type === 'event'
}

export function isLobby(msg: ProxyMessage): msg is LobbyEnvelope {
  return msg.type === 'lobby'
}
