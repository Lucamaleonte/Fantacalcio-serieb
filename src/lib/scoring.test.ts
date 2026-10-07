import { describe, expect, it } from 'vitest'
import {
  pointsToGoals,
  scoreTeam,
  type Fantavotes,
  type LineupPlayer,
  type TeamLineup,
} from './scoring'
import type { PlayerRole } from './types'

const rules = { maxSubstitutions: 5, noVoteValue: 0 }

function p(id: string): LineupPlayer {
  return { id, name: id, role: id[0] as PlayerRole }
}

// 4-4-2: P1 / D1-D4 / C1-C4 / A1-A2; panchina: P2, D5, D6, C5, A3
const lineup: TeamLineup = {
  formation: '4-4-2',
  starters: [
    'P1',
    'D1',
    'D2',
    'D3',
    'D4',
    'C1',
    'C2',
    'C3',
    'C4',
    'A1',
    'A2',
  ].map(p),
  bench: ['P2', 'D5', 'D6', 'C5', 'A3'].map(p),
}

// Tutti i titolari 6, panchinari 7 (salvo override)
function votes(overrides: Record<string, number | null> = {}): Fantavotes {
  const map: Fantavotes = new Map()
  for (const s of lineup.starters) map.set(s.id, 6)
  for (const b of lineup.bench) map.set(b.id, 7)
  for (const [id, v] of Object.entries(overrides)) {
    if (v === undefined) map.delete(id)
    else map.set(id, v)
  }
  return map
}

describe('scoreTeam', () => {
  it('somma i fantavoti dei titolari', () => {
    const r = scoreTeam(lineup, votes({ A1: 10.5, D1: 5.5 }), rules)
    expect(r.points).toBe(6 * 9 + 10.5 + 5.5)
    expect(r.details.substitutions).toBe(0)
    expect(r.details.missing).toBe(false)
  })

  it('sostituzione con il primo panchinaro dello stesso ruolo', () => {
    const r = scoreTeam(lineup, votes({ D2: null }), rules)
    const d2 = r.details.starters.find((s) => s.id === 'D2')!
    expect(d2.sub).toEqual({ id: 'D5', name: 'D5', fantavote: 7 })
    expect(r.points).toBe(6 * 10 + 7)
    expect(r.details.substitutions).toBe(1)
  })

  it('salta il panchinaro senza voto e non usa due volte lo stesso', () => {
    const r = scoreTeam(lineup, votes({ D1: null, D2: null, D5: null }), rules)
    const subs = r.details.starters
      .filter((s) => s.sub)
      .map((s) => [s.id, s.sub!.id])
    // D5 senza voto: D1 <- D6; per D2 non resta nessun difensore
    expect(subs).toEqual([['D1', 'D6']])
    expect(r.details.starters.find((s) => s.id === 'D2')!.value).toBe(0)
    expect(r.points).toBe(6 * 9 + 7 + 0)
  })

  it('un voto assente dalla mappa vale come senza voto', () => {
    const v = votes()
    v.delete('C3')
    const r = scoreTeam(lineup, v, rules)
    expect(r.details.starters.find((s) => s.id === 'C3')!.sub?.id).toBe('C5')
  })

  it('rispetta il limite di sostituzioni (in ordine di schieramento)', () => {
    const r = scoreTeam(lineup, votes({ P1: null, D1: null, C1: null }), {
      maxSubstitutions: 2,
      noVoteValue: 0,
    })
    expect(r.details.substitutions).toBe(2)
    expect(r.details.starters.find((s) => s.id === 'P1')!.sub?.id).toBe('P2')
    expect(r.details.starters.find((s) => s.id === 'D1')!.sub?.id).toBe('D5')
    expect(r.details.starters.find((s) => s.id === 'C1')!.sub).toBeNull()
    expect(r.points).toBe(6 * 8 + 7 + 7 + 0)
  })

  it('titolare senza sostituto vale noVoteValue', () => {
    const r = scoreTeam(lineup, votes({ A1: null, A3: null }), {
      maxSubstitutions: 5,
      noVoteValue: 4,
    })
    expect(r.details.starters.find((s) => s.id === 'A1')!.value).toBe(4)
    expect(r.points).toBe(6 * 10 + 4)
  })

  it('panchina vuota', () => {
    const r = scoreTeam({ ...lineup, bench: [] }, votes({ P1: null }), rules)
    expect(r.points).toBe(60)
  })

  it('squadra senza formazione: 0 punti', () => {
    const r = scoreTeam(null, votes(), rules)
    expect(r).toEqual({
      points: 0,
      details: {
        missing: true,
        formation: null,
        starters: [],
        substitutions: 0,
      },
    })
  })

  it('arrotonda ai centesimi', () => {
    const r = scoreTeam(lineup, votes({ P1: 6.1, D1: 6.2 }), rules)
    expect(r.points).toBe(66.3)
  })

  it('fantavoti negativi', () => {
    const r = scoreTeam(lineup, votes({ D1: -1 }), rules)
    expect(r.points).toBe(59)
  })
})

describe('pointsToGoals', () => {
  it('66 = 1 gol, poi +1 ogni 6', () => {
    expect(pointsToGoals(65.5, 66, 6)).toBe(0)
    expect(pointsToGoals(66, 66, 6)).toBe(1)
    expect(pointsToGoals(71.5, 66, 6)).toBe(1)
    expect(pointsToGoals(72, 66, 6)).toBe(2)
    expect(pointsToGoals(84, 66, 6)).toBe(4)
    expect(pointsToGoals(0, 66, 6)).toBe(0)
  })
})
