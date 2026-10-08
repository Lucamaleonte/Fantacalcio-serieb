import { describe, expect, it } from 'vitest'
import {
  calendarTeams,
  pairingsForRound,
  roundsPerCycle,
  type Pairing,
} from './calendar'

const teams = (n: number) => Array.from({ length: n }, (_, i) => `T${i}`)
const key = (p: Pairing) => [p.home, p.away].sort().join('-')

describe('calendarTeams', () => {
  it('ordina per posizione e salta chi non ce l’ha', () => {
    expect(
      calendarTeams([
        { user_id: 'b', calendar_position: 1 },
        { user_id: 'x', calendar_position: null },
        { user_id: 'a', calendar_position: 0 },
      ]),
    ).toEqual(['a', 'b'])
  })
})

describe('roundsPerCycle', () => {
  it('N-1 giornate con N pari, N con N dispari', () => {
    expect(roundsPerCycle(6)).toBe(5)
    expect(roundsPerCycle(5)).toBe(5)
    expect(roundsPerCycle(1)).toBe(0)
  })
})

describe('pairingsForRound', () => {
  it('stessi accoppiamenti di build_fixtures (6 squadre, giornate 1-2)', () => {
    const t = teams(6)
    expect(pairingsForRound(t, 1)).toEqual([
      { home: 'T5', away: 'T0' },
      { home: 'T1', away: 'T4' },
      { home: 'T2', away: 'T3' },
    ])
    expect(pairingsForRound(t, 2)).toEqual([
      { home: 'T1', away: 'T5' },
      { home: 'T2', away: 'T0' },
      { home: 'T3', away: 'T4' },
    ])
  })

  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`${n} squadre: ognuno contro tutti una volta per girone`, () => {
      const t = teams(n)
      const rounds = roundsPerCycle(n)
      const seen = new Map<string, number>()
      for (let r = 1; r <= rounds; r++) {
        const pairs = pairingsForRound(t, r)
        expect(pairs).toHaveLength(Math.floor(n / 2))
        const playing = pairs.flatMap((p) => [p.home, p.away])
        expect(new Set(playing).size).toBe(playing.length)
        for (const p of pairs) seen.set(key(p), (seen.get(key(p)) ?? 0) + 1)
      }
      expect(seen.size).toBe((n * (n - 1)) / 2)
      expect([...seen.values()].every((v) => v === 1)).toBe(true)
    })
  }

  it('nel ritorno si invertono casa e trasferta, poi si ripete', () => {
    const t = teams(6)
    for (let r = 1; r <= 5; r++) {
      const andata = pairingsForRound(t, r)
      expect(pairingsForRound(t, r + 5)).toEqual(
        andata.map((p) => ({ home: p.away, away: p.home })),
      )
      expect(pairingsForRound(t, r + 10)).toEqual(andata)
    }
  })

  it('meno di 2 squadre: nessuna partita', () => {
    expect(pairingsForRound(['T0'], 1)).toEqual([])
    expect(pairingsForRound([], 3)).toEqual([])
  })
})
