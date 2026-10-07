# Fantacalcio Serie B

Web app mobile-first per una lega privata di fantacalcio tra amici, con soli giocatori di Serie B.

Stack: Vite + React + TypeScript, Tailwind CSS, Supabase (Auth + Postgres + RLS), GitHub Pages.

## Sviluppo in locale

1. Installa [Node.js](https://nodejs.org) (versione 20 o superiore).
2. Copia `.env.example` in `.env` e inserisci Project URL e chiave publishable/anon di Supabase.
3. Installa le dipendenze e avvia:

   ```sh
   npm install
   npm run dev
   ```

4. Apri l'indirizzo mostrato nel terminale (es. `http://localhost:5173/Fantacalcio-serieb/`).

## Comandi

| Comando          | Cosa fa                                             |
| ---------------- | --------------------------------------------------- |
| `npm run dev`    | Avvia l'app in locale                               |
| `npm run build`  | Controllo dei tipi e build di produzione in `dist/` |
| `npm run lint`   | Controllo del codice (oxlint)                       |
| `npm test`       | Test unitari (Vitest)                               |
| `npm run format` | Formatta il codice (Prettier)                       |

## Sicurezza

- Nel frontend si usa **solo** la chiave publishable/anon di Supabase, mai la secret/`service_role`.
- Il file `.env` non va mai committato (è nel `.gitignore`).
- La protezione dei dati è garantita dalle Row Level Security sul database.

## Database (Supabase)

Le migrazioni sono in `supabase/migrations/`, numerate in ordine. Ogni modifica al database è una **nuova** migrazione: mai modificare quelle già eseguite.

### Eseguire le migrazioni

1. Supabase → **SQL Editor** → **New query**.
2. Apri il primo file non ancora eseguito, copia tutto il contenuto, incollalo e premi **Run**.
3. Ripeti per i file successivi, **in ordine di nome**:
   - `20261007120000_schema.sql` – tabelle e vincoli
   - `20261007120100_functions_triggers.sql` – funzioni interne, trigger (budget, ruoli, calendario)
   - `20261007120200_rpc.sql` – funzioni chiamate dall'app
   - `20261007120300_rls_grants.sql` – Row Level Security, vista classifica, GRANT
   - `20261007120400_fix_grants.sql` – rimuove i permessi automatici sulle tabelle e lascia solo quelli previsti
   - `20261007120500_rosters_admin_only.sql` – le rose le modifica solo l'admin

In alternativa, con la [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` e poi `supabase db push`.

> Se l'integrazione GitHub di Supabase ha il deploy automatico attivo, le migrazioni vengono applicate automaticamente al push su `main`: in quel caso **non** eseguirle anche a mano.

### Verificare la sicurezza

Dopo le migrazioni, esegui `supabase/tests/rls_test.sql` nel SQL Editor. Lo script crea utenti e dati di prova dentro una transazione e alla fine la annulla (non lascia nulla). Se termina senza errori i test sono superati; altrimenti compare `TEST FALLITO: <descrizione>`.

Cosa verifica: un estraneo non vede nulla, il codice invito sbagliato è rifiutato, un membro non modifica nessuna rosa (nemmeno la propria) né le impostazioni della lega, budget/limiti per ruolo/giocatore unico, formazioni valide e chiuse dopo la scadenza (anche via API), visibilità delle formazioni altrui solo dopo la scadenza, voti e punteggi scrivibili solo dall'admin, ricalcolo senza duplicati, utente non loggato senza accesso.

### Regole della lega (default)

| Regola                                | Valore                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| Budget                                | 500                                                                |
| Rosa                                  | 3 P, 8 D, 8 C, 6 A                                                 |
| Moduli                                | 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2                           |
| Sostituzioni massime                  | 5 (stesso ruolo, in ordine di panchina)                            |
| Titolare senza voto e senza sostituto | 0                                                                  |
| Squadra senza formazione              | 0 fantapunti                                                       |
| Giocatore in più squadre              | No                                                                 |
| Classifica                            | Scontri diretti: vittoria 3, pareggio 1, sconfitta 0               |
| Gol                                   | 66 fantapunti = 1 gol, poi +1 ogni 6 punti (72 = 2, 78 = 3…)       |
| Parità in classifica                  | Somma fantapunti, poi differenza reti                              |
| Calendario                            | Girone all'italiana casuale, ripetuto con casa/trasferta invertite |

Budget, rosa, moduli, sostituzioni, valore senza voto e soglie gol si cambiano dalla pagina Admin.

Note:

- Si può creare **una sola lega** per progetto: chi la crea diventa admin, gli altri entrano con il codice invito.
- L'asta si fa dal vivo: **solo l'admin** inserisce e modifica le rose (giocatore + costo pagato). I membri le vedono tutte in sola lettura. Per questo il blocco delle rose previsto dal piano non serve e non compare nell'app.
- Il calendario si genera dopo che sono entrati tutti (Admin → Genera calendario). Se entra qualcuno dopo, va rigenerato: cambiano solo le giornate non ancora calcolate.
- Il calcolo dei punteggi avviene nell'app dell'admin (funzione TypeScript testata) e viene salvato con `save_matchday_results`, che calcola gol e risultati e segna la giornata come calcolata.

## Deploy

Ogni push su `main` pubblica il sito su GitHub Pages tramite `.github/workflows/deploy.yml`:
<https://lucamaleonte.github.io/Fantacalcio-serieb/>

Il workflow legge `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` dalle **Variables** del repository (Settings → Secrets and variables → Actions → Variables).

## Scelte di default

- Lint con **oxlint** (incluso nel template Vite) al posto di ESLint: più veloce e senza configurazione aggiuntiva.
- Tema chiaro/scuro automatico, in base all'impostazione del telefono.

## Licenza

[MIT](LICENSE)
