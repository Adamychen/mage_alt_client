import { describe, it, expect } from 'vitest'
import { eventSchema, gameViewFromAndValidate, validateMessage } from './schema'
import { fullFlowScenario, type FullFlowOptions } from './scenarios/fullFlow'
import type { FakeConn } from './fake'

class Recorder implements FakeConn {
  readonly id = 1
  emitted: unknown[] = []
  event(method: string, data: unknown, objectId?: string | null): void {
    this.emitted.push({ type: 'event', method, messageId: this.emitted.length + 1, objectId, data })
  }
  ok(): void {}
  fail(): void {}
  lobby(): void {}
  raw(obj: unknown): void {
    this.emitted.push(obj)
  }
  isOpen(): boolean {
    return true
  }
  close(): void {}
}

async function driveScenario(opts: FullFlowOptions = {}) {
  const rec = new Recorder()
  const scenario = fullFlowScenario(opts)
  scenario.onConnect?.(rec)
  const cleanup = scenario.onStart?.(rec)
  scenario.onAction?.(rec, 'watchGame', {}, 1)
  // dejar que el timeline (updateMs) emita algunos updates antes de leer
  await new Promise((r) => setTimeout(r, 25))
  cleanup?.()
  return { rec }
}

describe('schema del contrato (anti-deriva)', () => {
  it('valida los envelopes del proxy', () => {
    expect(validateMessage({ type: 'connected', message: 'hi' }).ok).toBe(true)
    expect(validateMessage({ type: 'result', action: 'connect', requestId: 1, ok: true }).ok).toBe(true)
    expect(validateMessage({ type: 'event', method: 'GAME_SELECT', messageId: 3, objectId: 'g1' }).ok).toBe(true)
    expect(validateMessage({ type: 'lobby', roomId: 'r', tables: [], users: {}, serverMessages: [] }).ok).toBe(true)
  })

  it('rechaza envelopes malformados (tampering de deriva)', () => {
    expect(validateMessage({ type: 'result', ok: 'yes' }).ok).toBe(false)
    expect(validateMessage({ type: 'event', method: 'GAME_SELECT' }).ok).toBe(false) // falta messageId
    expect(validateMessage({ type: 'lobby', tables: 'nope' }).ok).toBe(false)
    expect(validateMessage(null).ok).toBe(false)
    expect(validateMessage({ type: 'unknown', x: 1 }).ok).toBe(false)
  })

  it('los eventos del FixtureServer pasan la validación', async () => {
    const { rec } = await driveScenario({ updateMs: 5, maxUpdates: 5 })
    const events = rec.emitted.filter((e) => (e as { type?: string }).type === 'event')
    expect(events.length).toBeGreaterThan(0)
    for (const ev of events) {
      const parsed = eventSchema.safeParse(ev)
      expect(parsed.success, `evento no válido: ${JSON.stringify(ev).slice(0, 140)}`).toBe(true)
    }
  })

  it('los GameView del escenario pasan la validación de vista', async () => {
    const { rec } = await driveScenario({ updateMs: 5, maxUpdates: 3 })
    const events = rec.emitted.filter((e) => (e as { type?: string }).type === 'event') as Array<{
      method: string
      data: unknown
    }>
    for (const ev of events) {
      if (ev.method === 'GAME_INIT' || ev.method === 'GAME_UPDATE' || ev.method === 'GAME_UPDATE_AND_INFORM') {
        const res = gameViewFromAndValidate(ev.data)
        expect(res.ok, `${ev.method} inválido: ${JSON.stringify(res.errors)}`).toBe(true)
      }
    }
  })

  it('rechaza un GameView sin turno (deriva de protocolo)', () => {
    const res = gameViewFromAndValidate({ gameView: { phase: 'MAIN', step: 'PRECOMBAT_MAIN' } })
    expect(res.ok).toBe(false)
  })
})
