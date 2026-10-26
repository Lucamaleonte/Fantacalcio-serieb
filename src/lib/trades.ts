// Mercato scambi: controlli prima di proporre e raggruppamento delle proposte.
// Gli stessi controlli li ripete il database (migrazione 10, propose_trade).
import type { RoleCounts } from './roster'
import type { Player, PlayerRole } from './types'

export type TradeStatus =
  'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'cancelled'

export interface TradePlayer {
  player_id: string
  from_user_id: string
  cost: number
  player: Player
}

export interface Trade {
  id: string
  proposer_id: string
  receiver_id: string
  status: TradeStatus
  message: string | null
  created_at: string
  decided_at: string | null
  cancelled_at: string | null
  trade_players: TradePlayer[]
}

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  pending: 'In attesa',
  accepted: 'Eseguito',
  rejected: 'Rifiutato',
  withdrawn: 'Ritirato',
  expired: 'Decaduto',
  cancelled: 'Annullato dall’admin',
}

const ROLE_PLURAL: Record<PlayerRole, string> = {
  P: 'portieri',
  D: 'difensori',
  C: 'centrocampisti',
  A: 'attaccanti',
}

const ROLES: PlayerRole[] = ['P', 'D', 'C', 'A']

interface Side {
  name: string
  counts: RoleCounts
}

// Limiti per ruolo dopo lo scambio: messaggio d'errore o null se va bene.
// Conta solo i ruoli in cui una squadra riceve più giocatori di quanti ne cede.
export function tradeRoleProblem(
  me: Side,
  other: Side,
  limits: RoleCounts,
  give: Pick<Player, 'role'>[],
  get: Pick<Player, 'role'>[],
): string | null {
  const count = (list: Pick<Player, 'role'>[], role: PlayerRole) =>
    list.filter((p) => p.role === role).length
  for (const [side, incoming, outgoing] of [
    [me, get, give],
    [other, give, get],
  ] as const) {
    for (const role of ROLES) {
      const delta = count(incoming, role) - count(outgoing, role)
      const total = side.counts[role] + delta
      if (delta > 0 && total > limits[role]) {
        return `${side.name} avrebbe ${total} ${ROLE_PLURAL[role]} (massimo ${limits[role]})`
      }
    }
  }
  return null
}

// Variazione del valore rosa di chi dà `give` e riceve `get` (costi d'asta)
export function valueChange(
  give: { cost: number }[],
  get: { cost: number }[],
): number {
  const sum = (list: { cost: number }[]) => list.reduce((s, x) => s + x.cost, 0)
  return sum(get) - sum(give)
}

// "+6", "−4", "0"
export function formatDelta(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${-n}`
  return '0'
}

// Proposte ricevute e inviate in attesa, poi lo storico (più recenti prima)
export function groupTrades(trades: Trade[], me: string) {
  const byDate = [...trades].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )
  return {
    received: byDate.filter(
      (t) => t.status === 'pending' && t.receiver_id === me,
    ),
    sent: byDate.filter((t) => t.status === 'pending' && t.proposer_id === me),
    history: byDate
      .filter((t) => t.status !== 'pending')
      .sort((a, b) =>
        (b.decided_at ?? b.created_at).localeCompare(
          a.decided_at ?? a.created_at,
        ),
      ),
  }
}

// Giocatori che una squadra cede nello scambio
export function playersGivenBy(trade: Trade, userId: string): TradePlayer[] {
  return trade.trade_players.filter((p) => p.from_user_id === userId)
}
