import { describe, expect, it } from 'vitest'
import {
  arrangeStarters,
  fillBench,
  formationSlots,
  moveItem,
  parseFormation,
  validateLineup,
} from './lineup'
import type { PlayerRole } from './types'

const ALLOWED = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2']

// Rosa di prova: id = ruolo + numero (P1, D1..D5, C1..C5, A1..A3)
const roster = new Map<string, { name: string; role: PlayerRole }>()
for (const [role, n] of [
  ['P', 2],
  ['D', 5],
  ['C', 5],
  ['A', 3],
] as const) {
  for (let i = 1; i <= n; i++)
    roster.set(`${role}${i}`, { name: `${role}${i}`, role })
}
const players = [...roster].map(([id, p]) => ({ id, role: p.role }))

const starters442 = [
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
]

describe('parseFormation / formationSlots', () => {
  it('legge i moduli validi', () => {
    expect(parseFormation('4-4-2')).toEqual({ D: 4, C: 4, A: 2 })
    expect(formationSlots('3-4-3')).toEqual([
      'P',
      'D',
      'D',
      'D',
      'C',
      'C',
      'C',
      'C',
      'A',
      'A',
      'A',
    ])
  })

  it('rifiuta moduli che non sommano 10 o malformati', () => {
    expect(parseFormation('4-4-3')).toBeNull()
    expect(parseFormation('442')).toBeNull()
    expect(formationSlots('x')).toEqual([])
  })
})

describe('arrangeStarters', () => {
  it('dispone i giocatori negli slot del modulo', () => {
    const chosen = starters442.map((id) => ({ id, role: roster.get(id)!.role }))
    expect(arrangeStarters(chosen, '4-4-2')).toEqual({
      slots: starters442,
      leftovers: [],
    })
  })

  it('cambiando modulo, chi non ha più posto va negli avanzi e gli slot nuovi restano vuoti', () => {
    const chosen = starters442.map((id) => ({ id, role: roster.get(id)!.role }))
    const { slots, leftovers } = arrangeStarters(chosen, '3-5-2')
    expect(slots).toEqual([
      'P1',
      'D1',
      'D2',
      'D3',
      'C1',
      'C2',
      'C3',
      'C4',
      null,
      'A1',
      'A2',
    ])
    expect(leftovers).toEqual(['D4'])
  })
})

describe('validateLineup', () => {
  it('formazione completa e valida', () => {
    expect(
      validateLineup(
        { formation: '4-4-2', starters: starters442, bench: ['P2', 'D5'] },
        roster,
        ALLOWED,
      ),
    ).toEqual([])
  })

  it('modulo non consentito', () => {
    expect(
      validateLineup(
        { formation: '6-3-1', starters: [], bench: [] },
        roster,
        ALLOWED,
      ),
    ).toEqual(['Modulo 6-3-1 non consentito'])
  })

  it('titolari mancanti', () => {
    const starters: (string | null)[] = [...starters442]
    starters[10] = null
    starters[9] = null
    expect(
      validateLineup(
        { formation: '4-4-2', starters, bench: [] },
        roster,
        ALLOWED,
      ),
    ).toEqual(['Mancano 2 titolari'])
    expect(
      validateLineup(
        { formation: '4-4-2', starters: starters442.slice(0, 10), bench: [] },
        roster,
        ALLOWED,
      ),
    ).toEqual(['Manca 1 titolare'])
  })

  it('giocatore duplicato tra titolari e panchina', () => {
    expect(
      validateLineup(
        { formation: '4-4-2', starters: starters442, bench: ['D1'] },
        roster,
        ALLOWED,
      ),
    ).toContain('Lo stesso giocatore è inserito più volte')
  })

  it('giocatore non in rosa', () => {
    expect(
      validateLineup(
        { formation: '4-4-2', starters: starters442, bench: ['X9'] },
        roster,
        ALLOWED,
      ),
    ).toContain('Un giocatore schierato non è più nella tua rosa')
  })

  it('ruolo sbagliato nello slot', () => {
    const starters = [...starters442]
    starters[1] = 'C5' // centrocampista nello slot di un difensore
    expect(
      validateLineup(
        { formation: '4-4-2', starters, bench: [] },
        roster,
        ALLOWED,
      ),
    ).toEqual(['C5 non può giocare nello slot D'])
  })
})

describe('fillBench / moveItem', () => {
  it("aggiunge in panchina i giocatori non usati, nell'ordine della rosa", () => {
    const ids = players.map((p) => p.id)
    expect(fillBench(ids, starters442, ['C5'])).toEqual([
      'C5',
      'P2',
      'D5',
      'A3',
    ])
  })

  it('sposta un elemento', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c'])
  })
})
