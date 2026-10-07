# Fantacalcio Serie B

Web app mobile-first (installabile sul telefono) per una lega privata di fantacalcio tra amici, con soli giocatori di Serie B.

**Sito:** <https://lucamaleonte.github.io/Fantacalcio-serieb/>

Cosa fa: login, lega con codice invito, elenco giocatori, rose con costo e budget (inserite dall'admin dopo l'asta dal vivo), formazione con scadenza, import o inserimento a mano dei voti, calcolo dei punteggi, scontri diretti e classifica.

Non fa (per scelta): quotazioni ufficiali, scraping di siti di voti, asta online, scambi, notifiche push, app store.

Stack: Vite + React + TypeScript, Tailwind CSS, Supabase (Auth + Postgres + Row Level Security), GitHub Pages, PWA (`vite-plugin-pwa`).

---

## Indice

1. [Uso quotidiano (admin)](#uso-quotidiano-admin)
2. [Uso per i membri](#uso-per-i-membri)
3. [Installare l'app sul telefono](#installare-lapp-sul-telefono)
4. [Se il sito non carica i dati: progetto Supabase in pausa](#se-il-sito-non-carica-i-dati-progetto-supabase-in-pausa)
5. [Regole della lega](#regole-della-lega)
6. [Setup da zero](#setup-da-zero)
7. [Database](#database)
8. [Sviluppo](#sviluppo)
9. [Sicurezza](#sicurezza)
10. [Scelte e differenze dal piano](#scelte-e-differenze-dal-piano)

---

## Uso quotidiano (admin)

### Prima della stagione

1. **Invita gli amici:** il codice invito è in Home e nel Profilo (pulsante **Copia**). Ognuno si registra sul sito e poi inserisce il codice e il nome della propria squadra.
2. **Importa i giocatori:** Giocatori → **Importa CSV**. Il file deve avere tre colonne `nome;ruolo;squadra`, con ruolo P, D, C o A:

   ```
   nome;ruolo;squadra
   Perin;P;Palermo
   Leali;P;Hellas Verona
   ```

   L'intestazione è facoltativa; vanno bene anche separatori virgola o tab e i file salvati da Excel. L'anteprima mostra i nuovi, i già presenti (saltati) e le righe con errori (con il numero di riga). Conviene scrivere i nomi **come su fantacalcio.it** (es. "Cognome" o "Cognome I."), così l'abbinamento dei voti è automatico. Per un giocatore nuovo a metà stagione: Giocatori → **+ Aggiungi**. Per chi lascia la Serie B: toccalo e togli la spunta **Attivo** (resta nelle rose ma non si può più acquistare).

3. **Inserisci le rose dopo l'asta:** Rosa → scegli la squadra dalla tendina → **+ Aggiungi giocatore** → cerca tra gli svincolati → scrivi il costo → **Aggiungi**. Il pannello resta aperto per il giocatore successivo. Budget e limiti per ruolo sono controllati sia dall'app sia dal database. Toccando un giocatore in rosa puoi cambiarne il costo o toglierlo.
4. **Genera il calendario** quando sono entrati tutti: Admin → **Genera calendario** (ordine estratto a caso). Se entra qualcuno dopo, rigeneralo: cambiano solo le giornate non ancora calcolate.

### Ogni giornata

1. **Crea la giornata:** Admin → Giornate → numero (già proposto) e **scadenza** formazioni (di solito l'orario della prima partita di Serie B del turno). Le partite degli scontri diretti si creano da sole. La scadenza si può modificare finché la giornata non è calcolata.
2. Dopo le partite, **inserisci i voti:** Admin → Giornate → **Voti ›**
   - **Importa:** incolla il testo dei voti (colonne `Nome;Squadra;Voto;Fantavoto`, anche con tab o virgola; vanno bene intestazioni, righe vuote, virgola decimale e `SV`/`s.v.`/`-`) oppure carica un CSV. L'app abbina i nomi ai giocatori (nome + squadra, poi cognome + squadra, poi cognome se unico) e mostra tre gruppi: abbinati, da controllare (scegli il giocatore dal menu o "Ignora") ed errori. Reimportare la stessa giornata sovrascrive i voti.
   - **A mano** (ripiego o correzioni): elenco dei giocatori schierati, squadra per squadra; scrivi il fantavoto, campo vuoto = SV.
3. **Calcola:** scheda **Calcolo** (disponibile dopo la scadenza). Controlla l'anteprima di risultati e punteggi, poi **Salva risultati**. Se correggi un voto, premi **Ricalcola e salva**: la classifica si aggiorna senza duplicati.

### Impostazioni e membri

Admin → **Impostazioni lega** (budget, giocatori per ruolo, moduli, sostituzioni, valore senza voto, soglie dei gol) e **Membri** (rimozione di una squadra: si cancellano anche rosa, formazioni, punteggi e le sue partite).

### Eliminare una giornata

Solo se non è calcolata. Per una giornata già calcolata: Admin → toccala → stato **Aperta** → Salva (esce dalla classifica) → **Elimina giornata**.

## Uso per i membri

- **Home:** prossima giornata, avversario, conto alla rovescia, stato della formazione (inserita / mancante), mini classifica.
- **Giocatori:** ricerca e filtri (ruolo, squadra, svincolati / già presi).
- **Rosa:** la propria e quelle degli altri, in sola lettura.
- **Formazione:** scegli il modulo, tocca gli slot per scegliere i titolari, ordina la panchina (l'ordine decide le sostituzioni) e **Salva**. Dopo la scadenza è in sola lettura e si vedono le formazioni di tutti.
- **Classifica:** punti, partite, gol, fantapunti; risultati di ogni giornata con il dettaglio (titolari, voti, sostituzioni).
- **Profilo:** nome squadra, nome utente, codice invito, versione dell'app, Esci.

## Installare l'app sul telefono

- **Android (Chrome):** apri il sito → menu ⋮ → **Installa app** (o "Aggiungi a schermata Home").
- **iPhone (Safari):** apri il sito → **Condividi** → **Aggiungi alla schermata Home**.

L'app si aggiorna da sola: a ogni nuova versione si ricarica automaticamente quando viene riaperta (o entro 30 minuti se resta aperta). La versione installata è scritta in fondo al **Profilo**. I dati della lega non vengono mai salvati in cache: sono sempre quelli del server.

## Se il sito non carica i dati: progetto Supabase in pausa

Sul piano gratuito Supabase **mette in pausa i progetti senza attività per circa 7 giorni** (per esempio durante una sosta del campionato). L'app mostra "Server non raggiungibile".

Per riattivarlo:

1. Vai su [supabase.com/dashboard](https://supabase.com/dashboard) e apri il progetto (risulta "Paused").
2. Premi **Resume project** (o "Restore") e conferma.
3. Dopo qualche minuto il sito torna a funzionare, con tutti i dati.

Un progetto in pausa si può riattivare dalla dashboard **entro 1 anno**; dopo restano solo i backup scaricabili. Per evitare le pause serve il piano a pagamento. Dettagli: [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## Regole della lega

Valori iniziali (modificabili da Admin → Impostazioni lega, salvo dove indicato):

| Regola                                | Valore                                                               |
| ------------------------------------- | -------------------------------------------------------------------- |
| Budget                                | 500 crediti                                                          |
| Rosa                                  | 3 P, 8 D, 8 C, 6 A                                                   |
| Moduli                                | 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2                             |
| Panchina                              | Senza limite, ordinata                                               |
| Sostituzioni massime                  | 5 (stesso ruolo, primo panchinaro con voto, mai lo stesso due volte) |
| Titolare senza voto e senza sostituto | 0                                                                    |
| Squadra senza formazione              | 0 fantapunti                                                         |
| Voti                                  | Si usa il fantavoto (bonus/malus già inclusi); nessun bonus nell'app |
| Giocatore in più squadre              | No (fisso)                                                           |
| Rose                                  | Le inserisce e modifica solo l'admin (fisso)                         |
| Classifica                            | Scontri diretti: vittoria 3, pareggio 1, sconfitta 0 (fisso)         |
| Gol                                   | 66 fantapunti = 1 gol, poi +1 ogni 6 punti (72 = 2, 78 = 3…)         |
| Parità in classifica                  | Fantapunti totali, poi differenza reti, poi gol fatti (fisso)        |
| Calendario                            | Girone all'italiana casuale, ripetuto invertendo casa/trasferta      |

## Setup da zero

Servono solo per una nuova installazione (questa è già configurata).

1. **GitHub:** crea un repository pubblico. Se il nome è diverso da `Fantacalcio-serieb`, cambia `base` in `vite.config.ts`.
2. **Supabase:** crea un progetto gratuito. Da Project Settings → API annota il **Project URL** e la chiave **publishable** (o `anon`). Mai usare la secret / `service_role`.
3. Supabase → Authentication → Sign In / Providers → **Email** attivo, **Confirm email** disattivato.
4. Supabase → Authentication → URL Configuration: **Site URL** e **Redirect URLs** = `https://<utente>.github.io/<repo>/` (più `http://localhost:5173/<repo>/` per lo sviluppo).
5. Esegui le [migrazioni](#database) e lo script di test.
6. GitHub → Settings → Secrets and variables → Actions → **Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
7. GitHub → Settings → Pages → Source: **GitHub Actions**.
8. Fai un push su `main`: il workflow `.github/workflows/deploy.yml` esegue lint, test e build e pubblica il sito.
9. Registrati sul sito e crea la lega: chi la crea diventa admin (se ne può creare una sola).

## Database

Le migrazioni sono in `supabase/migrations/`, in ordine di nome. Ogni modifica al database è una **nuova** migrazione: mai modificare quelle già eseguite.

| File                                    | Contenuto                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `20261007120000_schema.sql`             | Tabelle e vincoli                                                                  |
| `20261007120100_functions_triggers.sql` | Funzioni interne, trigger (budget, ruoli, giocatore unico, calendario)             |
| `20261007120200_rpc.sql`                | Funzioni chiamate dall'app (lega, invito, calendario, formazione, voti, risultati) |
| `20261007120300_rls_grants.sql`         | Row Level Security, vista `standings`, GRANT                                       |
| `20261007120400_fix_grants.sql`         | Toglie i permessi automatici sulle tabelle e lascia solo quelli previsti           |
| `20261007120500_rosters_admin_only.sql` | Rose modificabili solo dall'admin                                                  |

**Eseguirle:** Supabase → **SQL Editor** → **New query** → incolla il contenuto del file → **Run**, un file alla volta e in ordine. In alternativa, con la [Supabase CLI](https://supabase.com/docs/guides/cli): `supabase link` e `supabase db push`.

> Se l'integrazione GitHub di Supabase ha il deploy automatico attivo, le migrazioni vengono applicate al push su `main`: in quel caso non eseguirle anche a mano.

**Verificare la sicurezza:** esegui `supabase/tests/rls_test.sql` nel SQL Editor. Crea utenti e dati di prova in una transazione e alla fine la annulla (non lascia nulla, non tocca la lega vera). Nessun errore = test superati; altrimenti compare `TEST FALLITO: <descrizione>`. Verifica, tra l'altro: un estraneo non vede nulla, codice invito errato rifiutato, un membro non modifica nessuna rosa né le impostazioni né il proprio ruolo, budget / limiti per ruolo / giocatore unico, formazioni valide e chiuse dopo la scadenza (anche chiamando l'API direttamente), formazioni altrui visibili solo dopo la scadenza, voti e punteggi scrivibili solo dall'admin, ricalcolo senza duplicati, utente non loggato senza accesso.

## Sviluppo

1. Installa [Node.js](https://nodejs.org) 20 o superiore.
2. Copia `.env.example` in `.env` con URL e chiave publishable di Supabase.
3. `npm install` e poi `npm run dev`; apri `http://localhost:5173/Fantacalcio-serieb/`.

| Comando          | Cosa fa                                             |
| ---------------- | --------------------------------------------------- |
| `npm run dev`    | Avvia l'app in locale                               |
| `npm run build`  | Controllo dei tipi e build di produzione in `dist/` |
| `npm run lint`   | Controllo del codice (oxlint)                       |
| `npm test`       | Test unitari (Vitest)                               |
| `npm run format` | Formatta il codice (Prettier)                       |

Struttura:

```
src/
  lib/          logica pura e testata (parser CSV e voti, abbinamento, calcolo,
                formazione, rose, giornate, classifica) + client Supabase
  components/   UI riusabile (layout, barra in basso, pannelli, campo...)
  hooks/        sessione, lega corrente, caricamento dati, orologio
  pages/        una pagina per schermata; pages/admin/ per le pagine admin
supabase/
  migrations/   SQL numerati
  tests/        script di test delle policy
```

I moduli in `src/lib` usati dai test non devono importare il client Supabase: in CI i test girano senza variabili d'ambiente.

## Sicurezza

- Nel frontend c'è **solo** la chiave publishable/anon di Supabase; nessun segreto nel repository (`.env` è nel `.gitignore`).
- La protezione dei dati è garantita **solo** dal database: Row Level Security su ogni tabella, GRANT espliciti per colonna, trigger per i vincoli e funzioni `security definer` che controllano chi le chiama. Il sito è pubblico; i dati li vede solo chi è loggato e membro della lega.
- Formazioni, voti e risultati si scrivono solo tramite le funzioni RPC, che ripetono tutti i controlli (scadenza compresa, con l'orario del server).

## Scelte e differenze dal piano

- **Classifica a scontri diretti** (invece che a punti totali), con calendario automatico e conversione fantapunti → gol.
- **Rose solo admin:** l'asta è dal vivo e l'admin inserisce tutto; il blocco delle rose non serve.
- **Una sola lega** per progetto, per evitare che sconosciuti ne creino altre.
- **Calcolo nell'app dell'admin** (funzione TypeScript pura e testata); il database salva i punteggi e calcola gol, risultati e classifica.
- **Inserimento manuale dei voti** come ripiego all'import.
- **Lint con oxlint** (incluso nel template Vite) invece di ESLint.
- Tema chiaro/scuro automatico, in base al telefono.

## Licenza

[MIT](LICENSE)
