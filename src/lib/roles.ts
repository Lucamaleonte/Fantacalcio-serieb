// Ruoli: etichette e ordinamento (nessuna dipendenza da Supabase, usabile nei test)
import type { Player } from './types'

export const ROLE_LABELS = {
  P: 'Portieri',
  D: 'Difensori',
  C: 'Centrocampisti',
  A: 'Attaccanti',
} as const

const ROLE_ORDER = { P: 0, D: 1, C: 2, A: 3 }

// Ordine classico: portieri, difensori, centrocampisti, attaccanti, poi per nome
export function comparePlayers(a: Player, b: Player): number {
  return (
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    a.name.localeCompare(b.name, 'it')
  )
}
