// Parser dei voti incollati (es. da fantacalcio.it) o caricati da CSV.
// Colonne: Nome, Squadra, Voto, Fantavoto. Intestazione facoltativa (se c'è
// decide l'ordine delle colonne); separatori ; tab o , ; virgola decimale;
// SV, s.v. e - valgono "senza voto".
import { detectSeparator, splitLine, textLines, type Separator } from './csv'
import { normalizeName } from './normalize'
import type { CsvIssue } from './playersCsv'

export interface VoteRow {
  line: number
  name: string
  team: string
  vote: number | null
  fantavote: number | null
}

export interface ParsedVotes {
  rows: VoteRow[]
  errors: CsvIssue[]
  // Righe con una sola colonna (titoli, nomi di squadra...): ignorate
  ignored: number
}

const NO_VOTE = new Set([
  '',
  'sv',
  's v',
  'nv',
  'ne',
  'n e',
  '-',
  '–',
  '—',
  'x',
])

// Valore di un voto: numero, null (senza voto) o undefined (non valido)
export function parseVoteValue(raw: string): number | null | undefined {
  const text = raw.trim()
  if (NO_VOTE.has(normalizeName(text)) && !/\d/.test(text)) return null
  const number = text.replace(/\s/g, '').replace(',', '.')
  if (!/^[+-]?\d+(\.\d+)?$/.test(number)) return undefined
  return Number(number)
}

const HEADERS = {
  name: ['nome', 'giocatore', 'calciatore', 'name'],
  team: ['squadra', 'team', 'club', 'sq'],
  vote: ['voto', 'v', 'vt', 'voto base', 'vote'],
  fantavote: ['fantavoto', 'fv', 'fanta voto', 'fvoto', 'fantavoti', 'fanta'],
}

interface Columns {
  name: number
  team: number
  vote: number
  fantavote: number
}

function headerColumns(cells: string[]): Columns | null {
  const normalized = cells.map(normalizeName)
  const find = (names: string[]) =>
    normalized.findIndex((c) => names.includes(c))
  const columns = {
    name: find(HEADERS.name),
    team: find(HEADERS.team),
    vote: find(HEADERS.vote),
    fantavote: find(HEADERS.fantavote),
  }
  return columns.name >= 0 && columns.fantavote >= 0 ? columns : null
}

export function parseVotes(text: string): ParsedVotes {
  const lines = textLines(text).filter((l) => l.text.trim() !== '')
  const result: ParsedVotes = { rows: [], errors: [], ignored: 0 }
  if (lines.length === 0) return result

  // Separatore della prima riga con più colonne
  const sample = lines.find(
    (l) => splitLine(l.text, detectSeparator(l.text)).length > 1,
  )
  const sep: Separator = sample ? detectSeparator(sample.text) : ';'

  let columns: Columns = { name: 0, team: 1, vote: 2, fantavote: 3 }
  let hasHeader = false

  for (const { line, text: raw } of lines) {
    const cells = splitLine(raw, sep)
    if (cells.length < 2) {
      result.ignored++
      continue
    }

    const header = headerColumns(cells)
    if (header) {
      columns = header
      hasHeader = true
      continue
    }

    const issue = (reason: string) =>
      result.errors.push({ line, text: raw, reason })
    if (!hasHeader && cells.length < 4) {
      issue('Servono 4 colonne: Nome;Squadra;Voto;Fantavoto')
      continue
    }

    const name = (cells[columns.name] ?? '').replace(/\s+/g, ' ').trim()
    const team = columns.team >= 0 ? (cells[columns.team] ?? '').trim() : ''
    const vote =
      columns.vote >= 0 ? parseVoteValue(cells[columns.vote] ?? '') : null
    const fantavote = parseVoteValue(cells[columns.fantavote] ?? '')

    if (!name) issue('Nome mancante')
    else if (vote === undefined)
      issue(`Voto "${cells[columns.vote]}" non valido`)
    else if (fantavote === undefined)
      issue(`Fantavoto "${cells[columns.fantavote]}" non valido`)
    else if (vote !== null && (vote < 0 || vote > 10))
      issue(`Voto ${vote} fuori scala (0-10)`)
    else result.rows.push({ line, name, team, vote, fantavote })
  }

  return result
}
