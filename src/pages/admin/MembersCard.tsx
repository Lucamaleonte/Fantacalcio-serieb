import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card } from '../../components/ui'
import { useCurrentLeague } from '../../hooks/league'
import { useAsyncData } from '../../hooks/useAsyncData'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { MemberRole } from '../../lib/types'

interface Member {
  user_id: string
  team_name: string
  role: MemberRole
  display_name: string
}

async function loadMembers(leagueId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from('league_members')
    .select('user_id, team_name, role')
    .eq('league_id', leagueId)
  if (error) throw error
  const rows = data as Omit<Member, 'display_name'>[]
  const profiles = await supabase
    .from('profiles')
    .select('id, display_name')
    .in(
      'id',
      rows.map((r) => r.user_id),
    )
  if (profiles.error) throw profiles.error
  const names = new Map(
    (profiles.data as { id: string; display_name: string }[]).map((p) => [
      p.id,
      p.display_name,
    ]),
  )
  return rows
    .map((r) => ({ ...r, display_name: names.get(r.user_id) ?? '' }))
    .sort((a, b) => a.team_name.localeCompare(b.team_name, 'it'))
}

export default function MembersCard({ onChanged }: { onChanged: () => void }) {
  const { league } = useCurrentLeague()
  const loader = useCallback(() => loadMembers(league.id), [league.id])
  const { data, error, reload } = useAsyncData(loader)
  const [removing, setRemoving] = useState<Member | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function remove(member: Member) {
    setBusy(true)
    setActionError(null)
    const { error } = await supabase
      .from('league_members')
      .delete()
      .eq('league_id', league.id)
      .eq('user_id', member.user_id)
    if (error) {
      setActionError(errorMessage(error))
    } else {
      setRemoving(null)
      reload()
      onChanged()
    }
    setBusy(false)
  }

  return (
    <Card title={`Membri${data ? ` (${data.length})` : ''}`}>
      {error && <Alert>{error}</Alert>}
      {data && (
        <ul className="divide-y divide-slate-200 dark:divide-slate-800">
          {data.map((m) => (
            <li key={m.user_id} className="py-2">
              <div className="flex min-h-11 items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {m.team_name}
                  </span>
                  <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
                    {m.display_name || '—'}
                    {m.role === 'admin' && ' · admin'}
                  </span>
                </span>
                {m.role !== 'admin' && removing?.user_id !== m.user_id && (
                  <Button
                    variant="danger"
                    className="text-sm"
                    onClick={() => setRemoving(m)}
                  >
                    Rimuovi
                  </Button>
                )}
              </div>
              {removing?.user_id === m.user_id && (
                <div className="mt-2 space-y-2">
                  <Alert kind="info">
                    Rimuovere {m.team_name}? Si cancellano anche la sua rosa (i
                    giocatori tornano svincolati), le formazioni, i punteggi e
                    le sue partite in calendario. Non si può annullare.
                  </Alert>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      className="flex-1"
                      loading={busy}
                      onClick={() => remove(m)}
                    >
                      Sì, rimuovi
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setRemoving(null)}
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {actionError && <Alert>{actionError}</Alert>}
      <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
        Per invitare qualcuno mandagli il codice invito:{' '}
        <Link
          to="/profilo"
          className="font-semibold text-green-700 underline dark:text-green-400"
        >
          {league.invite_code}
        </Link>
      </p>
    </Card>
  )
}
