// Normalizzazione dei nomi per ricerca e abbinamento:
// minuscolo, senza accenti né punteggiatura, spazi ridotti.

const SPECIAL_LETTERS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

export function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øæœßłđðþı]/g, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Chiave per riconoscere lo stesso giocatore: nome + squadra reale
export function playerKey(name: string, realTeam: string): string {
  return `${normalizeName(name)}|${normalizeName(realTeam)}`
}
