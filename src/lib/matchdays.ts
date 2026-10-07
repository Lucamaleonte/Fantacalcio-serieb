// Giornate: stato, giornata corrente e formattazione delle date (nessuna dipendenza da Supabase)
import type { Matchday } from './types'

// La formazione si può cambiare solo se la giornata è aperta e la scadenza non è passata
export function isLineupOpen(matchday: Matchday, now: Date): boolean {
  return (
    matchday.status === 'open' &&
    now.getTime() < new Date(matchday.deadline).getTime()
  )
}

// Giornata da mostrare di default:
// 1) la prossima aperta con scadenza futura (la più vicina)
// 2) altrimenti l'ultima giornata (numero più alto)
export function pickCurrentMatchday(
  matchdays: Matchday[],
  now: Date,
): Matchday | null {
  const upcoming = matchdays
    .filter((m) => isLineupOpen(m, now))
    .sort(
      (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
    )
  if (upcoming.length) return upcoming[0]
  return [...matchdays].sort((a, b) => b.number - a.number)[0] ?? null
}

export function nextMatchdayNumber(matchdays: Matchday[]): number {
  return matchdays.reduce((max, m) => Math.max(max, m.number), 0) + 1
}

// "2 g 4 h", "3 h 12 min", "12 min 30 s"
export function formatCountdown(ms: number): string {
  if (ms <= 0) return 'scaduta'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days} g ${hours} h`
  if (hours > 0) return `${hours} h ${minutes} min`
  return `${minutes} min ${seconds} s`
}

// "ven 12 ott, 20:30" nel fuso orario del dispositivo
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString('it-IT', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Valore per <input type="datetime-local"> (ora locale) e viceversa
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDateTimeLocal(value: string): string | null {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export const STATUS_LABELS = {
  open: 'Aperta',
  locked: 'Chiusa',
  scored: 'Calcolata',
} as const
