import { useState, type FormEvent } from 'react'
import { errorMessage } from '../lib/errors'
import { ROLE_LABELS } from '../lib/players'
import { supabase } from '../lib/supabase'
import type { Player, PlayerRole } from '../lib/types'
import { Alert, Button, Field, Select } from './ui'

// Aggiunta o modifica di un singolo giocatore (solo admin)
export default function PlayerForm({
  leagueId,
  player,
  teams,
  onSaved,
  onCancel,
}: {
  leagueId: string
  player: Player | null
  teams: string[]
  onSaved: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(player?.name ?? '')
  const [role, setRole] = useState<PlayerRole>(player?.role ?? 'P')
  const [realTeam, setRealTeam] = useState(player?.real_team ?? '')
  const [active, setActive] = useState(player?.active ?? true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const values = {
      name: name.replace(/\s+/g, ' ').trim(),
      role,
      real_team: realTeam.replace(/\s+/g, ' ').trim(),
    }
    const { error } = player
      ? await supabase
          .from('players')
          .update({ ...values, active })
          .eq('id', player.id)
      : await supabase
          .from('players')
          .insert({ ...values, league_id: leagueId })

    if (error) {
      setError(errorMessage(error))
      setBusy(false)
    } else {
      onSaved()
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <Field
        label="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        hint="Come scritto su fantacalcio.it (es. Cognome o Cognome I.)"
        required
      />
      <Select
        label="Ruolo"
        value={role}
        onChange={(e) => setRole(e.target.value as PlayerRole)}
      >
        {(Object.keys(ROLE_LABELS) as PlayerRole[]).map((r) => (
          <option key={r} value={r}>
            {r} – {ROLE_LABELS[r]}
          </option>
        ))}
      </Select>
      <Field
        label="Squadra di Serie B"
        value={realTeam}
        onChange={(e) => setRealTeam(e.target.value)}
        list="real-teams"
        maxLength={40}
        required
      />
      <datalist id="real-teams">
        {teams.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      {player && (
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-green-600"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          <span>
            Attivo
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Togli la spunta se il giocatore ha lasciato la Serie B: non si
              potrà più acquistare.
            </span>
          </span>
        </label>
      )}

      {error && <Alert>{error}</Alert>}

      <div className="flex gap-2">
        <Button type="submit" loading={busy} className="flex-1">
          {player ? 'Salva' : 'Aggiungi'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Annulla
        </Button>
      </div>
    </form>
  )
}
