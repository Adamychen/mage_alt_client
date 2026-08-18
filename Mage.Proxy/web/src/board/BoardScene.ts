import { Application, Assets, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { CardView, GameView } from '../net/types'
import { awaitImageUrl, cardName, CARD_H, CARD_W } from '../cards/cardImages'
import { buildPlacements, type Placement } from './gameToScene'
import { computeZones } from './zones'

const BASIC_LANDS = ['Mountain', 'Plains', 'Island', 'Swamp', 'Forest']

// Hover/tween state for smooth animations
interface LiveCardData {
  holder: Container
  overlays: Container
  faceDown: boolean
  signature: string
  scale: number
  sourceId: string
  // Tween state for hover animation
  targetScale: number
  currentScale: number
  hovered: boolean
}

interface Tween {
  id: string
  target: Container
  props: Record<string, { from: number; to: number }>
  duration: number
  elapsed: number
  easing: (t: number) => number
  onComplete?: () => void
  killed?: boolean
}

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3) }

export class BoardScene {
  readonly app: Application
  private root = new Container()
  private dynamic = new Container()
  private fx = new Container()
  private lines = new Graphics()
  private overlay = new Container()
  private textures = new Map<string, Texture>()
  private liveCards = new Map<string, LiveCardData>()
  // Tween ticker — runs independently of targeting fx
  private tweenTicker: () => void

  private targetIds = new Set<string>()
  private chosenTargetIds = new Set<string>()
  private targetHandler: ((id: string) => void) | undefined
  private targetSourceId: string | undefined
  private playableIds = new Set<string>()
  private playableHandler: ((id: string) => void) | undefined
  private combatSelectable = new Set<string>()
  private combatChosen = new Set<string>()
  private combatSelectHandler: ((id: string) => void) | undefined
  private combatMode: 'attack' | 'block' | null = null
  private pulses = new Map<string, Graphics>()
  private chosenBadges = new Map<string, Text>()
  private playerHits = new Map<string, Graphics>()
  private hoveredTargetId: string | undefined
  private hoveredCardId: string | null = null
  private pulseStart = 0
  private zones = computeZones(800, 600)
  private game: GameView | null = null
  private readonly RENDER_INTERVAL_MS = 80
  private pendingGame: GameView | null = null
  private lastRenderAt = 0
  private renderScheduled = false
  private fxTicker = () => this.drawTargetFx()
  private tweens: Tween[] = []
  private previousGame: GameView | null = null
  private animatingCardIds = new Set<string>()

  constructor(app: Application) {
    this.app = app
    app.stage.addChild(this.root)
    this.root.addChild(this.dynamic)
    this.fx.addChild(this.lines)
    this.root.addChild(this.fx)
    this.root.addChild(this.overlay)
    // Tween ticker — smoothly animates hover scale every frame
    this.tweenTicker = () => {
      const dt = this.app.ticker.deltaMS
      this.processTweens(dt)
      for (const live of this.liveCards.values()) {
        const diff = live.targetScale - live.currentScale
        if (Math.abs(diff) < 0.001) {
          live.currentScale = live.targetScale
        } else {
          live.currentScale += diff * 0.18
        }
        const s = live.currentScale
        if (s !== 1 || live.hovered) {
          live.holder.scale.set(s, s)
        } else {
          live.holder.scale.set(1, 1)
        }
      }
    }
    this.app.ticker.add(this.tweenTicker)
  }

  private addTween(tween: Tween) {
    this.tweens.push(tween)
  }

  private killTweensByTarget(target: Container) {
    for (const tw of this.tweens) {
      if (tw.target === target) tw.killed = true
    }
  }

  private processTweens(dt: number) {
    const dtSec = dt / 1000
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]
      if (tw.killed) { this.tweens.splice(i, 1); continue }
      tw.elapsed += dtSec
      const progress = Math.min(tw.elapsed / tw.duration, 1)
      const eased = tw.easing(progress)
      for (const [prop, { from, to }] of Object.entries(tw.props)) {
        const value = from + (to - from) * eased
        if (prop === 'x') tw.target.position.x = value
        else if (prop === 'y') tw.target.position.y = value
        else if (prop === 'alpha') tw.target.alpha = value
        else if (prop === 'scaleX') tw.target.scale.x = value
        else if (prop === 'scaleY') tw.target.scale.y = value
        else if (prop === 'scale') { tw.target.scale.set(value, value) }
      }
      if (progress >= 1) {
        tw.onComplete?.()
        this.tweens.splice(i, 1)
      }
    }
  }

  animateCardMovement(
    cardId: string,
    fromX: number, fromY: number,
    toX: number, toY: number,
    duration: number = 0.35,
    onComplete?: () => void
  ) {
    const live = this.liveCards.get(cardId)
    if (!live) { onComplete?.(); return }
    this.animatingCardIds.add(cardId)
    live.holder.position.set(fromX, fromY)
    this.killTweensByTarget(live.holder)
    this.addTween({
      id: `move:${cardId}`,
      target: live.holder,
      props: { x: { from: fromX, to: toX }, y: { from: fromY, to: toY } },
      duration,
      elapsed: 0,
      easing: easeOutCubic,
      onComplete: () => {
        this.animatingCardIds.delete(cardId)
        onComplete?.()
      }
    })
  }

  resize(w: number, h: number) {
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

  setTargeting(ids: string[], handler?: (id: string) => void, sourceId?: string, chosenIds?: string[]) {
    this.targetIds = new Set(ids)
    this.chosenTargetIds = new Set(chosenIds ?? [])
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
      g.on('pointerover', () => { this.hoveredTargetId = id })
      g.on('pointerout', () => { this.hoveredTargetId = undefined })
      this.fx.addChild(g)
      this.playerHits.set(id, g)
    }
  }

  setPlayable(ids: string[], handler?: (id: string) => void) {
    this.playableIds = new Set(ids)
    this.playableHandler = handler
    this.publishSceneState()
    if (this.game) this.render(this.game)
  }

  setCombatSelect(ids: string[], chosen: string[], handler?: (id: string) => void, mode: 'attack' | 'block' | null = null) {
    this.combatSelectable = new Set(ids)
    this.combatChosen = new Set(chosen)
    this.combatSelectHandler = handler
    this.combatMode = ids.length > 0 ? (mode ?? 'attack') : null
    this.publishSceneState()
    if (this.game) this.render(this.game)
  }

  private flushRender() {
    this.renderScheduled = false
    const game = this.pendingGame ?? this.game
    this.pendingGame = null
    if (game) this.render(game)
  }

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
        const chosen = this.chosenTargetIds.has(id)
        if (chosen) {
          drawDashedLine(this.lines, from.x, from.y, to.x, to.y, 10, 7, dashOffset, 0.95, 0x7ee787, 2)
        } else {
          drawDashedLine(this.lines, from.x, from.y, to.x, to.y, 10, 7, dashOffset, hovered ? 1 : 0.35 + 0.35 * pulse, hovered ? 0xffffff : 0xffb03a, hovered ? 3 : 2)
        }
      }
    }
    for (const id of this.targetIds) {
      if (this.findLive(id)) continue
      const anchor = this.playerAnchor(id)
      if (!anchor) continue
      const hovered = this.hoveredTargetId === id
      const chosen = this.chosenTargetIds.has(id)
      if (chosen) {
        this.lines.circle(anchor.x, anchor.y, 26 + 5 * pulse).stroke({ width: 3, color: 0x7ee787, alpha: 0.95 })
      } else {
        this.lines.circle(anchor.x, anchor.y, 26 + 5 * pulse).stroke({ width: hovered ? 4 : 3, color: 0xffb03a, alpha: hovered ? 1 : 0.5 + 0.4 * pulse })
      }
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
      const chosen = this.chosenTargetIds.has(id)
      const alpha = hovered ? 1 : 0.45 + 0.55 * pulse
      g.clear()
      if (chosen) {
        g.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({ width: 3, color: 0x7ee787, alpha: 0.95 })
      } else {
        g.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({ width: hovered ? 5 : 2 + 2 * pulse, color: 0xffb03a, alpha })
      }
      if (hovered) g.roundRect(4, 4, cw - 8, ch - 8, 6).stroke({ width: 2, color: 0xffdf8a, alpha: 0.9 })
      this.syncChosenBadge(id, live.holder, cw)
    }
    this.pruneChosenBadges()
  }

  private syncChosenBadge(id: string, holder: Container, cw: number) {
    const badge = this.chosenBadges.get(id)
    if (this.chosenTargetIds.has(id)) {
      let b = badge
      if (!b || b.destroyed) {
        b = new Text({
          text: '✓',
          style: { fontSize: 22, fill: 0x7ee787, stroke: { color: 0x000000, width: 4 }, fontWeight: '800' },
        })
        this.chosenBadges.set(id, b)
        holder.addChild(b)
      }
      b.position.set(cw - 22, -2)
    } else if (badge && !badge.destroyed) {
      badge.destroy()
      this.chosenBadges.delete(id)
    }
  }

  private pruneChosenBadges() {
    for (const [id, badge] of this.chosenBadges) {
      if (!this.chosenTargetIds.has(id) && !badge.destroyed) {
        badge.destroy()
        this.chosenBadges.delete(id)
      }
    }
  }

  private clearPulses() {
    this.app.ticker.remove(this.fxTicker)
    this.lines.clear()
    for (const g of this.pulses.values()) {
      if (!g.destroyed) g.destroy()
    }
    this.pulses.clear()
    this.pruneChosenBadges()
  }

  private findLive(sourceId: string) {
    for (const live of this.liveCards.values()) {
      if (live.sourceId === sourceId && !live.holder.destroyed) return live
    }
    return undefined
  }

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
    if (!this.app.renderer) return
    this.lastRenderAt = performance.now()
    this.overlay.removeChildren()

    const { placements, zoneChanges } = buildPlacements(game, this.zones, this.previousGame)
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
        if (!this.animatingCardIds.has(p.id)) {
          live.holder.position.set(p.x, p.y)
        }
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
    for (const change of zoneChanges) {
      const live = this.liveCards.get(change.cardId)
      if (!live) continue
      const fromHand = change.fromZone === 'myHand'
      const toStack = change.toZone === 'stack'
      const fromStack = change.fromZone === 'stack'
      const toBattle = change.toZone === 'myBattle' || change.toZone === 'oppBattle'
      const toGraveyard = change.toZone.includes('Graveyard')
      const toExile = change.toZone.includes('Exile')
      if (fromHand && toStack) {
        this.animateCardMovement(change.cardId, change.fromX, change.fromY, change.toX, change.toY, 0.35)
      } else if (fromStack && toBattle) {
        this.animateCardMovement(change.cardId, change.fromX, change.fromY, change.toX, change.toY, 0.3)
      } else if (fromStack && (toGraveyard || toExile)) {
        const live2 = this.liveCards.get(change.cardId)
        if (live2) {
          this.animatingCardIds.add(change.cardId)
          live2.holder.position.set(change.fromX, change.fromY)
          this.killTweensByTarget(live2.holder)
          this.addTween({
            id: `move:${change.cardId}`,
            target: live2.holder,
            props: { x: { from: change.fromX, to: change.toX }, y: { from: change.fromY, to: change.toY }, alpha: { from: 1, to: 0 } },
            duration: 0.3,
            elapsed: 0,
            easing: easeOutCubic,
            onComplete: () => { this.animatingCardIds.delete(change.cardId) }
          })
        }
      }
    }
    this.publishSceneState()
    this.previousGame = game
  }

  private publishSceneState() {
    const cards: Record<string, { x: number; y: number }> = {}
    for (const [id, live] of this.liveCards) {
      const key = id.startsWith('myHand:') ? id.slice('myHand:'.length) : id
      cards[key] = { x: live.holder.position.x, y: live.holder.position.y }
    }
    const me = this.game?.players?.find((p) => p.controlled)
    ;(globalThis as unknown as { __mageScene?: unknown }).__mageScene = {
      cards,
      playable: [...this.playableIds],
      click: (id: string) => this.dispatchClick(id),
      hoveredCardId: this.hoveredCardId,
      targeting: {
        active: this.targetIds.size > 0,
        source: this.targetSourceId ?? null,
        ids: [...this.targetIds],
        chosen: [...this.chosenTargetIds],
      },
      combat: {
        active: this.combatSelectable.size > 0,
        mode: this.combatMode,
        selectable: [...this.combatSelectable],
        chosen: [...this.combatChosen],
      },
      game: this.game
        ? { turn: this.game.turn, phase: this.game.phase, step: this.game.step, priority: me?.hasPriority === true }
        : null,
    }
  }

  private async spawnCard(p: Placement, parent: Container) {
    const cw = CARD_W * p.scale
    const ch = CARD_H * p.scale
    const holder = new Container()
    holder.position.set(p.x, p.y)
    holder.pivot.set(cw / 2, ch / 2)
    holder.rotation = p.rotation
    parent.addChild(holder)

    // Shadow layer — soft drop shadow under the card
    const shadow = new Graphics()
    shadow.roundRect(0, 0, cw, ch, 12).fill({ color: 0x000000, alpha: 0.35 }).moveTo(3, 4) // offset shadow
    shadow.eventMode = 'none'
    holder.addChild(shadow)

    // Main card body with rounded corners and subtle border
    const cardBody = new Graphics()
    cardBody.roundRect(0, 0, cw, ch, 12).fill(0x1a1e35)
    cardBody.roundRect(1, 1, cw - 2, ch - 2, 11).stroke({ width: 1.5, color: 0x3a4270 })
    cardBody.eventMode = 'none'
    holder.addChild(cardBody)

    const overlays = new Container()
    // Glow layer behind card (for playable/targeting)
    const glowLayer = new Graphics()
    glowLayer.eventMode = 'none'
    holder.addChild(glowLayer)

    // Content layer — card image or face-down, placeholders
    const content = new Container()
    holder.addChild(content)

    // Overlays on top (targeting, playables, damage counters)
    holder.addChild(overlays)

    const live: LiveCardData = {
      holder, overlays, faceDown: p.faceDown, signature: cardSignature(p.card),
      scale: p.scale, sourceId: p.sourceId,
      targetScale: 1, currentScale: 0.97, hovered: false,
    }
    this.liveCards.set(p.id, live)
    this.updateInteractivity(holder, p.sourceId)

    // Animate in: scale up from below
    live.targetScale = 1

    if (p.faceDown) {
      content.addChild(this.premiumBackSprite(cw, ch))
      return
    }

    const placeholder = this.renderPlaceholder(p, cw, ch)
    content.addChild(placeholder)
    this.renderOverlays(p, cw, ch, overlays)

    const tex = await this.resolveTexture(p.card)
    if (this.liveCards.get(p.id) !== live || holder.destroyed) return
    if (tex) {
      content.removeChildren()
      const s = new Sprite(tex)
      s.width = cw
      s.height = ch
      // Clip content to rounded rect
      const clipBg = new Graphics()
      clipBg.roundRect(0, 0, cw, ch, 12).fill({ color: 0xffffff })
      content.addChild(clipBg)
      content.addChild(s)
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

  private premiumBackSprite(cw: number, ch: number): Graphics {
    const g = new Graphics()
    // Base fill — dark blue-purple gradient feel via solid + border
    g.roundRect(0, 0, cw, ch, 12).fill(0x1e2348)
    // Golden inner border
    g.roundRect(6, 6, cw - 12, ch - 12, 8).stroke({ width: 1.5, color: 0x5a6399 })
    // Outer border accent
    g.roundRect(2, 2, cw - 4, ch - 4, 10).stroke({ width: 1, color: 0x4a5288 })
    // Central emblem — diamond shape with circle inside (reminiscent of MT back)
    const cx = cw / 2
    const cy = ch / 2
    const emblemR = Math.min(cw, ch) * 0.18
    // Outer ring
    g.circle(cx, cy, emblemR).stroke({ width: 2.5, color: 0x6370b8 })
    // Inner ring
    g.circle(cx, cy, emblemR * 0.7).stroke({ width: 1.5, color: 0x4a5699 })
    // Center diamond (polygon)
    const d = emblemR * 0.45
    g.moveTo(cx, cy - d).lineTo(cx + d, cy).lineTo(cx, cy + d).lineTo(cx - d, cy).closePath()
      .fill({ color: 0x6370b8, alpha: 0.3 })
      .stroke({ width: 1.5, color: 0x6370b8 })
    // Small center circle
    g.circle(cx, cy, emblemR * 0.18).fill(0x4a5699)
    // Corner decorations — small arcs
    const arcR = Math.min(cw, ch) * 0.06
    const cornerDist = Math.min(cw, ch) * 0.28
    // Top-left
    g.moveTo(cx - cornerDist, cy - cornerDist - arcR)
    g.arc(cx - cornerDist, cy - cornerDist, arcR, 0, Math.PI / 2)
    g.stroke({ width: 1, color: 0x5a6699 })
    // Top-right
    g.moveTo(cx + cornerDist, cy - cornerDist - arcR)
    g.arc(cx + cornerDist, cy - cornerDist, arcR, Math.PI / 2, Math.PI)
    g.stroke({ width: 1, color: 0x5a6699 })
    // Bottom-left
    g.moveTo(cx - cornerDist, cy + cornerDist + arcR)
    g.arc(cx - cornerDist, cy + cornerDist, arcR, -Math.PI / 2, 0)
    g.stroke({ width: 1, color: 0x5a6699 })
    // Bottom-right
    g.moveTo(cx + cornerDist, cy + cornerDist + arcR)
    g.arc(cx + cornerDist, cy + cornerDist, arcR, Math.PI, Math.PI * 1.5)
    g.stroke({ width: 1, color: 0x5a6699 })
    return g
  }

  private renderPlaceholder(p: Placement, cw: number, ch: number): Container {
    const box = new Container()
    const bg = new Graphics()
    bg.roundRect(0, 0, cw, ch, 12).fill(0x1e2348)
    bg.roundRect(0, 0, cw, ch, 12).stroke({ width: 1.5, color: 0x3a4270 })
    box.addChild(bg)
    const name = new Text({
      text: cardName(p.card),
      style: { fontSize: Math.max(9, 11 * p.scale), fill: 0xc8cae6, wordWrap: true, wordWrapWidth: cw - 14, align: 'center' },
    })
    name.anchor.set(0.5)
    name.position.set(cw / 2, ch / 2 - 8 * p.scale)
    box.addChild(name)
    // Mana cost placeholder — colored circles at top
    const mana = manaLand(p.card)
    if (mana) {
      for (let i = 0; i < mana.length && i < 5; i++) {
        const colors: Record<string, number> = { W: 0xe8eaf6, U: 0x5c70ff, B: 0x9945cc, R: 0xff5c6c, G: 0x4cd07d, X: 0xffb03a }
        const c = colors[mana[i]] ?? 0x5a6699
        const costCircle = new Graphics()
        costCircle.circle(8 + i * 14, 16 * p.scale, 7 * p.scale).fill(c)
        costCircle.circle(8 + i * 14, 16 * p.scale, 7 * p.scale).stroke({ width: 0.8, color: 0xffffff })
        box.addChild(costCircle)
      }
    }
    return box
  }

  private renderOverlays(p: Placement, cw: number, ch: number, overlays: Container) {
    overlays.removeChildren()
    const isPermanent = p.group.endsWith('Battle')

    // Combat selectable overlay
    if (this.combatSelectable.has(p.sourceId)) {
      const selectable = new Graphics()
      const chosen = this.combatChosen.has(p.sourceId)
      selectable.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({
        width: chosen ? 4 : 3,
        color: chosen ? 0x7ee787 : 0x58a6ff,
        alpha: 0.95,
      })
      overlays.addChild(selectable)
      if (chosen) {
        const badge = new Text({
          text: '✓',
          style: { fontSize: 22, fill: 0x7ee787, stroke: { color: 0x000000, width: 4 }, fontWeight: '800' },
        })
        badge.position.set(cw - 22, -2)
        overlays.addChild(badge)
      }
    }

    // Playable overlay (green border)
    if (this.playableIds.has(p.sourceId)) {
      const playable = new Graphics()
      playable.roundRect(1, 1, cw - 2, ch - 2, 8).stroke({ width: 3, color: 0x63e6be, alpha: 0.9 })
      overlays.addChild(playable)
    }

    // Power/toughness for permanents
    if (isPermanent && p.card.power && p.card.toughness) {
      const pt = new Text({
        text: `${p.card.power}/${p.card.toughness}`,
        style: { fontSize: 14, fill: 0xffffff, stroke: { color: 0x000000, width: 3 }, fontWeight: '700' },
      })
      pt.position.set(cw - pt.width - 6, ch - pt.height - 4)
      overlays.addChild(pt)
    }

    // Counters badge
    const counters = p.card.counters ?? []
    if (counters.length) {
      const total = counters.reduce((a, c) => a + c.count, 0)
      const badge = new Text({
        text: `+${total}`,
        style: { fontSize: 12, fill: 0xffb03a, stroke: { color: 0x000000, width: 3 }, fontWeight: '700' },
      })
      badge.position.set(6, ch - badge.height - 4)
      overlays.addChild(badge)
    }

    // Damage indicator
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
    const live = this.liveCards.get(id)

    const onOver = (scale: number) => () => {
      this.hoveredCardId = id
      if (live) { live.hovered = true; live.targetScale = scale }
    }
    const onOut = () => {
      this.hoveredCardId = null
      if (live) { live.hovered = false; live.targetScale = 1 }
    }

    if (this.targetIds.has(id) && this.targetHandler) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointertap', () => this.targetHandler?.(id))
      holder.on('pointerover', onOver(1.09))
      holder.on('pointerout', onOut)
    } else if (this.combatSelectable.has(id) && this.combatSelectHandler) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointertap', () => this.combatSelectHandler?.(id))
      holder.on('pointerover', onOver(1.09))
      holder.on('pointerout', onOut)
    } else if (this.playableIds.has(id) && this.playableHandler) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointertap', () => this.playableHandler?.(id))
      holder.on('pointerover', onOver(1.09))
      holder.on('pointerout', onOut)
    } else if (id.startsWith('myHand:')) {
      holder.eventMode = 'static'
      holder.cursor = 'pointer'
      holder.on('pointerover', onOver(1.10))
      holder.on('pointerout', onOut)
    } else {
      holder.eventMode = 'static'
      holder.cursor = 'default'
      holder.on('pointerover', onOver(1.06))
      holder.on('pointerout', onOut)
    }
  }

  dispatchClick(sourceId: string): boolean {
    if (this.targetIds.has(sourceId) && this.targetHandler) {
      this.targetHandler(sourceId)
      return true
    }
    if (this.combatSelectable.has(sourceId) && this.combatSelectHandler) {
      this.combatSelectHandler(sourceId)
      return true
    }
    if (this.playableIds.has(sourceId) && this.playableHandler) {
      this.playableHandler(sourceId)
      return true
    }
    const me = this.game?.players?.find((p) => p.controlled)
    const card = this.game?.myHand?.[sourceId]
    if (
      this.playableHandler &&
      me?.isActive === true &&
      (this.game?.phase === 'PRECOMBAT_MAIN' || this.game?.phase === 'POSTCOMBAT_MAIN') &&
      card &&
      (BASIC_LANDS.includes(card.name ?? '') || BASIC_LANDS.includes(card.displayName ?? ''))
    ) {
      this.playableHandler(sourceId)
      return true
    }
    return false
  }
}

function cardSignature(card: CardView): string {
  return [card.name, card.expansionSetCode, card.cardNumber, card.faceDown ? 'down' : 'up'].join('|')
}

function manaLand(card: CardView): string {
  return (card.manaCostLeftStr ?? []).join('')
}

function drawDashedLine(
  g: Graphics, x1: number, y1: number, x2: number, y2: number,
  dash: number, gap: number, offset: number, alpha: number, color: number, width: number,
) {
  const dx = x2 - x1, dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return
  const ux = dx / len, uy = dy / len
  const period = dash + gap
  let start = offset % period
  if (start < 0) start += period
  let covered = -start
  while (covered < len) {
    const from = Math.max(covered, 0), to = Math.min(covered + dash, len)
    if (to > from) { g.moveTo(x1 + ux * from, y1 + uy * from); g.lineTo(x1 + ux * to, y1 + uy * to) }
    covered += period
  }
  g.stroke({ width, color, alpha })
}

export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false })
  } catch { return false }
}

export async function createBoardScene(): Promise<BoardScene> {
  if (!hasWebGL2()) {
    throw new Error('WebGL2 no está disponible en este navegador (bloqueado por la GPU o desactivado). Activa la aceleración por hardware e inténtalo de nuevo.')
  }
  const app = new Application()
  const initPromise = app.init({
    background: 0x12152a, // darker base
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
