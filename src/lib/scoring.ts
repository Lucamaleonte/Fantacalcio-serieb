// Calcolo del punteggio di una squadra in una giornata (funzione pura).
// Regole:
// 1) ogni titolare con fantavoto conta quel valore;
// 2) al titolare senza voto subentra il primo panchinaro dello stesso ruolo
//    (ordine di panchina) che ha un voto, finché restano sostituzioni;
//    un panchinaro non può entrare due volte;
// 3) senza sostituto il titolare vale `noVoteValue`;
// 4) squadra senza formazione: 0 punti.
import type { PlayerRole } from './types'

export interface LineupPlayer {
  id: string
  name: string
  role: PlayerRole
}

export interface TeamLineup {
  formation: string
  starters: LineupPlayer[]
  bench: LineupPlayer[]
}

export interface ScoringRules {
  maxSubstitutions: number
  noVoteValue: number
}

export interface StarterResult {
  id: string
  name: string
  role: PlayerRole
  fantavote: number | null
  value: number
  sub: { id: string; name: string; fantavote: number } | null
}

export interface ScoreDetails {
  missing: boolean
  formation: string | null
  starters: StarterResult[]
  substitutions: number
}

export interface TeamScore {
  points: number
  details: ScoreDetails
}

// Fantavoti della giornata: assente o null = senza voto
export type Fantavotes = Map<string, number | null>

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function scoreTeam(
  lineup: TeamLineup | null,
  fantavotes: Fantavotes,
  rules: ScoringRules,
): TeamScore {
  if (!lineup) {
    return {
      points: 0,
      details: {
        missing: true,
        formation: null,
        starters: [],
        substitutions: 0,
      },
    }
  }

  const vote = (id: string) => fantavotes.get(id) ?? null
  const usedBench = new Set<string>()
  let substitutions = 0

  const starters = lineup.starters.map((p): StarterResult => {
    const fantavote = vote(p.id)
    if (fantavote !== null) {
      return { ...p, fantavote, value: fantavote, sub: null }
    }
    if (substitutions < rules.maxSubstitutions) {
      const sub = lineup.bench.find(
        (b) => b.role === p.role && !usedBench.has(b.id) && vote(b.id) !== null,
      )
      if (sub) {
        usedBench.add(sub.id)
        substitutions++
        const subVote = vote(sub.id)!
        return {
          ...p,
          fantavote: null,
          value: subVote,
          sub: { id: sub.id, name: sub.name, fantavote: subVote },
        }
      }
    }
    return { ...p, fantavote: null, value: rules.noVoteValue, sub: null }
  })

  return {
    points: round2(starters.reduce((sum, s) => sum + s.value, 0)),
    details: {
      missing: false,
      formation: lineup.formation,
      starters,
      substitutions,
    },
  }
}

// Formazione salvata (righe di lineup_players) -> titolari e panchina in ordine
export function buildLineup(
  formation: string,
  rows: { player_id: string; slot: string; position: number }[],
  players: Map<string, LineupPlayer>,
): TeamLineup {
  const sorted = [...rows].sort((a, b) => a.position - b.position)
  const pick = (slot: string) =>
    sorted
      .filter((r) => r.slot === slot)
      .map((r) => players.get(r.player_id))
      .filter((p): p is LineupPlayer => !!p)
  return { formation, starters: pick('starter'), bench: pick('bench') }
}

// Fantapunti -> gol (come private.points_to_goals nel database)
export function pointsToGoals(
  points: number,
  threshold: number,
  step: number,
): number {
  if (points < threshold) return 0
  return Math.floor((points - threshold) / step) + 1
}
