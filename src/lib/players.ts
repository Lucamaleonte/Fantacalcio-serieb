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
