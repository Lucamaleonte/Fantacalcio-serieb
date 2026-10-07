// Parser del CSV giocatori: nome;ruolo;squadra (ruolo = P/D/C/A)
import { detectSeparator, splitLine, textLines } from './csv'
import { normalizeName, playerKey } from './normalize'
import type { PlayerRole } from './types'

export interface PlayerCsvRow {
  line: number
  name: string
  role: PlayerRole
  real_team: string
}

export interface CsvIssue {
  line: number
  text: string
  reason: string
}

export interface ParsedPlayersCsv {
  rows: PlayerCsvRow[]
  errors: CsvIssue[]
}

const ROLE_ALIASES: Record<string, PlayerRole> = {
  p: 'P',
  por: 'P',
  portiere: 'P',
  d: 'D',
  dif: 'D',
  difensore: 'D',
  c: 'C',
  cen: 'C',
  centrocampista: 'C',
  a: 'A',
  att: 'A',
  attaccante: 'A',
}

const HEADER_NAMES = {
  name: ['nome', 'giocatore', 'name', 'calciatore'],
  role: ['ruolo', 'r', 'role'],
  team: ['squadra', 'team', 'club', 'sq'],
}

export function parseRole(value: string): PlayerRole | null {
  return ROLE_ALIASES[normalizeName(value)] ?? null
}

export function parsePlayersCsv(text: string): ParsedPlayersCsv {
  const lines = textLines(text).filter((l) => l.text.trim() !== '')
  const rows: PlayerCsvRow[] = []
  const errors: CsvIssue[] = []
  if (lines.length === 0) return { rows, errors }

  const sep = detectSeparator(lines[0].text)

  // Intestazione opzionale: se presente decide anche l'ordine delle colonne
  let columns = { name: 0, role: 1, team: 2 }
  const headerCells = splitLine(lines[0].text, sep).map(normalizeName)
  const findColumn = (names: string[]) =>
    headerCells.findIndex((c) => names.includes(c))
  if (
    findColumn(HEADER_NAMES.name) >= 0 &&
    findColumn(HEADER_NAMES.role) >= 0
  ) {
    columns = {
      name: findColumn(HEADER_NAMES.name),
      role: findColumn(HEADER_NAMES.role),
      team: findColumn(HEADER_NAMES.team),
    }
    const header = lines.shift()!
    if (columns.team < 0) {
      errors.push({
        line: header.line,
        text: header.text,
        reason: 'Intestazione senza colonna "squadra"',
      })
      return { rows, errors }
    }
  }

  const seen = new Map<string, number>()
  for (const { line, text: raw } of lines) {
    const cells = splitLine(raw, sep)
    const issue = (reason: string) => errors.push({ line, text: raw, reason })

    if (cells.length < 3) {
      issue('Servono 3 colonne: nome;ruolo;squadra')
      continue
    }
    const name = cells[columns.name]?.replace(/\s+/g, ' ').trim() ?? ''
    const roleText = cells[columns.role] ?? ''
    const team = cells[columns.team]?.replace(/\s+/g, ' ').trim() ?? ''
    const role = parseRole(roleText)

    if (!name) issue('Nome mancante')
    else if (name.length > 60) issue('Nome troppo lungo (massimo 60 caratteri)')
    else if (!role) issue(`Ruolo "${roleText}" non valido: usa P, D, C o A`)
    else if (!team) issue('Squadra mancante')
    else if (team.length > 40)
      issue('Squadra troppo lunga (massimo 40 caratteri)')
    else {
      const key = playerKey(name, team)
      const previous = seen.get(key)
      if (previous !== undefined) {
        issue(`Duplicato della riga ${previous}`)
      } else {
        seen.set(key, line)
        rows.push({ line, name, role, real_team: team })
      }
    }
  }

  return { rows, errors }
}
