import { createContext, useContext } from 'react'
import type { League, Membership } from '../lib/types'

export interface LeagueState {
  loading: boolean
  error: string | null
  league: League | null
  membership: Membership | null
  isAdmin: boolean
  refresh: () => Promise<void>
}

export const LeagueContext = createContext<LeagueState | null>(null)

export function useLeague() {
  const value = useContext(LeagueContext)
  if (!value) throw new Error('useLeague va usato dentro LeagueProvider')
  return value
}

// Da usare nelle pagine che esistono solo quando l'utente è in una lega
export function useCurrentLeague() {
  const { league, membership, isAdmin, refresh } = useLeague()
  if (!league || !membership) throw new Error('Nessuna lega selezionata')
  return { league, membership, isAdmin, refresh }
}
