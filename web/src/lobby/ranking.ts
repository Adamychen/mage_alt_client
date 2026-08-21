export type RankTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' | 'DIAMOND' | 'MYTHIC'

export interface RankInfo {
  tier: RankTier
  name: string
  subTier: string // 'IV', 'III', 'II', 'I' or 'Top'
  label: string // e.g. 'Oro II', 'Mítico'
  icon: string
  color: string
  bg: string
  border: string
  minElo: number
  maxElo: number
  nextTierName: string | null
  nextTierMinElo: number | null
  progressPercent: number
}

export const RANK_TIERS_CONFIG: Array<{
  tier: RankTier
  name: string
  minElo: number
  maxElo: number
  icon: string
  color: string
  bg: string
  border: string
}> = [
  {
    tier: 'BRONZE',
    name: 'Bronce',
    minElo: 0,
    maxElo: 1399,
    icon: '🟤',
    color: '#d97706',
    bg: 'rgba(217, 119, 6, 0.15)',
    border: 'rgba(217, 119, 6, 0.4)',
  },
  {
    tier: 'SILVER',
    name: 'Plata',
    minElo: 1400,
    maxElo: 1549,
    icon: '⚪',
    color: '#e5e7eb',
    bg: 'rgba(229, 231, 235, 0.15)',
    border: 'rgba(229, 231, 235, 0.35)',
  },
  {
    tier: 'GOLD',
    name: 'Oro',
    minElo: 1550,
    maxElo: 1699,
    icon: '🟡',
    color: '#facc15',
    bg: 'rgba(250, 204, 21, 0.15)',
    border: 'rgba(250, 204, 21, 0.45)',
  },
  {
    tier: 'PLATINUM',
    name: 'Platino',
    minElo: 1700,
    maxElo: 1849,
    icon: '💠',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.45)',
  },
  {
    tier: 'DIAMOND',
    name: 'Diamante',
    minElo: 1850,
    maxElo: 1999,
    icon: '💎',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.18)',
    border: 'rgba(129, 140, 248, 0.5)',
  },
  {
    tier: 'MYTHIC',
    name: 'Mítico',
    minElo: 2000,
    maxElo: 3000,
    icon: '🟠',
    color: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.2)',
    border: 'rgba(251, 146, 60, 0.6)',
  },
]

export function getRankInfo(eloInput?: number | string | null): RankInfo {
  const elo = typeof eloInput === 'number' ? eloInput : parseInt(String(eloInput ?? '1500'), 10) || 1500

  // Mythic Tier
  if (elo >= 2000) {
    return {
      tier: 'MYTHIC',
      name: 'Mítico',
      subTier: 'Top',
      label: 'Mítico',
      icon: '🟠',
      color: '#fb923c',
      bg: 'rgba(251, 146, 60, 0.2)',
      border: 'rgba(251, 146, 60, 0.6)',
      minElo: 2000,
      maxElo: 3000,
      nextTierName: null,
      nextTierMinElo: null,
      progressPercent: 100,
    }
  }

  // Find corresponding tier config
  const config =
    RANK_TIERS_CONFIG.find((c) => elo >= c.minElo && elo <= c.maxElo) ??
    RANK_TIERS_CONFIG[1] // Silver default

  const tierSpan = config.maxElo - config.minElo + 1
  const subSpan = tierSpan / 4
  const progressInTier = Math.max(0, elo - config.minElo)
  const subTierIndex = Math.min(3, Math.floor(progressInTier / subSpan)) // 0: IV, 1: III, 2: II, 3: I
  const subTierNumerals = ['IV', 'III', 'II', 'I']
  const subTier = subTierNumerals[subTierIndex]

  const configIndex = RANK_TIERS_CONFIG.findIndex((c) => c.tier === config.tier)
  const nextConfig = configIndex < RANK_TIERS_CONFIG.length - 1 ? RANK_TIERS_CONFIG[configIndex + 1] : null
  const progressPercent = Math.min(100, Math.max(0, Math.round((progressInTier / tierSpan) * 100)))

  return {
    tier: config.tier,
    name: config.name,
    subTier,
    label: `${config.name} ${subTier}`,
    icon: config.icon,
    color: config.color,
    bg: config.bg,
    border: config.border,
    minElo: config.minElo,
    maxElo: config.maxElo,
    nextTierName: nextConfig?.name ?? null,
    nextTierMinElo: nextConfig?.minElo ?? null,
    progressPercent,
  }
}
