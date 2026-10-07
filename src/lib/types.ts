// Tipi delle righe del database (vedi supabase/migrations)

export type PlayerRole = 'P' | 'D' | 'C' | 'A'
export type MemberRole = 'admin' | 'member'

export interface League {
  id: string
  name: string
  invite_code: string
  admin_id: string
  budget: number
  n_gk: number
  n_def: number
  n_mid: number
  n_att: number
  allowed_formations: string[]
  max_substitutions: number
  no_vote_value: number
  goal_threshold: number
  goal_step: number
  rosters_locked: boolean
}

export interface Membership {
  league_id: string
  user_id: string
  team_name: string
  role: MemberRole
}

export interface Player {
  id: string
  league_id: string
  name: string
  role: PlayerRole
  real_team: string
  active: boolean
}

export type MatchdayStatus = 'open' | 'locked' | 'scored'

export interface Matchday {
  id: string
  league_id: string
  number: number
  deadline: string
  status: MatchdayStatus
}

export interface Fixture {
  id: string
  matchday_id: string
  home_user_id: string
  away_user_id: string
  home_points: number | null
  away_points: number | null
  home_goals: number | null
  away_goals: number | null
}

export interface Profile {
  id: string
  display_name: string
}
