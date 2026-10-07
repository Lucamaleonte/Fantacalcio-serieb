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
| `npm run format` | Formatta il codice (Prettier)                       |

## Sicurezza

- Nel frontend si usa **solo** la chiave publishable/anon di Supabase, mai la secret/`service_role`.
- Il file `.env` non va mai committato (è nel `.gitignore`).
- La protezione dei dati è garantita dalle Row Level Security sul database.

## Deploy

Ogni push su `main` pubblica il sito su GitHub Pages tramite `.github/workflows/deploy.yml`:
<https://lucamaleonte.github.io/Fantacalcio-serieb/>

Il workflow legge `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` dalle **Variables** del repository (Settings → Secrets and variables → Actions → Variables).

## Scelte di default

- Lint con **oxlint** (incluso nel template Vite) al posto di ESLint: più veloce e senza configurazione aggiuntiva.
- Tema chiaro/scuro automatico, in base all'impostazione del telefono.

## Licenza

[MIT](LICENSE)
