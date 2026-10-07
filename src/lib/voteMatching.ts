// Abbinamento delle righe dei voti ai giocatori della lega:
// 1) nome + squadra; 2) cognome + squadra; 3) cognome, se univoco nella lega.
import { normalizeName } from './normalize'
import type { Player } from './types'
import type { VoteRow } from './votesParser'

type MatchPlayer = Pick<Player, 'id' | 'name' | 'role' | 'real_team'>

export interface VoteMatch {
  matched: { row: VoteRow; player: MatchPlayer }[]
  ambiguous: { row: VoteRow; candidates: MatchPlayer[] }[]
  unmatched: VoteRow[]
}

// Cognome: il nome senza iniziali ("Seghetti J." -> "seghetti")
export function surnameKey(name: string): string {
  const normalized = normalizeName(name)
  const tokens = normalized.split(' ').filter((t) => t.length > 1)
  return tokens.length ? tokens.join(' ') : normalized
}

// "Verona" e "Hellas Verona", "Sudtirol" e "Südtirol" sono la stessa squadra
export function sameTeam(a: string, b: string): boolean {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}

export function matchVotes(rows: VoteRow[], players: MatchPlayer[]): VoteMatch {
  const prepared = players.map((p) => ({
    player: p,
    name: normalizeName(p.name),
    surname: surnameKey(p.name),
  }))

  const result: VoteMatch = { matched: [], ambiguous: [], unmatched: [] }

  for (const row of rows) {
    const name = normalizeName(row.name)
    const surname = surnameKey(row.name)
    const inTeam = (p: MatchPlayer) =>
      !row.team || sameTeam(row.team, p.real_team)

    let candidates = prepared.filter((p) => p.name === name && inTeam(p.player))
    if (candidates.length === 0 && row.team) {
      candidates = prepared.filter(
        (p) => p.surname === surname && inTeam(p.player),
      )
    }
    if (candidates.length === 0) {
      candidates = prepared.filter((p) => p.surname === surname)
    }

    if (candidates.length === 1) {
      result.matched.push({ row, player: candidates[0].player })
    } else if (candidates.length > 1) {
      result.ambiguous.push({
        row,
        candidates: candidates.map((c) => c.player),
      })
    } else {
      result.unmatched.push(row)
    }
  }

  // Due righe sullo stesso giocatore: vanno controllate a mano
  const counts = new Map<string, number>()
  for (const m of result.matched)
    counts.set(m.player.id, (counts.get(m.player.id) ?? 0) + 1)
  const duplicates = result.matched.filter((m) => counts.get(m.player.id)! > 1)
  if (duplicates.length) {
    result.matched = result.matched.filter((m) => counts.get(m.player.id) === 1)
    result.ambiguous.push(
      ...duplicates.map((m) => ({ row: m.row, candidates: [m.player] })),
    )
    result.ambiguous.sort((a, b) => a.row.line - b.row.line)
  }

  return result
}
