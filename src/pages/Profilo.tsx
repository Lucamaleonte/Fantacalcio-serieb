import { useEffect, useState, type FormEvent } from 'react'
import PageTitle from '../components/PageTitle'
import TeamLogo from '../components/TeamLogo'
import { Alert, Button, Card, Field } from '../components/ui'
import { useAuth } from '../hooks/auth'
import { useCurrentLeague } from '../hooks/league'
import { errorMessage } from '../lib/errors'
import { LOGO_BUCKET, logoPath } from '../lib/logo'
import { resizeLogo } from '../lib/logoImage'
import { supabase } from '../lib/supabase'

export default function Profilo() {
  const { session } = useAuth()
  const { league, membership, isAdmin, refresh } = useCurrentLeague()

  return (
    <section className="space-y-4">
      <PageTitle>Profilo</PageTitle>

      <Card title="La tua squadra">
        <LogoForm
          leagueId={league.id}
          userId={membership.user_id}
          teamName={membership.team_name}
          current={membership.logo_path}
          onSaved={refresh}
        />
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

      <p className="text-center text-xs text-slate-500 dark:text-slate-400">
        Versione {__APP_VERSION__} ·{' '}
        {new Date(__BUILD_DATE__).toLocaleString('it-IT', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </section>
  )
}

// Logo della squadra: ridotto nel browser e caricato nella propria cartella
function LogoForm({
  leagueId,
  userId,
  teamName,
  current,
  onSaved,
}: {
  leagueId: string
  userId: string
  teamName: string
  current: string | null
  onSaved: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{
    kind: 'error' | 'success'
    text: string
  } | null>(null)

  async function savePath(path: string | null) {
    const { error } = await supabase
      .from('league_members')
      .update({ logo_path: path })
      .eq('league_id', leagueId)
      .eq('user_id', userId)
    return error
  }

  // Il vecchio file non serve più (se la cancellazione fallisce resta solo un file orfano)
  async function removeOld() {
    if (current) await supabase.storage.from(LOGO_BUCKET).remove([current])
  }

  async function upload(file: File) {
    setBusy(true)
    setMessage(null)
    try {
      const { blob, type } = await resizeLogo(file)
      const path = logoPath(leagueId, userId, Date.now(), type)
      const up = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, blob, { contentType: type, cacheControl: '31536000' })
      if (up.error) throw up.error
      const error = await savePath(path)
      if (error) {
        await supabase.storage.from(LOGO_BUCKET).remove([path])
        throw error
      }
      await removeOld()
      setMessage({ kind: 'success', text: 'Logo salvato' })
      await onSaved()
    } catch (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    }
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    setMessage(null)
    const error = await savePath(null)
    if (error) {
      setMessage({ kind: 'error', text: errorMessage(error) })
    } else {
      await removeOld()
      setMessage({ kind: 'success', text: 'Logo rimosso' })
      await onSaved()
    }
    setBusy(false)
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex items-center gap-4">
        <TeamLogo path={current} name={teamName} size="lg" />
        <div className="flex flex-wrap gap-2">
          <label
            className={`flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-4 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 ${
              busy ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {busy ? 'Attendere…' : current ? 'Cambia logo' : 'Carica logo'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) void upload(file)
              }}
            />
          </label>
          {current && (
            <Button variant="danger" disabled={busy} onClick={remove}>
              Rimuovi
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Si usa il quadrato centrale dell&apos;immagine, ridotto a 256 px.
      </p>
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
    </div>
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
