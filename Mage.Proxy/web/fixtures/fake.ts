/**
 * FixtureServer: implementación determinista del contrato WS del proxy
 * (Mage.Proxy) para los E2E de navegador. Escucha en el MISMO puerto que el
 * proxy (8787) y responde a las acciones de commands.ts con envelopes
 * {type:'result'} y emite callbacks {type:'event'} según un escenario
 * declarativo. Nada de Java, nada de timing real: los tests de UI corren en
 * segundos y son reproducibles al 100%.
 * Tipado contra src/net/types.ts (el typecheck valida la coherencia fake↔cliente).
 */

import { WebSocketServer, WebSocket } from 'ws'
import type { RoomUsersView, TableView, UserView } from '../src/net/types'

let nextConnId = 1

export interface FakeConn {
  readonly id: number
  /** Callback del servidor (type:'event'); messageId autoincremental. */
  event(method: string, data: unknown, objectId?: string | null): void
  /** Respuesta a una acción (type:'result'). */
  ok(requestId: string | number, action: string, data?: unknown): void
  fail(requestId: string | number, action: string, error: string, errorCode?: string): void
  /** Broadcast del lobby (type:'lobby'). */
  lobby(tables: TableView[], users?: UserView[]): void
  raw(obj: unknown): void
  isOpen(): boolean
  close(): void
}

export interface Scenario {
  /** Handler por acción recibida del cliente. Si no llama a ok/fail, el core
   *  responde ok con el default (ver DEFAULT_RESULTS). */
  onAction?(
    conn: FakeConn,
    action: string,
    args: Record<string, unknown>,
    requestId: string | number,
  ): void
  /** Al abrir la conexión (el proxy real manda 'connected' + 'info'). */
  onConnect?(conn: FakeConn): void
  /** Timers del escenario (broadcasts de lobby, updates de partida...). */
  onStart?(conn: FakeConn): (() => void) | void
}

export const DEFAULT_RESULTS: Record<string, unknown> = {
  getGameTypes: [
    { name: 'Two Player Duel', minPlayers: 2, maxPlayers: 2 },
    { name: 'Three Player', minPlayers: 3, maxPlayers: 3 },
    { name: 'Four Player', minPlayers: 4, maxPlayers: 4 },
  ],
  getPlayerTypes: ['HUMAN', 'SIM', 'COMPUTER_MAD'],
  getDeckTypes: ['Constructed - Modern'],
}

class FakeConnection implements FakeConn {
  private seq = 0
  constructor(
    readonly id: number,
    private readonly ws: WebSocket,
    private readonly scenario: Scenario,
  ) {}

  isOpen(): boolean {
    return this.ws.readyState === WebSocket.OPEN
  }

  raw(obj: unknown): void {
    if (this.isOpen()) this.ws.send(JSON.stringify(obj))
  }

  event(method: string, data: unknown, objectId: string | null = null): void {
    this.raw({ type: 'event', method, messageId: ++this.seq, objectId, data })
  }

  ok(requestId: string | number, action: string, data?: unknown): void {
    this.raw({ type: 'result', action, requestId, ok: true, data })
  }

  fail(requestId: string | number, action: string, error: string, errorCode?: string): void {
    this.raw({ type: 'result', action, requestId, ok: false, error, errorCode })
  }

  lobby(tables: TableView[], users: UserView[] = []): void {
    const usersView: RoomUsersView = {
      numberActiveGames: 0,
      numberGameThreads: 0,
      numberMaxGames: 10,
      usersView: users,
    }
    this.raw({ type: 'lobby', roomId: 'room-fake', tables, users: usersView, serverMessages: [] })
  }

  close(): void {
    this.ws.close()
  }
}

export class FakeServer {
  private wss: WebSocketServer
  private conns = new Set<FakeConnection>()
  private cleanups: (() => void)[] = []

  constructor(readonly port: number, private readonly makeScenario: () => Scenario) {}

  static async start(port: number, makeScenario: () => Scenario): Promise<FakeServer> {
    const server = new FakeServer(port, makeScenario)
    await server.listen()
    return server
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port })
      this.wss.on('error', reject)
      this.wss.on('listening', () => {
        this.wss.removeListener('error', reject)
        this.wss.on('error', (err) => {
          console.error(`[fake] error del servidor (puerto ${this.port}): ${err.message}`)
        })
        resolve()
      })
      this.wss.on('connection', (ws) => {
        this.handleConnection(ws)
      })
    })
  }

  private handleConnection(ws: WebSocket) {
    const scenario = this.makeScenario()
    const conn = new FakeConnection(nextConnId++, ws, scenario)
    this.conns.add(conn)
    ws.on('close', () => {
      this.conns.delete(conn)
    })
    ws.on('error', () => {
      this.conns.delete(conn)
    })
    scenario.onConnect?.(conn)
    const cleanup = scenario.onStart?.(conn)
    if (cleanup) {
      this.cleanups.push(cleanup)
      ws.on('close', () => {
        const i = this.cleanups.indexOf(cleanup)
        if (i >= 0) this.cleanups.splice(i, 1)
        cleanup()
      })
    }
    ws.on('message', (raw: Buffer) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>
      } catch {
        return
      }
      const action = String(msg.action ?? '')
      const requestId = msg.requestId ?? null
      const args = ((msg.args ?? {}) as Record<string, unknown>) ?? {}
      let answered = false
      const respond = () => {
        if (answered) return
        answered = true
        conn.ok(requestId, action, DEFAULT_RESULTS[action])
      }
      try {
        scenario.onAction?.(conn, action, args, requestId)
      } catch (err) {
        console.error(`[fake] handler de "${action}" falló: ${(err as Error).message}`)
        conn.fail(requestId, action, `fixture error: ${(err as Error).message}`)
        return
      }
      // si el escenario no respondió a la acción, el core responde ok genérico
      respond()
    })
  }

  get connectedConns(): number {
    return this.conns.size
  }

  async stop(): Promise<void> {
    for (const cleanup of this.cleanups) {
      try {
        cleanup()
      } catch {
        // el escenario puede ya no tener recursos que limpiar
      }
    }
    this.cleanups = []
    for (const c of [...this.conns]) c.close()
    this.conns.clear()
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 500)
      this.wss.close(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
}
