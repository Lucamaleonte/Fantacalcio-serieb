// Calendario scontri diretti (nessuna dipendenza da Supabase).
// Stesso algoritmo di private.build_fixtures (girone all'italiana, metodo del
// cerchio): serve a mostrare anche le giornate non ancora create. Se cambia
// uno dei due, va cambiato anche l'altro.

export interface Pairing {
  home: string
  away: string
}

// Squadre ordinate per calendar_position; quelle senza posizione restano fuori
export function calendarTeams(
  members: { user_id: string; calendar_position: number | null }[],
): string[] {
  return members
    .filter((m) => m.calendar_position !== null)
    .sort((a, b) => a.calendar_position! - b.calendar_position!)
    .map((m) => m.user_id)
}

// Giornate di un girone (andata): N-1 con N pari, N con N dispari (un riposo)
export function roundsPerCycle(teamCount: number): number {
  if (teamCount < 2) return 0
  return teamCount % 2 === 0 ? teamCount - 1 : teamCount
}

// Accoppiamenti della giornata `number` (da 1)
export function pairingsForRound(teams: string[], number: number): Pairing[] {
  if (teams.length < 2 || number < 1) return []
  // Numero dispari: si aggiunge un "riposo" (null)
  const slots: (string | null)[] =
    teams.length % 2 === 1 ? [...teams, null] : [...teams]
  const n = slots.length
  const rounds = n - 1
  const round = (number - 1) % rounds
  const cycle = Math.floor((number - 1) / rounds)

  const result: Pairing[] = []
  for (let i = 0; i < n / 2; i++) {
    let a: number
    let b: number
    if (i === 0) {
      // La squadra in ultima posizione resta fissa; alterna casa/trasferta
      a = n - 1
      b = round
      if (round % 2 === 1) [a, b] = [b, a]
    } else {
      a = (round + i) % rounds
      b = (round - i + rounds) % rounds
    }
    // Nel girone di ritorno si invertono casa e trasferta
    const [home, away] =
      cycle % 2 === 1 ? [slots[b], slots[a]] : [slots[a], slots[b]]
    if (home !== null && away !== null) result.push({ home, away })
  }
  return result
}
