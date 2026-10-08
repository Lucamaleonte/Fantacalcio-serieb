// Loghi delle squadre: calcoli puri (nessuna dipendenza da Supabase o dal DOM)

export const LOGO_BUCKET = 'team-logos'
export const LOGO_SIZE = 256
// Prima del ridimensionamento: oltre questa dimensione il file non si legge
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024

// Quadrato centrale più grande dell'immagine (ritaglio "cover")
export function coverCrop(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  }
}

// Ogni caricamento ha un nome nuovo: niente problemi di cache
export function logoPath(
  leagueId: string,
  userId: string,
  timestamp: number,
  type: 'image/webp' | 'image/png',
): string {
  const ext = type === 'image/webp' ? 'webp' : 'png'
  return `${leagueId}/${userId}/${timestamp}.${ext}`
}

// Iniziali per il segnaposto: "Real Madrink" -> "RM", "Atletico" -> "AT"
export function teamInitials(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

// Colore stabile del segnaposto, scelto dal nome
const PLACEHOLDER_COLORS = [
  'bg-green-600',
  'bg-blue-600',
  'bg-red-600',
  'bg-amber-500',
  'bg-purple-600',
  'bg-teal-600',
  'bg-pink-600',
  'bg-slate-600',
] as const

export function placeholderColor(name: string): string {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length]
}
