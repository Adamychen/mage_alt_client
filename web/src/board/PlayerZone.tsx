import { useMemo } from 'react'
import type { CardView, CardsView, PermanentView, PlayerView } from '../net/types'
import CardSlot from './CardSlot'
import HandZone from './HandZone'
import ResourceBar from '../game/ResourceBar'
import PlayerInfoBar from '../game/PlayerInfoBar'
import CommandZone from './CommandZone'
import { useZoneScale } from './useZoneScale'
import { hasVigilance } from '../cards/cardImages'
import type { CrossZonePlayable } from './crossZone'
import './PlayerZone.css'

interface PlayerZoneProps {
  player: PlayerView | undefined
  hand?: CardsView
  onCardClick?: (id: string) => void
  onHandCardClick?: (id: string) => void
  onCardHover?: (card: any, rect?: DOMRect) => void
  targetIds?: Set<string>
  playableIds?: Set<string>
  combatSelectable?: string[]
  combatMode?: 'attack' | 'block' | null
  combatChosen?: string[]
  crossZonePlayables?: CrossZonePlayable[]
  onPlayCrossZone?: (id: string) => void
  helperEmblems?: Record<string, CardView>
}

function permanentKind(perm: PermanentView): 'creatures' | 'lands' | 'other' {
  const types = perm.cardTypes ?? []
  if (types.some((t) => t === 'Land' || t.toLowerCase() === 'land')) return 'lands'
  if (types.some((t) => t === 'Creature' || t.toLowerCase() === 'creature')) return 'creatures'
  return 'other'
}

export default function PlayerZone({
  player,
  hand,
  onCardClick,
  onHandCardClick,
  onCardHover,
  targetIds = new Set(),
  playableIds = new Set(),
  combatSelectable = [],
  combatMode = null,
  combatChosen = [],
  crossZonePlayables,
  onPlayCrossZone,
  helperEmblems,
}: PlayerZoneProps) {
  if (!player) return <div className="player-zone empty" />

  const battlefield = player.battlefield ?? {}
  const permanents = Object.entries(battlefield)

  // Track attachments to nest them under host permanents
  const attachedIds = new Set<string>()
  permanents.forEach(([, p]) => {
    if (p.attachments && Array.isArray(p.attachments)) {
      p.attachments.forEach((attId) => attachedIds.add(attId))
    }
  })

  const creatures = permanents.filter(([id, p]) => permanentKind(p) === 'creatures' && !attachedIds.has(id))
  const others = permanents.filter(([id, p]) => permanentKind(p) === 'other' && !attachedIds.has(id))
  const lands = permanents.filter(([id, p]) => permanentKind(p) === 'lands' && !attachedIds.has(id))

  const combatSelectableSet = useMemo(() => new Set(combatSelectable), [combatSelectable])
  const combatChosenSet = useMemo(() => new Set(combatChosen), [combatChosen])

  const isDefeated = player.hasLeft === true || player.life <= 0
  const handCount = player.handCount ?? 0
  const givenHand = Object.entries(hand ?? {})

  const finalHand = useMemo(() => {
    if (givenHand.length > 0) {
      if (givenHand.length < handCount) {
        const res: Record<string, CardView> = { ...hand }
        for (let i = givenHand.length; i < handCount; i++) {
          const id = `player-${player.playerId}-unknown-${i}`
          res[id] = {
            id,
            name: '?',
            manaValue: 0,
            expansionSetCode: '',
            cardNumber: '0',
            faceDown: true,
          }
        }
        return res
      }
      return hand ?? {}
    }

    if (handCount > 0) {
      const res: Record<string, CardView> = {}
      for (let i = 0; i < handCount; i++) {
        const id = `player-${player.playerId}-unknown-${i}`
        res[id] = {
          id,
          name: '?',
          manaValue: 0,
          expansionSetCode: '',
          cardNumber: '0',
          faceDown: true,
        }
      }
      return res
    }

    return {}
  }, [hand, handCount, givenHand.length, player.playerId])

  const { cardW, ref: zoneRef } = useZoneScale()

  return (
    <div
      className={`player-zone ${isDefeated ? 'is-defeated' : ''}`}
      ref={zoneRef}
      style={{ '--card-w': `${cardW}px` } as React.CSSProperties}
    >
      {/* Defeated / Left status overlay */}
      {isDefeated && (
        <div className="zone-defeated-overlay">
          <div className="zone-defeated-card">
            <span className="zone-defeated-icon">{player.hasLeft ? '🚪' : '💀'}</span>
            <span className="zone-defeated-title">
              {player.name} {player.hasLeft ? 'ha abandonado la partida' : 'ha sido derrotado'}
            </span>
            <span className="zone-defeated-sub">
              {player.hasLeft ? 'El jugador se ha desconectado o concedido' : 'Vida reducida a 0'}
            </span>
          </div>
        </div>
      )}

      {/* Row 1: Commander + Creatures */}
      <div className="pz-row pz-creatures-row">
        <div className="pz-commander">
          <CommandZone
            player={player}
            side="my"
            onCardClick={onCardClick}
            onHover={onCardHover}
            playableIds={playableIds}
            targetIds={targetIds}
            helperEmblems={helperEmblems}
          />
        </div>
        <div className="pz-band creatures-band">
          {creatures.map(([id, perm]) => {
            const isSelectable = combatSelectableSet.has(id)
            const isChosen = combatChosenSet.has(id)
            const isAttacking = (perm as any).attacking === true || (isChosen && combatMode === 'attack')
            const isTapped = perm.tapped === true || (isAttacking && !hasVigilance(perm))
            const attachments = perm.attachments ?? []

            if (attachments.length > 0) {
              const hasClass = attachments.length >= 4 ? 'has-4'
                : attachments.length === 3 ? 'has-3'
                : attachments.length === 2 ? 'has-2'
                : ''
              return (
                <div key={id} className={`card-attachment-group${hasClass ? ` ${hasClass}` : ''}`}>
                  <div className="attachments-list">
                    {attachments.map((attId, ai) => {
                      const attCard = battlefield[attId]
                      if (!attCard) return null
                      return (
                        <CardSlot
                          key={attId}
                          cardId={attId}
                          card={attCard}
                          onClick={onCardClick ? () => onCardClick(attId) : undefined}
                          onHover={onCardHover}
                          isTarget={targetIds.has(attId)}
                          isPlayable={playableIds.has(attId)}
                          className="attachment-subcard"
                          style={{ left: `calc(var(--card-w, 100px) * ${(ai + 1) * 0.58})` }}
                        />
                      )
                    })}
                  </div>
                  <CardSlot
                    cardId={id}
                    card={perm}
                    onClick={onCardClick ? () => onCardClick(id) : undefined}
                    onHover={onCardHover}
                    isTarget={targetIds.has(id)}
                    isPlayable={playableIds.has(id) || isSelectable || isChosen}
                    isChosen={isChosen}
                    tapped={isTapped}
                    showPt
                    showCounters
                    showDamage
                  />
                </div>
              )
            }

            return (
              <CardSlot
                key={id}
                cardId={id}
                card={perm}
                onClick={onCardClick ? () => onCardClick(id) : undefined}
                onHover={onCardHover}
                isTarget={targetIds.has(id)}
                isPlayable={playableIds.has(id) || isSelectable || isChosen}
                isChosen={isChosen}
                tapped={isTapped}
                showPt
                showCounters
                showDamage
              />
            )
          })}
        </div>
      </div>

      {/* Row 2: Lands + Others */}
      <div className="pz-row pz-permanents-row">
        <div className="pz-band permanents-band">
          {lands.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              isPlayable={playableIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
          {others.map(([id, perm]) => (
            <CardSlot
              key={id}
              cardId={id}
              card={perm}
              onClick={onCardClick ? () => onCardClick(id) : undefined}
              onHover={onCardHover}
              isTarget={targetIds.has(id)}
              isPlayable={playableIds.has(id)}
              tapped={perm.tapped === true}
              showCounters
            />
          ))}
        </div>
      </div>

      {/* Row 3: Unified row [life | hand | mana | deck | G | X] */}
      <div className="pz-row pz-bottom-row">
        <PlayerInfoBar
          player={player}
          side="my"
          onClick={onCardClick ? () => onCardClick(player.playerId) : undefined}
          isTarget={targetIds.has(player.playerId)}
          onHover={onCardHover}
        />
        <HandZone
          cards={finalHand}
          onCardClick={onHandCardClick}
          onHover={onCardHover}
          playableIds={playableIds}
          targetIds={targetIds}
        />
        <ResourceBar
          player={player}
          side="my"
          compact
          crossZonePlayables={crossZonePlayables}
          onPlayCrossZone={onPlayCrossZone}
        />
      </div>
    </div>
  )
}
