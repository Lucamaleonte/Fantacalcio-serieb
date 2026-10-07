// Impostazioni della lega modificabili dall'admin: lettura dal modulo e controlli.
// Gli stessi limiti sono vincoli (check) nel database.
import { parseFormation } from './lineup'
import type { League } from './types'

export const FORMATION_OPTIONS = [
  '3-4-3',
  '3-5-2',
  '3-6-1',
  '4-3-3',
  '4-4-2',
  '4-5-1',
  '5-3-2',
  '5-4-1',
]

export type SettingsForm = Record<
  | 'name'
  | 'budget'
  | 'n_gk'
  | 'n_def'
  | 'n_mid'
  | 'n_att'
  | 'max_substitutions'
  | 'no_vote_value'
  | 'goal_threshold'
  | 'goal_step',
  string
> & { allowed_formations: string[] }

export type SettingsValues = Pick<
  League,
  | 'name'
  | 'budget'
  | 'n_gk'
  | 'n_def'
  | 'n_mid'
  | 'n_att'
  | 'allowed_formations'
  | 'max_substitutions'
  | 'no_vote_value'
  | 'goal_threshold'
  | 'goal_step'
>

export function settingsForm(league: League): SettingsForm {
  const text = (n: number) => String(n).replace('.', ',')
  return {
    name: league.name,
    budget: text(league.budget),
    n_gk: text(league.n_gk),
    n_def: text(league.n_def),
    n_mid: text(league.n_mid),
    n_att: text(league.n_att),
    allowed_formations: [...league.allowed_formations],
    max_substitutions: text(league.max_substitutions),
    no_vote_value: text(Number(league.no_vote_value)),
    goal_threshold: text(Number(league.goal_threshold)),
    goal_step: text(Number(league.goal_step)),
  }
}

function integer(value: string): number | null {
  return /^\d+$/.test(value.trim()) ? Number(value.trim()) : null
}

function decimal(value: string): number | null {
  const v = value.trim().replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : null
}

// Valori pronti da salvare, oppure l'elenco degli errori
export function validateSettings(
  form: SettingsForm,
): { values: SettingsValues; errors: [] } | { values: null; errors: string[] } {
  const errors: string[] = []
  const int = (label: string, value: string, min: number, max: number) => {
    const n = integer(value)
    if (n === null || n < min || n > max) {
      errors.push(`${label}: numero intero tra ${min} e ${max}`)
      return 0
    }
    return n
  }

  const name = form.name.trim()
  if (!name || name.length > 60)
    errors.push('Nome della lega: da 1 a 60 caratteri')

  const budget = int('Budget', form.budget, 1, 100000)
  const n_gk = int('Portieri', form.n_gk, 1, 10)
  const n_def = int('Difensori', form.n_def, 1, 20)
  const n_mid = int('Centrocampisti', form.n_mid, 1, 20)
  const n_att = int('Attaccanti', form.n_att, 1, 20)
  const max_substitutions = int(
    'Sostituzioni massime',
    form.max_substitutions,
    0,
    11,
  )

  const no_vote_value = decimal(form.no_vote_value)
  if (no_vote_value === null)
    errors.push('Valore senza voto: numero (es. 0 o 4,5)')

  const goal_threshold = decimal(form.goal_threshold)
  if (goal_threshold === null || goal_threshold <= 0) {
    errors.push('Soglia del primo gol: numero maggiore di 0')
  }
  const goal_step = decimal(form.goal_step)
  if (goal_step === null || goal_step <= 0)
    errors.push('Punti per ogni gol in più: numero maggiore di 0')

  const allowed_formations = form.allowed_formations.filter((f) =>
    parseFormation(f),
  )
  if (allowed_formations.length === 0) errors.push('Scegli almeno un modulo')

  if (errors.length) return { values: null, errors }
  return {
    values: {
      name,
      budget,
      n_gk,
      n_def,
      n_mid,
      n_att,
      allowed_formations,
      max_substitutions,
      no_vote_value: no_vote_value!,
      goal_threshold: goal_threshold!,
      goal_step: goal_step!,
    },
    errors: [],
  }
}
