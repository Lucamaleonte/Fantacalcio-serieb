import { describe, expect, it } from 'vitest'
import { matchVotes, sameTeam, surnameKey } from './voteMatching'
import type { VoteRow } from './votesParser'

const players = [
  { id: 'perin', name: 'Perin', role: 'P' as const, real_team: 'Palermo' },
  {
    id: 'patane',
    name: 'Patanè',
    role: 'C' as const,
    real_team: 'Juve Stabia',
  },
  {
    id: 'seghetti',
    name: 'Seghetti J.',
    role: 'P' as const,
    real_team: 'Empoli',
  },
  {
    id: 'leali',
    name: 'Leali',
    role: 'P' as const,
    real_team: 'Hellas Verona',
  },
  { id: 'esp1', name: 'Esposito F.', role: 'D' as const, real_team: 'Pisa' },
  { id: 'esp2', name: 'Esposito S.', role: 'A' as const, real_team: 'Pisa' },
  { id: 'rossi1', name: 'Rossi', role: 'C' as const, real_team: 'Bari' },
  { id: 'rossi2', name: 'Rossi', role: 'C' as const, real_team: 'Modena' },
  {
    id: 'plizzari',
    name: 'Plizzari',
    role: 'P' as const,
    real_team: 'Südtirol',
  },
]

let line = 0
function row(name: string, team: string): VoteRow {
  return { line: ++line, name, team, vote: 6, fantavote: 6 }
}

describe('surnameKey / sameTeam', () => {
  it('toglie le iniziali', () => {
    expect(surnameKey('Seghetti J.')).toBe('seghetti')
    expect(surnameKey('Jonathan Silva')).toBe('jonathan silva')
  })

  it('riconosce nomi di squadra abbreviati o senza accenti', () => {
    expect(sameTeam('Verona', 'Hellas Verona')).toBe(true)
    expect(sameTeam('Sudtirol', 'Südtirol')).toBe(true)
    expect(sameTeam('Pisa', 'Bari')).toBe(false)
    expect(sameTeam('', 'Bari')).toBe(false)
  })
})

describe('matchVotes', () => {
  it('nome + squadra, anche con accenti e maiuscole diverse', () => {
    const r = matchVotes(
      [row('PATANE', 'Juve Stabia'), row('Plizzari', 'Sudtirol')],
      players,
    )
    expect(r.matched.map((m) => m.player.id)).toEqual(['patane', 'plizzari'])
  })

  it("cognome + squadra quando manca o cambia l'iniziale", () => {
    const r = matchVotes(
      [row('Seghetti', 'Empoli'), row('Leali N.', 'Verona')],
      players,
    )
    expect(r.matched.map((m) => m.player.id)).toEqual(['seghetti', 'leali'])
  })

  it('cognome univoco nella lega anche con squadra diversa (es. trasferito)', () => {
    const r = matchVotes([row('Perin', 'Sampdoria')], players)
    expect(r.matched.map((m) => m.player.id)).toEqual(['perin'])
  })

  it('ambiguo: stesso cognome nella stessa squadra', () => {
    const r = matchVotes([row('Esposito', 'Pisa')], players)
    expect(r.ambiguous[0].candidates.map((c) => c.id)).toEqual(['esp1', 'esp2'])
  })

  it('ambiguo: stesso nome in squadre diverse e squadra non riconosciuta', () => {
    const r = matchVotes([row('Rossi', 'Cesena')], players)
    expect(r.ambiguous[0].candidates.map((c) => c.id)).toEqual([
      'rossi1',
      'rossi2',
    ])
  })

  it('nome esatto distinto dalla squadra', () => {
    const r = matchVotes([row('Rossi', 'Modena')], players)
    expect(r.matched.map((m) => m.player.id)).toEqual(['rossi2'])
  })

  it('non riconosciuto', () => {
    const r = matchVotes([row('Sconosciuto', 'Bari')], players)
    expect(r.unmatched.map((u) => u.name)).toEqual(['Sconosciuto'])
  })

  it('due righe sullo stesso giocatore vanno controllate a mano', () => {
    const r = matchVotes(
      [row('Perin', 'Palermo'), row('Perin', 'Palermo')],
      players,
    )
    expect(r.matched).toEqual([])
    expect(r.ambiguous).toHaveLength(2)
  })
})
