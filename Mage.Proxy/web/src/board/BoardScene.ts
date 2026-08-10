import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { CardView, GameView, PlayerView } from '../net/types'
import { awaitImageUrl, cardName, CARD_H, CARD_W } from '../cards/cardImages'
import { buildPlacements, type Placement } from './gameToScene'
import { computeZones } from './zones'

export class BoardScene {
  readonly app: Application
  private root = new Container()
  private dynamic = new Container()
  private fx = new Container()
  private lines = new Graphics()
  private overlay = new Container()
  private textures = new Map<string, Texture>()
  private liveCards = new Map<string, { holder: Container; overlays: Container; faceDown: boolean; signature: string; scale: number; sourceId: string }>()
  private targetIds = new Set<string>()
  private targetHandler: ((id: string) => void) | undefined
  private targetSourceId: string | undefined
  private playableIds = new Set<string>()
  private playableHandler: ((id: string) => void) | undefined
  private pulses = new Map<string, Graphics>()
  private playerHits = new Map<string, Graphics>()
  private hoveredTargetId: string | undefined
  private pulseStart = 0
  private zones = computeZones(1600, 900)
  private game: GameView | null = null
  // throttling de render: la partida IA emite varios GAME_UPDATE por segundo con
  // el GameView completo; reconstruir el escenario en cada uno congela la pestaña
  // en GPUs débiles. Se renderiza como mucho cada ~80ms (≈12 fps) acumulando
  // el último snapshot.
  private readonly RENDER_INTERVAL_MS = 80
  private pendingGame: GameView | null = null
  private lastRenderAt = 0
  private renderScheduled = false
  private fxTicker = () => this.drawTargetFx()

  constructor(app: Application) {
    this.app = app
    app.stage.addChild(this.root)
    this.root.addChild(this.dynamic)
    this.fx.addChild(this.lines)
    this.root.addChild(this.fx)
    this.root.addChild(this.overlay)
  }

  resize(w: number, h: number) {
    // el observer puede dispararse después de destruir la app (unmount) o al remontar
    if (!this.app.renderer) return
    this.app.renderer.resize(w, h)
    this.zones = computeZones(w, h)
    if (this.game) this.render(this.game)
  }

  setGame(game: GameView) {
    this.game = game
    const now = performance.now()
    if (this.renderScheduled) {
      this.pendingGame = game
      return
    }
    if (now - this.lastRenderAt >= this.RENDER_INTERVAL_MS) {
      this.render(game)
    } else {
      this.pendingGame = game
      this.renderScheduled = true
      const remaining = this.RENDER_INTERVAL_MS - (now - this.lastRenderAt)
      setTimeout(() => this.flushRender(), remaining)
    }
  }

  setTargeting(ids: string[], handler?: (id: string) => void, sourceId?: string) {
    this.targetIds = new Set(ids)
    this.targetHandler = handler
    this.targetSourceId = sourceId
    this.hoveredTargetId = undefined
    this.clearPulses()
    this.buildPlayerHits()
    if (ids.length) {
      this.pulseStart = performance.now()
      this.app.ticker.add(this.fxTicker)
    } else {
      this.app.ticker.remove(this.fxTicker)
    }
    if (this.game) this.render(this.game)
  }

  /** Hit areas invisibles sobre los objetivos de jugador (no hay holder de carta). */
  private buildPlayerHits() {
    for (const g of this.playerHits.values()) {
      if (!g.destroyed) g.destroy()
    }
    this.playerHits.clear()
    if (!this.targetHandler) return
    for (const id of this.targetIds) {
      if (this.findLive(id)) continue
      const anchor = this.playerAnchor(id)
      if (!anchor) continue
      const g = new Graphics()
      g.circle(anchor.x, anchor.y, 34).fill({ color: 0xffb03a, alpha: 0.0001 })
      g.eventMode = 'static'
      g.cursor = 'pointer'
      g.on('pointertap', () => this.targetHandler?.(id))
      g.on('pointerover', () => {
        this.hoveredTargetId = id
      })
      g.on('pointerout', () => {
        this.hoveredTargetId = undefined
      })
      this.fx.addChild(g)
      this.playerHits.set(id, g)
    }
  }

  setPlayable(ids: string[], handler?: (id: string) => void) {
    this.playableIds = new Set(ids)
    this.playableHandler = handler
    if (this.game) this.render(this.game)
  }

  private flushRender() {
    this.renderScheduled = false
    const game = this.pendingGame ?? this.game
    this.pendingGame = null
    if (game) this.render(game)
  }

  /** Dibuja (cada frame del ticker) los efectos del targeting: outlines pulsantes,
   *  líneas punteadas del origen a cada objetivo y aros sobre objetivos de jugador. */
  private drawTargetFx() {
    if (!this.game || this.targetIds.size === 0) return
    const t = (performance.now() - this.pulseStart) / 1000
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2)
    const dashOffset = (t * 70) % 17
    this.lines.clear()
    const source = this.targetSourceId ? this.findLive(this.targetSourceId) : undefined
    const from = source && !source.holder.destroyed ? source.holder.position : null
    if (from) {
      for (const id of this.targetIds) {
        const to = this.targetAnchor(id)
        if (!to) continue
        const hovered = this.hoveredTargetId === id
        drawDashedLine(this.lines, from.x, from.y, to.x, to.y, 10, 7, dashOffset, hovered ? 1 : 0.35 + 0.35 * pulse, hovered ? 0xffffff : 0xffb03a, hovered ? 3 : 2)
      }
    }
    for (const id of this.targetIds) {
      if (this.findLive(id)) continue
      const anchor = this.playerAnchor(id)
      if (!anchor) continue
      const hovered = this.hoveredTargetId === id
      this.lines
        .circle(anchor.x, anchor.y, 26 + 5 * pulse)
        .stroke({ width: hovered ? 4 : 3, color: 0xffb03a, alpha: hovered ? 1 : 0.5 + 0.4 * pulse })
    }
    for (const id of this.targetIds) {
      const live = this.findLive(id)
      if (!live || live.holder.destroyed) continue
      let g = this.pulses.get(id)
      if (!g || g.destroyed) {
        g = new Graphics()
        g.eventMode = 'none'
        this.pulses.set(id, g)
        live.holder.addChild(g)
      }
      const cw = CARD_W * live.scale
      const ch = CARD_H * live.scale
      const hovered = this.hoveredTargetId === id
      const alpha = hovered ? 1 : 0.45 + 0.55 * pulse
      g.clear()
      g.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({ width: hovered ? 5 : 2 + 2 * pulse, color: 0xffb03a, alpha })
      if (hovered) g.roundRect(4, 4, cw - 8, ch - 8, 6).stroke({ width: 2, color: 0xffdf8a, alpha: 0.9 })
    }
  }

  private clearPulses() {
    this.app.ticker.remove(this.fxTicker)
    this.lines.clear()
    for (const g of this.pulses.values()) {
      if (!g.destroyed) g.destroy()
    }
    this.pulses.clear()
  }

  private findLive(sourceId: string) {
    for (const live of this.liveCards.values()) {
      if (live.sourceId === sourceId && !live.holder.destroyed) return live
    }
    return undefined
  }

  /** Centro en coordenadas de escena de un objetivo (carta o jugador). */
  private targetAnchor(id: string): { x: number; y: number } | null {
    const live = this.findLive(id)
    if (live) return { x: live.holder.position.x, y: live.holder.position.y }
    return this.playerAnchor(id)
  }

  private playerAnchor(playerId: string): { x: number; y: number } | null {
    const players = this.game?.players ?? []
    const player = players.find((p) => p.playerId === playerId)
    if (!player) return null
    if (player.controlled) return { x: this.zones.myHeader.x + 8, y: this.zones.myHeader.y - 4 }
    const opponents = players.filter((p) => !p.controlled)
    const index = opponents.indexOf(player)
    return { x: this.zones.oppHeader.x + 8, y: this.zones.oppHeader.y + index * 24 - 4 }
  }

  private render(game: GameView) {
    // la app puede destruirse (unmount) con un render pendiente del throttling
    if (!this.app.renderer) return
    this.lastRenderAt = performance.now()
    this.overlay.removeChildren()
    const placements = buildPlacements(game, this.zones)
    const seen = new Set<string>()
    for (const p of placements) {
      seen.add(p.id)
      const signature = cardSignature(p.card)
      const live = this.liveCards.get(p.id)
      if (!live || live.faceDown !== p.faceDown || live.signature !== signature || live.scale !== p.scale) {
        if (live) {
          live.holder.destroy({ children: true })
          this.liveCards.delete(p.id)
        }
        void this.spawnCard(p, this.dynamic)
      } else {
        live.holder.position.set(p.x, p.y)
        live.holder.rotation = p.rotation
        this.renderOverlays(p, CARD_W * p.scale, CARD_H * p.scale, live.overlays)
        this.updateInteractivity(live.holder, p.sourceId)
      }
    }
    for (const [id, live] of this.liveCards) {
      if (!seen.has(id)) {
        live.holder.destroy({ children: true })
        this.liveCards.delete(id)
      }
    }
    this.renderHeaders(game)
  }

  private async spawnCard(p: Placement, parent: Container) {
    const cw = CARD_W * p.scale
    const ch = CARD_H * p.scale
    const holder = new Container()
    holder.position.set(p.x, p.y)
    holder.pivot.set(cw / 2, ch / 2)
    holder.rotation = p.rotation
    parent.addChild(holder)
    const overlays = new Container()
    const live = { holder, overlays, faceDown: p.faceDown, signature: cardSignature(p.card), scale: p.scale, sourceId: p.sourceId }
    this.liveCards.set(p.id, live)
    this.updateInteractivity(holder, p.sourceId)

    if (p.faceDown) {
      holder.addChild(this.backSprite(cw, ch))
      return
    }

    const placeholder = this.placeholder(p, cw, ch)
    holder.addChild(placeholder)
    holder.addChild(overlays)
    this.renderOverlays(p, cw, ch, overlays)
    const tex = await this.resolveTexture(p.card)
    if (this.liveCards.get(p.id) !== live || holder.destroyed) return
      if (tex) {
        holder.removeChild(placeholder)
        holder.addChild(this.makeSprite(tex, cw, ch))
      }
  }

  private async resolveTexture(card: CardView): Promise<Texture | null> {
    const url = await awaitImageUrl(card)
    if (!url) return null
    const cached = this.textures.get(url)
    if (cached) return cached
    const tex = await Assets.load(url)
    this.textures.set(url, tex)
    return tex
  }

  private makeSprite(tex: Texture, cw: number, ch: number): Sprite {
    const s = new Sprite(tex)
    s.width = cw
    s.height = ch
    return s
  }

  private backSprite(cw: number, ch: number): Graphics {
    const g = new Graphics()
    g.roundRect(0, 0, cw, ch, 8).fill(0x2a2f4a)
    g.roundRect(3, 3, cw - 6, ch - 6, 6).stroke({ width: 2, color: 0x7c5cff })
    g.circle(cw / 2, ch / 2, Math.min(cw, ch) * 0.22).fill(0x7c5cff)
    g.circle(cw / 2, ch / 2, Math.min(cw, ch) * 0.16).fill(0x2a2f4a)
    return g
  }

  private placeholder(p: Placement, cw: number, ch: number): Container {
    const box = new Container()
    const bg = new Graphics()
    bg.roundRect(0, 0, cw, ch, 8).fill(0x232a45)
    bg.roundRect(0, 0, cw, ch, 8).stroke({ width: 1, color: 0x3a4168 })
    box.addChild(bg)
    const name = new Text({
      text: cardName(p.card),
      style: { fontSize: Math.max(10, 13 * p.scale), fill: 0xe8eaf6, wordWrap: true, wordWrapWidth: cw - 12, align: 'center' },
    })
    name.position.set(6, 6)
    box.addChild(name)
    return box
  }

  private renderOverlays(p: Placement, cw: number, ch: number, overlays: Container) {
    overlays.removeChildren()
    if (this.playableIds.has(p.sourceId)) {
      const playable = new Graphics()
      playable.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({ width: 3, color: 0x63e6be, alpha: 0.9 })
      overlays.addChild(playable)
    }
    const isPermanent = p.group.endsWith('Battle')
    if (isPermanent && p.card.power && p.card.toughness) {
      const pt = new Text({
        text: `${p.card.power}/${p.card.toughness}`,
        style: { fontSize: 15, fill: 0xffffff, stroke: { color: 0x000000, width: 3 }, fontWeight: '700' },
      })
      pt.position.set(cw - pt.width - 6, ch - pt.height - 4)
      overlays.addChild(pt)
    }
    const counters = p.card.counters ?? []
    if (counters.length) {
      const total = counters.reduce((a, c) => a + c.count, 0)
      const badge = new Text({
        text: `+${total}`,
        style: { fontSize: 13, fill: 0xffb03a, stroke: { color: 0x000000, width: 3 }, fontWeight: '700' },
      })
      badge.position.set(6, ch - badge.height - 4)
      overlays.addChild(badge)
    }
    if (p.damage > 0) {
      const dmg = new Text({
        text: `${p.damage}`,
        style: { fontSize: 16, fill: 0xff5c6c, stroke: { color: 0x000000, width: 3 }, fontWeight: '800' },
      })
      dmg.position.set(cw / 2 - 8, ch / 2 - 12)
      overlays.addChild(dmg)
    }
  }

  private updateInteractivity(holder: Container, id: string) {
    holder.removeAllListeners('pointertap')
    holder.removeAllListeners('pointerover')
    holder.removeAllListeners('pointerout')
    if (this.targetIds.has(id) && this.targetHandler) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointertap', () => this.targetHandler?.(id))
      holder.on('pointerover', () => {
        this.hoveredTargetId = id
      })
      holder.on('pointerout', () => {
        this.hoveredTargetId = undefined
      })
    } else if (this.playableIds.has(id) && this.playableHandler) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointertap', () => this.playableHandler?.(id))
    } else {
      holder.eventMode = 'none'
      holder.cursor = 'default'
    }
  }

  private renderHeaders(game: GameView) {
    const me = game.players?.find((p) => p.controlled)
    const opps = game.players?.filter((p) => !p.controlled) ?? []
    if (me) this.header(me, this.zones.myHeader, true)
    opps.forEach((opp, index) => this.header(opp, { x: this.zones.oppHeader.x, y: this.zones.oppHeader.y + index * 24 }, false))

    const stackCount = Object.keys(game.stack ?? {}).length
    const phase = new Text({
      text: `Turno ${game.turn} · ${game.phase} · ${game.step}${stackCount ? ` · stack: ${stackCount}` : ''}`,
      style: { fontSize: 13, fill: 0x9aa1c0 },
    })
    phase.anchor.set(0.5, 0)
    phase.position.set(this.zones.w / 2, this.zones.h / 2 + 26)
    this.overlay.addChild(phase)
  }

  private header(p: PlayerView, pos: { x: number; y: number }, isMine: boolean) {
    const mana = p.manaPool
    const manaStr = [
      mana.white ? `W${mana.white}` : '',
      mana.blue ? `U${mana.blue}` : '',
      mana.black ? `B${mana.black}` : '',
      mana.red ? `R${mana.red}` : '',
      mana.green ? `G${mana.green}` : '',
      mana.colorless ? `C${mana.colorless}` : '',
    ]
      .filter(Boolean)
      .join(' ')
    const text = new Text({
      text: `${p.name} — ${p.life} v${manaStr ? ` · ${manaStr}` : ''}${p.hasPriority ? ' ·◄ prioridad' : ''}`,
      style: {
        fontSize: isMine ? 16 : 13,
        fill: p.hasPriority ? 0xffb03a : 0xe8eaf6,
        fontWeight: '600',
      },
    })
    text.position.set(pos.x, pos.y)
    this.overlay.addChild(text)

    const counts = new Text({
      text: `mano ${p.handCount} · librería ${p.libraryCount}`,
      style: { fontSize: 12, fill: 0x9aa1c0 },
    })
    counts.position.set(pos.x + 240, pos.y + 2)
    this.overlay.addChild(counts)
  }
}

function cardSignature(card: CardView): string {
  return [card.name, card.expansionSetCode, card.cardNumber, card.faceDown ? 'down' : 'up'].join('|')
}

/** Línea punteada con desplazamiento de guiones (dashOffset) para el efecto "fluyente". */
function drawDashedLine(
  g: Graphics,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  dash: number,
  gap: number,
  offset: number,
  alpha: number,
  color: number,
  width: number,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return
  const ux = dx / len
  const uy = dy / len
  const period = dash + gap
  let start = offset % period
  if (start < 0) start += period
  let covered = -start
  while (covered < len) {
    const from = Math.max(covered, 0)
    const to = Math.min(covered + dash, len)
    if (to > from) {
      g.moveTo(x1 + ux * from, y1 + uy * from)
      g.lineTo(x1 + ux * to, y1 + uy * to)
    }
    covered += period
  }
  g.stroke({ width, color, alpha })
}

/** ¿Hay soporte WebGL2? Pixi 8 lo exige (o WebGPU). Detección barata antes de init. */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
    return !!gl
  } catch {
    return false
  }
}

/**
 * Crea el escenario con protecciones: timeout de init (una GPU colgada no debe
 * congelar la pestaña) y rechazo tipado si no hay renderizador disponible.
 */
export async function createBoardScene(): Promise<BoardScene> {
  if (!hasWebGL2()) {
    throw new Error('WebGL2 no está disponible en este navegador (bloqueado por la GPU o desactivado). Activa la aceleración por hardware e inténtalo de nuevo.')
  }
  const app = new Application()
  const initPromise = app.init({
    background: 0x0f1220,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('el renderizador no respondió (GPU colgada o sin aceleración por hardware)')), 8000)
  })
  await Promise.race([initPromise, timeout])
  const scene = new BoardScene(app)
  return scene
}
