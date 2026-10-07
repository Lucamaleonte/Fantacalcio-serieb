import { describe, expect, it } from 'vitest'
import { settingsForm, validateSettings } from './leagueSettings'
import type { League } from './types'

const league = {
  id: 'l',
  name: 'Lega',
  invite_code: 'X',
  admin_id: 'a',
  budget: 500,
  n_gk: 3,
  n_def: 8,
  n_mid: 8,
  n_att: 6,
  allowed_formations: ['4-4-2', '3-5-2'],
  max_substitutions: 5,
  no_vote_value: 0,
  goal_threshold: 66,
  goal_step: 6,
  rosters_locked: false,
} satisfies League

describe('settingsForm / validateSettings', () => {
  it('andata e ritorno senza modifiche', () => {
    const result = validateSettings(settingsForm(league))
    expect(result.errors).toEqual([])
    expect(result.values).toMatchObject({
      name: 'Lega',
      budget: 500,
      allowed_formations: ['4-4-2', '3-5-2'],
      goal_threshold: 66,
    })
  })

  it('accetta la virgola decimale', () => {
    const form = {
      ...settingsForm(league),
      no_vote_value: '4,5',
      goal_step: '5,5',
    }
    expect(validateSettings(form).values).toMatchObject({
      no_vote_value: 4.5,
      goal_step: 5.5,
    })
  })

  it('segnala valori non validi', () => {
    const form = {
      ...settingsForm(league),
      name: ' ',
      budget: '0',
      n_def: '2,5',
      max_substitutions: '12',
      goal_threshold: '0',
      allowed_formations: [],
    }
    expect(validateSettings(form).errors).toEqual([
      'Nome della lega: da 1 a 60 caratteri',
      'Budget: numero intero tra 1 e 100000',
      'Difensori: numero intero tra 1 e 20',
      'Sostituzioni massime: numero intero tra 0 e 11',
      'Soglia del primo gol: numero maggiore di 0',
      'Scegli almeno un modulo',
    ])
  })
})
