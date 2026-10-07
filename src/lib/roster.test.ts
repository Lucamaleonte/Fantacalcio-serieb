import { describe, expect, it } from 'vitest'
import {
  parseCost,
  summarizeRoster,
  validateAddition,
  validateCostChange,
  type RosterEntry,
} from './roster'
import type { League, PlayerRole } from './types'

const league = {
  budget: 500,
  n_gk: 3,
  n_def: 8,
  n_mid: 8,
  n_att: 6,
} as League

function entry(role: PlayerRole, cost: number, n = 0): RosterEntry {
  return {
    id: `${role}${n}`,
    user_id: 'u',
    player_id: `p-${role}${n}`,
    cost,
    player: {
      id: `p-${role}${n}`,
      league_id: 'l',
      name: `${role}${n}`,
      role,
      real_team: 'X',
      active: true,
    },
  }
}

describe('summarizeRoster', () => {
  it('somma costi e conta i ruoli', () => {
    const s = summarizeRoster(
      [entry('P', 10), entry('D', 50, 1), entry('D', 40, 2)],
      league,
    )
    expect(s.spent).toBe(100)
    expect(s.remaining).toBe(400)
    expect(s.counts).toEqual({ P: 1, D: 2, C: 0, A: 0 })
    expect(s.limits).toEqual({ P: 3, D: 8, C: 8, A: 6 })
    expect(s.size).toBe(3)
    expect(s.maxSize).toBe(25)
  })

  it('rosa vuota', () => {
    const s = summarizeRoster([], league)
    expect(s.spent).toBe(0)
    expect(s.remaining).toBe(500)
  })
})

describe('parseCost', () => {
  it('accetta solo interi non negativi', () => {
    expect(parseCost('15')).toBe(15)
    expect(parseCost(' 0 ')).toBe(0)
    expect(parseCost('')).toBeNull()
    expect(parseCost('-3')).toBeNull()
    expect(parseCost('2,5')).toBeNull()
    expect(parseCost('abc')).toBeNull()
  })
})

describe('validateAddition', () => {
  it('ok entro budget e limiti', () => {
    const s = summarizeRoster([entry('P', 10)], league)
    expect(validateAddition(s, 'P', 490)).toBeNull()
  })

  it('budget superato', () => {
    const s = summarizeRoster([entry('P', 10)], league)
    expect(validateAddition(s, 'D', 491)).toBe(
      'Budget insufficiente: restano 490 crediti',
    )
  })

  it('ruolo al completo', () => {
    const s = summarizeRoster(
      [entry('P', 1, 1), entry('P', 1, 2), entry('P', 1, 3)],
      league,
    )
    expect(validateAddition(s, 'P', 1)).toBe('Portieri al completo (3/3)')
    expect(validateAddition(s, 'D', 1)).toBeNull()
  })

  it('costo non valido', () => {
    const s = summarizeRoster([], league)
    expect(validateAddition(s, 'A', null)).toContain('Inserisci il costo')
  })
})

describe('validateCostChange', () => {
  it('considera il costo attuale come già disponibile', () => {
    const s = summarizeRoster([entry('P', 100), entry('D', 400, 1)], league)
    // restano 0 crediti, ma il portiere ne libera 100
    expect(validateCostChange(s, 100, 100)).toBeNull()
    expect(validateCostChange(s, 100, 101)).toBe(
      'Budget insufficiente: massimo 100 crediti per questo giocatore',
    )
    expect(validateCostChange(s, 100, 0)).toBeNull()
  })
})
