import { supabase } from './supabase'
import type { Player } from './types'

// Supabase restituisce al massimo 1000 righe per richiesta: si legge a pagine
const PAGE_SIZE = 1000

export async function fetchAllPlayers(leagueId: string): Promise<Player[]> {
  const players: Player[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('players')
      .select('id, league_id, name, role, real_team, active')
      .eq('league_id', leagueId)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    players.push(...(data as Player[]))
    if (data.length < PAGE_SIZE) return players
  }
}

const ROLE_ORDER = { P: 0, D: 1, C: 2, A: 3 }

// Ordine classico: portieri, difensori, centrocampisti, attaccanti, poi per nome
export function comparePlayers(a: Player, b: Player): number {
  return (
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    a.name.localeCompare(b.name, 'it')
  )
}

export const ROLE_LABELS = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
} as const
