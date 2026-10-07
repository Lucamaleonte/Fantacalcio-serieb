// Traduce gli errori di Supabase in messaggi leggibili in italiano.
// Gli errori sollevati dalle nostre funzioni SQL sono già in italiano
// e vengono mostrati così come sono.

const KNOWN_ERRORS: [RegExp, string][] = [
  [/invalid login credentials/i, 'Email o password non corrette'],
  [/user already registered/i, 'Esiste già un account con questa email'],
  [/password should be at least/i, 'La password deve avere almeno 6 caratteri'],
  [/weak.?password/i, 'Password troppo debole: usane una più lunga'],
  [
    /unable to validate email|invalid.*email|email.*invalid/i,
    'Indirizzo email non valido',
  ],
  [/email not confirmed/i, 'Email non ancora confermata: controlla la posta'],
  [
    /rate limit|too many requests/i,
    'Troppi tentativi: riprova tra qualche minuto',
  ],
  [
    /signups? not allowed|signup.*disabled/i,
    'Le registrazioni sono disattivate',
  ],
  [
    /failed to fetch|networkerror|load failed/i,
    'Server non raggiungibile: controlla la connessione e riprova',
  ],
  [/row-level security|permission denied/i, 'Operazione non consentita'],
  [/league_members_league_id_team_name_key/i, 'Nome squadra già usato'],
  [
    /players_league_id_name_real_team_key/i,
    'Esiste già un giocatore con questo nome in questa squadra',
  ],
  [
    /matchdays_league_id_number_key/i,
    'Esiste già una giornata con questo numero',
  ],
  [
    /matchdays_number_check/i,
    'Il numero della giornata deve essere tra 1 e 60',
  ],
  [/duplicate key/i, 'Elemento già presente'],
]

export function errorMessage(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : String(error)

  for (const [pattern, text] of KNOWN_ERRORS) {
    if (pattern.test(message)) return text
  }
  return message || 'Si è verificato un errore imprevisto'
}
