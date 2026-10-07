import { useEffect, useState, type FormEvent } from 'react'
import PageTitle from '../components/PageTitle'
import { Alert, Button, Card, Field } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useCurrentLeague } from '../hooks/league'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

export default function Profilo() {
  const { session } = useAuth()
  const { league, membership, isAdmin, refresh } = useCurrentLeague()

  return (
    <section className="space-y-4">
      <PageTitle>Profilo</PageTitle>

      <Card title="La tua squadra">
        <TeamNameForm
          leagueId={league.id}
          userId={membership.user_id}
          initial={membership.team_name}
          onSaved={refresh}
        />
      </Card>

      <Card title="Il tuo account">
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {session?.user.email}
        </p>
        <DisplayNameForm userId={membership.user_id} />
      </Card>

      <Card title={league.name}>
        <InviteCode
          leagueId={league.id}
          code={league.invite_code}
          isAdmin={isAdmin}
          onChanged={refresh}
        />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Il tuo ruolo: {isAdmin ? 'admin' : 'membro'}
        </p>
      </Card>

      <Button
        variant="danger"
        className="w-full"
        onClick={() => supabase.auth.signOut()}
      >
        Esci
      </Button>
    </section>
  )
}

function TeamNameForm({
  leagueId,
  userId,
  initial,
  onSaved,
}: {
  leagueId: string
  userId: string
  initial: string
  onSaved: () => Promise<void>
}) {
  const [teamName, setTeamName] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'error' | 'success'
    text: string
  } | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const { error } = await supabase
      .from('league_members')
      .update({ team_name: teamName.trim() })
      .eq('league_id', leagueId)
      .eq('user_id', userId)
    if (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    } else {
      setMessage({ kind: 'success', text: 'Nome squadra salvato' })
      await onSaved()
    }
    setBusy(false)
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Field
        label="Nome squadra"
        value={teamName}
        onChange={(e) => setTeamName(e.target.value)}
        maxLength={40}
        required
      />
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <Button
        type="submit"
        variant="secondary"
        loading={busy}
        disabled={teamName.trim() === initial}
      >
        Salva
      </Button>
    </form>
  )
}

function DisplayNameForm({ userId }: { userId: string }) {
  const [name, setName] = useState('')
  const [saved, setSaved] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'error' | 'success'
    text: string
  } | null>(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.display_name)
          setSaved(data.display_name)
        }
      })
  }, [userId])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    const value = name.trim()
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: value })
      .eq('id', userId)
    if (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    } else {
      setSaved(value)
      setMessage({ kind: 'success', text: 'Nome salvato' })
    }
    setBusy(false)
  }

  return (
    <form className="space-y-3" onSubmit={handleSubmit}>
      <Field
        label="Il tuo nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
      />
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      <Button
        type="submit"
        variant="secondary"
        loading={busy}
        disabled={name.trim() === saved}
      >
        Salva
      </Button>
    </form>
  )
}

function InviteCode({
  leagueId,
  code,
  isAdmin,
  onChanged,
}: {
  leagueId: string
  code: string
  isAdmin: boolean
  onChanged: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Copia non riuscita: seleziona il codice e copialo a mano')
    }
  }

  async function regenerate() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('regenerate_invite_code', {
      p_league_id: leagueId,
    })
    if (error) setError(errorMessage(error))
    else await onChanged()
    setConfirming(false)
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium">Codice invito</span>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-lg font-semibold tracking-widest select-all dark:bg-slate-800">
            {code}
          </code>
          <Button variant="secondary" onClick={copy}>
            {copied ? 'Copiato!' : 'Copia'}
          </Button>
        </div>
        <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
          Mandalo agli amici: lo inseriscono dopo essersi registrati.
        </span>
      </div>

      {isAdmin &&
        (confirming ? (
          <div className="space-y-2">
            <Alert kind="info">
              Il codice attuale smetterà di funzionare. Continuare?
            </Alert>
            <div className="flex gap-2">
              <Button variant="danger" loading={busy} onClick={regenerate}>
                Sì, rigenera
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Annulla
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            Rigenera codice
          </Button>
        ))}

      {error && <Alert>{error}</Alert>}
    </div>
  )
}
