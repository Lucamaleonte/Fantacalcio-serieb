// Classifica scontri diretti (righe della vista "standings")

export interface Standing {
  league_id: string
  user_id: string
  team_name: string
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goal_difference: number
  points: number
  fantapoints: number
}

// Punti, poi somma fantapunti, poi differenza reti, poi gol fatti
export function sortStandings(rows: Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      Number(b.fantapoints) - Number(a.fantapoints) ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      a.team_name.localeCompare(b.team_name, 'it'),
  )
}
