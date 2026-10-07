// Utility comuni per testi CSV incollati o caricati da file

export type Separator = ';' | '\t' | ','

// Sceglie il separatore più presente nella riga (priorità: tab, punto e virgola, virgola)
export function detectSeparator(line: string): Separator {
  const count = (sep: string) => line.split(sep).length - 1
  if (count('\t') > 0) return '\t'
  if (count(';') > 0) return ';'
  return ','
}

// Divide una riga gestendo i campi tra virgolette ("Rossi; Mario" o "6,5")
export function splitLine(line: string, sep: Separator): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (ch === '"') {
        quoted = false
      } else {
        current += ch
      }
    } else if (ch === '"' && current.trim() === '') {
      quoted = true
      current = ''
    } else if (ch === sep) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

// Righe del testo senza BOM, con numero di riga (da 1)
export function textLines(text: string): { line: number; text: string }[] {
  return text
    .replace(/^﻿/, '')
    .split(/\r\n|\n|\r/)
    .map((value, index) => ({ line: index + 1, text: value }))
}

// Legge un file di testo: UTF-8, oppure Windows-1252 se il file è stato
// salvato da Excel "CSV (delimitato)" e gli accenti risultano illeggibili
export async function readTextFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  if (!utf8.includes('�')) return utf8
  return new TextDecoder('windows-1252').decode(buffer)
}
