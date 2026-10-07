// Formazione: moduli, disposizione dei titolari e validazione.
// Gli stessi controlli li ripete il database in save_lineup.
import type { PlayerRole } from './types'

export interface Formation {
  D: number
  C: number
  A: number
}

// "4-4-2" -> { D: 4, C: 4, A: 2 }; null se non è un modulo valido (somma 10)
export function parseFormation(value: string): Formation | null {
  const match = /^([1-9])-([1-9])-([1-9])$/.exec(value)
  if (!match) return null
  const [D, C, A] = match.slice(1).map(Number)
  return D + C + A === 10 ? { D, C, A } : null
}

// Ruolo di ciascuno degli 11 slot: portiere, difensori, centrocampisti, attaccanti
export function formationSlots(value: string): PlayerRole[] {
  const f = parseFormation(value)
  if (!f) return []
  return [
    'P',
    ...Array<PlayerRole>(f.D).fill('D'),
    ...Array<PlayerRole>(f.C).fill('C'),
    ...Array<PlayerRole>(f.A).fill('A'),
  ]
}

interface RoledPlayer {
  id: string
  role: PlayerRole
}

// Mette i giocatori negli slot del modulo, nell'ordine dato.
// Chi non trova posto (es. il 5° difensore passando al 3-5-2) finisce in `leftovers`.
export function arrangeStarters(
  players: RoledPlayer[],
  formation: string,
): { slots: (string | null)[]; leftovers: string[] } {
  const queue = new Map<PlayerRole, string[]>()
  for (const p of players) {
    if (!queue.has(p.role)) queue.set(p.role, [])
    queue.get(p.role)!.push(p.id)
  }
  const slots = formationSlots(formation).map(
    (role) => queue.get(role)?.shift() ?? null,
  )
  const placed = new Set(slots)
  return {
    slots,
    leftovers: players.map((p) => p.id).filter((id) => !placed.has(id)),
  }
}

export interface LineupDraft {
  formation: string
  starters: (string | null)[]
  bench: string[]
}

// Elenco dei problemi (vuoto = formazione valida)
export function validateLineup(
  draft: LineupDraft,
  roster: Map<string, { name: string; role: PlayerRole }>,
  allowedFormations: string[],
): string[] {
  const errors: string[] = []
  const slots = formationSlots(draft.formation)

  if (!slots.length || !allowedFormations.includes(draft.formation)) {
    errors.push(`Modulo ${draft.formation} non consentito`)
    return errors
  }

  const missing =
    draft.starters.filter((id) => id === null).length +
    (slots.length - draft.starters.length)
  if (missing > 0) {
    errors.push(
      missing === 1 ? 'Manca 1 titolare' : `Mancano ${missing} titolari`,
    )
  }

  const all = [...draft.starters, ...draft.bench].filter(
    (id): id is string => id !== null,
  )
  for (const id of all) {
    if (!roster.has(id))
      errors.push('Un giocatore schierato non è più nella tua rosa')
  }
  if (new Set(all).size !== all.length) {
    errors.push('Lo stesso giocatore è inserito più volte')
  }

  draft.starters.forEach((id, i) => {
    const player = id ? roster.get(id) : undefined
    if (player && player.role !== slots[i]) {
      errors.push(`${player.name} non può giocare nello slot ${slots[i]}`)
    }
  })

  return [...new Set(errors)]
}

// Panchina + tutti i giocatori della rosa non ancora usati, nell'ordine della rosa
export function fillBench(
  rosterIds: string[],
  starters: (string | null)[],
  bench: string[],
): string[] {
  const used = new Set([...starters, ...bench])
  return [...bench, ...rosterIds.filter((id) => !used.has(id))]
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const copy = [...items]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}
