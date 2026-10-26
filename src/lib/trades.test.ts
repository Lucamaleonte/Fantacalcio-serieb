import { describe, expect, it } from 'vitest'
import {
  formatDelta,
  groupTrades,
  playersGivenBy,
  tradeRoleProblem,
  valueChange,
  type Trade,
} from './trades'

const limits = { P: 3, D: 8, C: 8, A: 6 }
const full = { P: 3, D: 8, C: 8, A: 6 }

describe('tradeRoleProblem', () => {
  const me = { name: 'Squadra A', counts: full }
  const other = { name: 'Squadra B', counts: full }

  it('rose piene: scambio alla pari per ruolo', () => {
    expect(
      tradeRoleProblem(me, other, limits, [{ role: 'D' }], [{ role: 'D' }]),
    ).toBeNull()
    expect(
      tradeRoleProblem(
        me,
        other,
        limits,
        [{ role: 'C' }, { role: 'A' }],
        [{ role: 'A' }, { role: 'C' }],
      ),
    ).toBeNull()
  })

  it('rose piene: ruoli diversi non si possono scambiare', () => {
    expect(
      tradeRoleProblem(me, other, limits, [{ role: 'D' }], [{ role: 'C' }]),
    ).toBe('Squadra A avrebbe 9 centrocampisti (massimo 8)')
  })

  it('controlla anche la rosa dell’altra squadra', () => {
    const roomy = { name: 'Squadra A', counts: { ...full, C: 7 } }
    expect(
      tradeRoleProblem(roomy, other, limits, [{ role: 'D' }], [{ role: 'C' }]),
    ).toBe('Squadra B avrebbe 9 difensori (massimo 8)')
  })

  it('con posti liberi si può ricevere più di quanto si dà', () => {
    const roomy = { name: 'Squadra A', counts: { ...full, A: 4 } }
    expect(
      tradeRoleProblem(
        roomy,
        other,
        limits,
        [{ role: 'A' }],
        [{ role: 'A' }, { role: 'A' }],
      ),
    ).toBeNull()
  })

  it('una rosa già oltre il limite non blocca uno scambio che non la peggiora', () => {
    const over = { name: 'Squadra A', counts: { ...full, D: 9 } }
    expect(
      tradeRoleProblem(over, other, limits, [{ role: 'D' }], [{ role: 'D' }]),
    ).toBeNull()
  })
})

describe('valueChange e formatDelta', () => {
  it('differenza tra costi ricevuti e ceduti', () => {
    expect(valueChange([{ cost: 1 }], [{ cost: 7 }])).toBe(6)
    expect(valueChange([{ cost: 7 }, { cost: 3 }], [{ cost: 1 }])).toBe(-9)
    expect(formatDelta(6)).toBe('+6')
    expect(formatDelta(-9)).toBe('−9')
    expect(formatDelta(0)).toBe('0')
  })
})

function trade(
  id: string,
  status: Trade['status'],
  proposer: string,
  receiver: string,
  created: string,
  decided: string | null = null,
): Trade {
  return {
    id,
    proposer_id: proposer,
    receiver_id: receiver,
    status,
    message: null,
    created_at: created,
    decided_at: decided,
    cancelled_at: null,
    trade_players: [
      {
        player_id: 'p1',
        from_user_id: proposer,
        cost: 1,
        player: {
          id: 'p1',
          league_id: 'l',
          name: 'Uno',
          role: 'D',
          real_team: 'X',
          active: true,
        },
      },
      {
        player_id: 'p2',
        from_user_id: receiver,
        cost: 7,
        player: {
          id: 'p2',
          league_id: 'l',
          name: 'Due',
          role: 'D',
          real_team: 'Y',
          active: true,
        },
      },
    ],
  }
}

describe('groupTrades', () => {
  it('separa ricevute, inviate e storico', () => {
    const g = groupTrades(
      [
        trade('1', 'pending', 'me', 'x', '2026-10-01'),
        trade('2', 'pending', 'x', 'me', '2026-10-03'),
        trade('3', 'pending', 'x', 'me', '2026-10-02'),
        trade('4', 'accepted', 'x', 'y', '2026-09-01', '2026-10-05'),
        trade('5', 'rejected', 'me', 'x', '2026-09-20', '2026-09-21'),
      ],
      'me',
    )
    expect(g.received.map((t) => t.id)).toEqual(['2', '3'])
    expect(g.sent.map((t) => t.id)).toEqual(['1'])
    expect(g.history.map((t) => t.id)).toEqual(['4', '5'])
  })

  it('giocatori ceduti da ciascuna squadra', () => {
    const t = trade('1', 'pending', 'me', 'x', '2026-10-01')
    expect(playersGivenBy(t, 'me').map((p) => p.player.name)).toEqual(['Uno'])
    expect(playersGivenBy(t, 'x').map((p) => p.player.name)).toEqual(['Due'])
  })
})
