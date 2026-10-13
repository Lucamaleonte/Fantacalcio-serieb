// Bonus e malus di un voto (gol, assist, cartellini...) e icone per mostrarli.
// Stesse chiavi di private.clean_vote_events nel database.

export const EVENT_KEYS = [
  'gol',
  'assist',
  'amm',
  'esp',
  'gs',
  'pi',
  'rp',
  'rs',
  'au',
] as const

export type EventKey = (typeof EVENT_KEYS)[number]

// Chiavi assenti = 0
export type VoteEvents = Partial<Record<EventKey, number>>

const EVENTS: Record<EventKey, { icon: string; label: string }> = {
  gol: { icon: '⚽', label: 'Gol' },
  assist: { icon: '👟', label: 'Assist' },
  pi: { icon: '🧤', label: 'Porta inviolata' },
  rp: { icon: '✋', label: 'Rigore parato' },
  amm: { icon: '🟨', label: 'Ammonizione' },
  esp: { icon: '🟥', label: 'Espulsione' },
  gs: { icon: '❌', label: 'Gol subito' },
  rs: { icon: '🚫', label: 'Rigore sbagliato' },
  au: { icon: '🔙', label: 'Autogol' },
}

// Ordine delle icone: prima i bonus, poi i malus
const ORDER: EventKey[] = [
  'gol',
  'assist',
  'pi',
  'rp',
  'amm',
  'esp',
  'gs',
  'rs',
  'au',
]

// Oltre questo numero l'icona non si ripete: "❌×5"
const MAX_REPEAT = 3

export interface EventIcon {
  key: EventKey
  text: string
  label: string
}

export function eventIcons(events: VoteEvents | null | undefined): EventIcon[] {
  if (!events) return []
  return ORDER.flatMap((key) => {
    const count = events[key] ?? 0
    if (!Number.isInteger(count) || count < 1) return []
    const { icon, label } = EVENTS[key]
    return [
      {
        key,
        text: count > MAX_REPEAT ? `${icon}×${count}` : icon.repeat(count),
        label: count > 1 ? `${label} ×${count}` : label,
      },
    ]
  })
}

// Colonne facoltative del file dei voti (intestazioni normalizzate)
export const EVENT_HEADERS: Record<EventKey, string[]> = {
  gol: ['gol', 'gf', 'gol fatti', 'reti'],
  assist: ['assist', 'ass', 'as'],
  amm: ['amm', 'ammonizioni', 'ammonizione', 'gialli', 'am'],
  esp: ['esp', 'espulsioni', 'espulsione', 'rossi', 'es'],
  gs: ['gs', 'gol subiti'],
  pi: ['pi', 'porta inviolata'],
  rp: ['rp', 'rigori parati', 'rigore parato'],
  rs: ['rs', 'rigori sbagliati', 'rigore sbagliato'],
  au: ['au', 'aut', 'autogol', 'autoreti'],
}

// Numero di eventi in una cella: vuoto o "-" = 0; undefined se non valido
export function parseEventCount(raw: string): number | undefined {
  const text = raw.trim()
  if (text === '' || /^[-–—]$/.test(text)) return 0
  if (!/^\d{1,2}$/.test(text)) return undefined
  const value = Number(text)
  return value <= 20 ? value : undefined
}
