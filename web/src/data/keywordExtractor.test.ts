import { describe, it, expect } from 'vitest'
import { extractKeywordsFromCard } from './keywordExtractor'
import type { CardView } from '../net/types'

describe('keywordExtractor', () => {
  it('returns empty array when card is null or has no rules', () => {
    expect(extractKeywordsFromCard(null)).toEqual([])
    expect(extractKeywordsFromCard({ id: '1', name: 'Forest', rules: [] } as any)).toEqual([])
  })

  it('detects multiple simple keywords (e.g. Atraxa: Flying, Vigilance, Deathtouch, Lifelink, Proliferate)', () => {
    const atraxa: Partial<CardView> = {
      id: 'atraxa',
      name: "Atraxa, Praetors' Voice",
      rules: [
        'Flying, vigilance, deathtouch, lifelink',
        'At the beginning of your end step, proliferate.',
      ],
    }

    const kw = extractKeywordsFromCard(atraxa as CardView)
    const ids = kw.map((k) => k.id)

    expect(ids).toContain('flying')
    expect(ids).toContain('vigilance')
    expect(ids).toContain('deathtouch')
    expect(ids).toContain('lifelink')
    expect(ids).toContain('proliferate')
  })

  it('detects parameterized keywords like Ward and Scry', () => {
    const card: Partial<CardView> = {
      id: 'tivit',
      name: 'Tivit, Seller of Secrets',
      rules: [
        'Flying',
        'Ward {3}',
        'When Tivit enters, investigate or scry 2.',
      ],
    }

    const kw = extractKeywordsFromCard(card as CardView)
    const ward = kw.find((k) => k.id === 'ward')
    const scry = kw.find((k) => k.id === 'scry')
    const inv = kw.find((k) => k.id === 'investigate')

    expect(ward).toBeDefined()
    expect(ward?.name).toBe('Ward {3}')
    expect(ward?.summary).toContain('{3}')

    expect(scry).toBeDefined()
    expect(scry?.name).toBe('Scry 2')

    expect(inv).toBeDefined()
  })

  it('deduplicates repeating keywords', () => {
    const card: Partial<CardView> = {
      id: 'double-fly',
      name: 'Bird',
      rules: [
        'Flying',
        'Other creatures have flying.',
      ],
    }

    const kw = extractKeywordsFromCard(card as CardView)
    expect(kw.filter((k) => k.id === 'flying')).toHaveLength(1)
  })
})
