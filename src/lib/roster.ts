// Calcoli sulla rosa: budget, conteggi per ruolo e controlli prima del salvataggio.
// Gli stessi vincoli sono applicati anche dal database (trigger).
import { ROLE_LABELS } from './roles'
import type { League, Player, PlayerRole } from './types'

export interface RosterEntry {
  id: string
  user_id: string
  player_id: string
  cost: number
  player: Player
}

export type RoleCounts = Record<PlayerRole, number>

export interface RosterSummary {
  spent: number
  remaining: number
  budget: number
  counts: RoleCounts
  limits: RoleCounts
  size: number
  maxSize: number
}

export function roleLimits(league: League): RoleCounts {
  return { P: league.n_gk, D: league.n_def, C: league.n_mid, A: league.n_att }
}

export function summarizeRoster(
  entries: RosterEntry[],
  league: League,
): RosterSummary {
  const counts: RoleCounts = { P: 0, D: 0, C: 0, A: 0 }
  let spent = 0
  for (const e of entries) {
    counts[e.player.role]++
    spent += e.cost
  }
  const limits = roleLimits(league)
  return {
    spent,
    remaining: league.budget - spent,
    budget: league.budget,
    counts,
    limits,
    size: entries.length,
    maxSize: limits.P + limits.D + limits.C + limits.A,
  }
}

export function parseCost(value: string): number | null {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return Number(trimmed)
}

function costError(cost: number | null): string | null {
  if (cost === null) return 'Inserisci il costo: un numero intero (0 o più)'
  return null
}

// Errore da mostrare prima di aggiungere un giocatore, oppure null se è tutto ok
export function validateAddition(
  summary: RosterSummary,
  role: PlayerRole,
  cost: number | null,
): string | null {
  if (summary.counts[role] >= summary.limits[role]) {
    return `${ROLE_LABELS[role]} al completo (${summary.counts[role]}/${summary.limits[role]})`
  }
  const invalid = costError(cost)
  if (invalid) return invalid
  if (cost! > summary.remaining) {
    return `Budget insufficiente: restano ${summary.remaining} crediti`
  }
  return null
}

// Errore da mostrare prima di cambiare il costo di un giocatore già in rosa
export function validateCostChange(
  summary: RosterSummary,
  currentCost: number,
  newCost: number | null,
): string | null {
  const invalid = costError(newCost)
  if (invalid) return invalid
  const available = summary.remaining + currentCost
  if (newCost! > available) {
    return `Budget insufficiente: massimo ${available} crediti per questo giocatore`
  }
  return null
}
