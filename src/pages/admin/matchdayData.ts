// Dati di una giornata per le pagine admin (voti e calcolo)
import { fetchAllPlayers } from '../../lib/players'
import { supabase } from '../../lib/supabase'
import type { Fixture, Matchday, Player } from '../../lib/types'

export interface StoredVote {
  vote: number | null
  fantavote: number | null
}

export interface LineupRow {
  user_id: string
  formation: string
  lineup_players: { player_id: string; slot: string; position: number }[]
}

export interface MatchdayData {
  matchday: Matchday
  teams: { user_id: string; team_name: string }[]
  players: Player[]
  votes: Map<string, StoredVote>
  lineups: LineupRow[]
  fixtures: Fixture[]
}

export async function loadMatchdayData(
  leagueId: string,
  matchdayId: string,
): Promise<MatchdayData> {
  const [matchday, members, players, votes, lineups, fixtures] =
    await Promise.all([
      supabase
        .from('matchdays')
        .select('id, league_id, number, deadline, status')
        .eq('id', matchdayId)
        .single(),
      supabase
        .from('league_members')
        .select('user_id, team_name')
        .eq('league_id', leagueId),
      fetchAllPlayers(leagueId),
      supabase
        .from('player_votes')
        .select('player_id, vote, fantavote')
        .eq('matchday_id', matchdayId)
        .range(0, 4999),
      supabase
        .from('lineups')
        .select('user_id, formation, lineup_players(player_id, slot, position)')
        .eq('matchday_id', matchdayId),
      supabase
        .from('fixtures')
        .select(
          'id, matchday_id, home_user_id, away_user_id, home_points, away_points, home_goals, away_goals',
        )
        .eq('matchday_id', matchdayId),
    ])
  for (const r of [matchday, members, votes, lineups, fixtures])
    if (r.error) throw r.error

  return {
    matchday: matchday.data as Matchday,
    teams: (members.data as { user_id: string; team_name: string }[]).sort(
      (a, b) => a.team_name.localeCompare(b.team_name, 'it'),
    ),
    players,
    votes: new Map(
      (votes.data as ({ player_id: string } & StoredVote)[]).map((v) => [
        v.player_id,
        { vote: v.vote, fantavote: v.fantavote },
      ]),
    ),
    lineups: lineups.data as LineupRow[],
    fixtures: fixtures.data as Fixture[],
  }
}

export interface VoteInput {
  player_id: string
  vote: number | null
  fantavote: number | null
}

// Salva (upsert) i voti; ritorna quanti sono stati salvati
export async function saveVotes(
  matchdayId: string,
  rows: VoteInput[],
): Promise<number> {
  const { data, error } = await supabase.rpc('import_votes', {
    p_matchday_id: matchdayId,
    p_rows: rows,
  })
  if (error) throw error
  return data as number
}
