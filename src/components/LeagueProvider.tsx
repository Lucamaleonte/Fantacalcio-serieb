import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { LeagueContext } from '../hooks/league'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import type { League, Membership } from '../lib/types'

type MembershipRow = Membership & { leagues: League }

interface LeagueData {
  error: string | null
  league: League | null
  membership: Membership | null
}

// La lega dell'utente (l'app ne gestisce una sola)
async function fetchLeague(userId: string): Promise<LeagueData> {
  const { data, error } = await supabase
    .from('league_members')
    .select('league_id, user_id, team_name, role, leagues(*)')
    .eq('user_id', userId)
    .order('joined_at')
    .limit(1)
    .maybeSingle<MembershipRow>()

  if (error)
    return { error: errorMessage(error), league: null, membership: null }
  if (!data) return { error: null, league: null, membership: null }
  return {
    error: null,
    league: data.leagues,
    membership: {
      league_id: data.league_id,
      user_id: data.user_id,
      team_name: data.team_name,
      role: data.role,
    },
  }
}

export default function LeagueProvider({
  userId,
  children,
}: {
  userId: string
  children: ReactNode
}) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LeagueData>({
    error: null,
    league: null,
    membership: null,
  })

  useEffect(() => {
    let active = true
    fetchLeague(userId).then((result) => {
      if (!active) return
      setData(result)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [userId])

  const refresh = useCallback(async () => {
    setData(await fetchLeague(userId))
  }, [userId])

  return (
    <LeagueContext.Provider
      value={{
        loading,
        ...data,
        isAdmin: data.membership?.role === 'admin',
        refresh,
      }}
    >
      {children}
    </LeagueContext.Provider>
  )
}
