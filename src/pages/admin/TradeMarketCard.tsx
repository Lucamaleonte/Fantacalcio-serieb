import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card } from '../../components/ui'
import { useCurrentLeague } from '../../hooks/league'
import { errorMessage } from '../../lib/errors'
import { supabase } from '../../lib/supabase'

// Apre e chiude il mercato scambi (Admin e pagina Mercato)
export default function TradeMarketCard({
  onChanged,
  showLink = false,
}: {
  onChanged?: () => void
  showLink?: boolean
}) {
  const { league, refresh } = useCurrentLeague()
  const open = league.trade_market_open
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.rpc('set_trade_market', {
      p_league_id: league.id,
      p_open: !open,
    })
    if (error) {
      setError(errorMessage(error))
    } else {
      await refresh()
      onChanged?.()
    }
    setConfirming(false)
    setBusy(false)
  }

  return (
    <Card title="Mercato scambi">
      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
        {open
          ? 'Aperto: le squadre possono proporsi scambi e accettarli.'
          : 'Chiuso: nessuno può proporre o accettare scambi.'}
      </p>

      {confirming ? (
        <div className="space-y-2">
          <Alert kind="info">
            Chiudere il mercato? Le proposte ancora in attesa decadono; gli
            scambi già eseguiti restano.
          </Alert>
          <div className="flex gap-2">
            <Button variant="danger" loading={busy} onClick={toggle}>
              Sì, chiudi
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annulla
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={open ? 'danger' : 'primary'}
            loading={busy}
            onClick={() => (open ? setConfirming(true) : void toggle())}
          >
            {open ? 'Chiudi mercato' : 'Apri mercato'}
          </Button>
          {showLink && (
            <Link
              to="/mercato"
              className="text-sm font-semibold text-green-700 underline dark:text-green-400"
            >
              Vai al mercato
            </Link>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert>{error}</Alert>
        </div>
      )}
    </Card>
  )
}
