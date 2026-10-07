import { describe, expect, it } from 'vitest'
import { sortStandings, type Standing } from './standings'

function s(
  team: string,
  points: number,
  fantapoints: number,
  gd = 0,
  gf = 0,
): Standing {
  return {
    league_id: 'l',
    user_id: team,
    team_name: team,
    played: 1,
    won: 0,
    drawn: 0,
    lost: 0,
    goals_for: gf,
    goals_against: gf - gd,
    goal_difference: gd,
    points,
    fantapoints,
  }
}

describe('sortStandings', () => {
  it('ordina per punti', () => {
    expect(
      sortStandings([s('A', 3, 60), s('B', 6, 50)]).map((r) => r.team_name),
    ).toEqual(['B', 'A'])
  })

  it('a parità di punti contano i fantapunti, poi la differenza reti, poi i gol fatti', () => {
    const rows = [
      s('A', 3, 140, 5),
      s('B', 3, 150, 0),
      s('C', 3, 140, 2, 4),
      s('D', 3, 140, 2, 6),
    ]
    expect(sortStandings(rows).map((r) => r.team_name)).toEqual([
      'B',
      'A',
      'D',
      'C',
    ])
  })

  it('i fantapunti possono arrivare come stringa dal database', () => {
    const rows = [s('A', 0, '70.5' as unknown as number), s('B', 0, 71)]
    expect(sortStandings(rows).map((r) => r.team_name)).toEqual(['B', 'A'])
  })
})
