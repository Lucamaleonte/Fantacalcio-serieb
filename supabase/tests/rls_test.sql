-- =============================================================
-- Test di sicurezza (RLS, trigger, RPC)
-- =============================================================
-- Come usarlo: Supabase -> SQL Editor -> incolla tutto -> Run.
-- Gira dentro una transazione annullata alla fine (ROLLBACK):
-- non lascia dati nel database.
-- Esito: se compare un errore "TEST FALLITO: ..." qualcosa non va;
-- se termina senza errori, tutti i test sono superati.
--
-- Utenti di prova: A = admin, B e D = membri, C = estraneo alla lega.
-- =============================================================

begin;

-- -------------------------------------------------------------
-- Funzioni di supporto (temporanee, spariscono a fine sessione)
-- -------------------------------------------------------------
create function pg_temp.uid(p text) returns uuid language sql immutable as $$
  select ('00000000-0000-0000-0000-0000000000' || lower(p) || '1')::uuid
$$;

create function pg_temp.login(p text) returns void language sql as $$
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', pg_temp.uid(p), 'role', 'authenticated')::text,
    true
  )
$$;

create function pg_temp.lg() returns uuid language sql stable as $$
  select current_setting('test.league')::uuid
$$;

create function pg_temp.pl(p_name text) returns uuid language sql stable as $$
  select id from public.players where league_id = pg_temp.lg() and name = p_name
$$;

create function pg_temp.md(p_number int) returns uuid language sql stable as $$
  select id from public.matchdays where league_id = pg_temp.lg() and number = p_number
$$;

-- 11 titolari validi per il 4-4-2 (rosa di B)
create function pg_temp.starters_442() returns uuid[] language sql stable as $$
  select array[
    pg_temp.pl('Test P1'),
    pg_temp.pl('Test D1'), pg_temp.pl('Test D2'), pg_temp.pl('Test D3'), pg_temp.pl('Test D4'),
    pg_temp.pl('Test C1'), pg_temp.pl('Test C2'), pg_temp.pl('Test C3'), pg_temp.pl('Test C4'),
    pg_temp.pl('Test A1'), pg_temp.pl('Test A2')
  ]
$$;

create function pg_temp.check(p_ok boolean, p_label text) returns void language plpgsql as $$
begin
  if not coalesce(p_ok, false) then
    raise exception 'TEST FALLITO: %', p_label;
  end if;
end;
$$;

create function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'TEST FALLITO: % (nessun errore)', p_label;
end;
$$;

-- -------------------------------------------------------------
-- Utenti di prova (il trigger crea i profili)
-- -------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  (pg_temp.uid('a'), 'test-a@example.invalid', '{"display_name": "Test A"}'),
  (pg_temp.uid('b'), 'test-b@example.invalid', '{}'),
  (pg_temp.uid('c'), 'test-c@example.invalid', '{}'),
  (pg_temp.uid('d'), 'test-d@example.invalid', '{}');

select pg_temp.check(
  (select count(*) from public.profiles where id in (pg_temp.uid('a'), pg_temp.uid('b'), pg_temp.uid('c'), pg_temp.uid('d'))) = 4,
  'profili creati alla registrazione'
);
select pg_temp.check(
  (select display_name from public.profiles where id = pg_temp.uid('a')) = 'Test A',
  'display_name dai metadati'
);

-- -------------------------------------------------------------
-- Lega di prova: con create_league se il database è vuoto,
-- altrimenti inserita direttamente (la lega vera non viene toccata)
-- -------------------------------------------------------------
do $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.leagues) then
    perform pg_temp.login('a');
    v_id := public.create_league('Lega di prova', 'Squadra A');
  else
    insert into public.leagues (name, invite_code, admin_id)
    values ('Lega di prova', 'TESTCODE01', pg_temp.uid('a'))
    returning id into v_id;
    insert into public.league_members (league_id, user_id, team_name, role)
    values (v_id, pg_temp.uid('a'), 'Squadra A', 'admin');
  end if;
  perform set_config('test.league', v_id::text, true);
  perform set_config('test.code', (select invite_code from public.leagues where id = v_id), true);
end;
$$;

-- =============================================================
-- Da qui in poi si agisce come utente loggato (ruolo authenticated)
-- =============================================================
set local role authenticated;

-- Una sola lega per progetto
select pg_temp.login('c');
select pg_temp.expect_error($$ select public.create_league('Altra', 'X') $$, 'seconda lega creata');

-- Codice invito
select pg_temp.login('b');
select pg_temp.expect_error($$ select public.join_league('SBAGLIATO', 'Squadra B') $$, 'codice errato accettato');
select public.join_league(current_setting('test.code'), 'Squadra B');
select pg_temp.expect_error(
  format('select public.join_league(%L, %L)', current_setting('test.code'), 'Squadra B 2'),
  'ingresso doppio nella stessa lega'
);

select pg_temp.login('d');
select pg_temp.expect_error(
  format('select public.join_league(%L, %L)', current_setting('test.code'), 'squadra b'),
  'nome squadra duplicato accettato'
);
select public.join_league(lower(current_setting('test.code')), 'Squadra D');

-- L'estraneo non vede nulla
select pg_temp.login('c');
select pg_temp.check((select count(*) from public.leagues) = 0, 'estraneo vede leghe');
select pg_temp.check((select count(*) from public.league_members) = 0, 'estraneo vede membri');
select pg_temp.check((select count(*) from public.players) = 0, 'estraneo vede giocatori');
select pg_temp.check((select count(*) from public.profiles) = 1, 'estraneo vede profili altrui');

-- Il membro vede la lega e i compagni
select pg_temp.login('b');
select pg_temp.check((select count(*) from public.leagues where id = pg_temp.lg()) = 1, 'membro non vede la lega');
select pg_temp.check((select count(*) from public.league_members where league_id = pg_temp.lg()) = 3, 'membro non vede i membri');
select pg_temp.check(
  (select count(*) from public.profiles where id in (pg_temp.uid('a'), pg_temp.uid('b'), pg_temp.uid('d'))) = 3,
  'membro non vede i profili dei compagni'
);

-- Giocatori: scrittura solo admin
select pg_temp.expect_error(
  format('insert into public.players (league_id, name, role, real_team) values (%L, %L, %L, %L)',
    pg_temp.lg(), 'Abusivo', 'A', 'Test FC'),
  'membro inserisce giocatori'
);

select pg_temp.login('a');
insert into public.players (league_id, name, role, real_team)
select pg_temp.lg(), 'Test ' || r || n, r, 'Test FC'
from (values ('P', 3), ('D', 5), ('C', 4), ('A', 3)) as v(r, cnt),
  generate_series(1, v.cnt) as n;
select pg_temp.check((select count(*) from public.players where league_id = pg_temp.lg()) = 15, 'admin inserisce giocatori');

-- Rose: solo l'admin le modifica (asta dal vivo, inserimento dell'admin)
select pg_temp.login('b');
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P1')),
  'membro modifica la propria rosa'
);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('a'), pg_temp.pl('Test A3')),
  'membro aggiunge giocatori alla rosa altrui'
);

select pg_temp.login('a');
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P1'), 10);

select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1000)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P2')),
  'budget superato accettato'
);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, -1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P2')),
  'costo negativo accettato'
);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('d'), pg_temp.pl('Test P1')),
  'giocatore in due squadre'
);

-- Modifica del costo: consentita all'admin, sempre entro il budget
update public.roster_entries set cost = 20
where league_id = pg_temp.lg() and player_id = pg_temp.pl('Test P1');
select pg_temp.check(
  (select cost from public.roster_entries where league_id = pg_temp.lg() and player_id = pg_temp.pl('Test P1')) = 20,
  'admin modifica il costo'
);
select pg_temp.expect_error(
  format('update public.roster_entries set cost = 1000 where league_id = %L and player_id = %L',
    pg_temp.lg(), pg_temp.pl('Test P1')),
  'budget superato in modifica'
);

-- Il membro non modifica né cancella nemmeno la propria rosa
select pg_temp.login('b');
update public.roster_entries set cost = 0 where user_id = pg_temp.uid('b');
delete from public.roster_entries where user_id = pg_temp.uid('b');
select pg_temp.check(
  (select cost from public.roster_entries where league_id = pg_temp.lg() and player_id = pg_temp.pl('Test P1')) = 20,
  'membro modifica o cancella la propria rosa'
);

-- Limite per ruolo (portieri = 2)
select pg_temp.login('a');
update public.leagues set n_gk = 2 where id = pg_temp.lg();
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P2'), 1);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P3')),
  'limite portieri superato'
);

-- Il membro non modifica le impostazioni della lega
select pg_temp.login('b');
update public.leagues set n_gk = 10 where id = pg_temp.lg();
select pg_temp.check((select n_gk from public.leagues where id = pg_temp.lg()) = 2, 'membro modifica la lega');
select pg_temp.expect_error(
  format('update public.leagues set invite_code = %L where id = %L', 'HACK', pg_temp.lg()),
  'codice invito modificato direttamente'
);
select pg_temp.expect_error(
  format('update public.league_members set role = %L where user_id = %L', 'admin', pg_temp.uid('b')),
  'membro si promuove admin'
);

-- Il membro non tocca la rosa altrui
select pg_temp.login('a');
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('a'), pg_temp.pl('Test A3'), 5);

select pg_temp.login('b');
update public.roster_entries set cost = 0 where user_id = pg_temp.uid('a');
delete from public.roster_entries where user_id = pg_temp.uid('a');
select pg_temp.check(
  (select cost from public.roster_entries where league_id = pg_temp.lg() and user_id = pg_temp.uid('a')) = 5,
  'membro modifica o cancella la rosa altrui'
);

-- L'admin modifica le rose anche se bloccate
select pg_temp.login('a');
update public.leagues set rosters_locked = true where id = pg_temp.lg();
insert into public.roster_entries (league_id, user_id, player_id, cost)
select pg_temp.lg(), pg_temp.uid('b'), id, 1
from public.players
where league_id = pg_temp.lg() and name in (
  'Test D1', 'Test D2', 'Test D3', 'Test D4', 'Test D5',
  'Test C1', 'Test C2', 'Test C3', 'Test C4', 'Test A1', 'Test A2'
);
select pg_temp.check(
  (select count(*) from public.roster_entries where user_id = pg_temp.uid('b')) = 13,
  'admin modifica la rosa altrui'
);
update public.leagues set rosters_locked = false where id = pg_temp.lg();

-- Giornate e calendario
select pg_temp.login('b');
select pg_temp.expect_error(
  format('insert into public.matchdays (league_id, number, deadline) values (%L, 1, now() + interval %L)',
    pg_temp.lg(), '1 day'),
  'membro crea giornate'
);
select pg_temp.expect_error(format('select public.generate_calendar(%L)', pg_temp.lg()), 'membro genera calendario');

select pg_temp.login('a');
insert into public.matchdays (league_id, number, deadline)
select pg_temp.lg(), n, now() + interval '1 day' from generate_series(1, 3) as n;
select public.generate_calendar(pg_temp.lg());

-- 3 squadre: ogni giornata 1 partita + 1 riposo; in 3 giornate ogni coppia una volta
select pg_temp.check(
  (select count(*) from public.fixtures where league_id = pg_temp.lg()) = 3,
  'calendario: numero partite'
);
select pg_temp.check(
  (select count(distinct least(home_user_id::text, away_user_id::text) || greatest(home_user_id::text, away_user_id::text))
   from public.fixtures where league_id = pg_temp.lg()) = 3,
  'calendario: ogni coppia una volta'
);

-- Ordine fisso per i test successivi: A=0, B=1, D=2 -> giornata 1: B (casa) - D, A riposa
reset role;
update public.league_members set calendar_position = null where league_id = pg_temp.lg();
update public.league_members set calendar_position = case user_id
    when pg_temp.uid('a') then 0 when pg_temp.uid('b') then 1 else 2 end
where league_id = pg_temp.lg();
select private.build_fixtures(id) from public.matchdays where league_id = pg_temp.lg();
set local role authenticated;

select pg_temp.login('a');
select pg_temp.check(
  exists (select 1 from public.fixtures
          where matchday_id = pg_temp.md(1) and home_user_id = pg_temp.uid('b') and away_user_id = pg_temp.uid('d')),
  'calendario: giornata 1 B-D'
);

-- Formazioni
select pg_temp.login('b');
select public.save_lineup(
  pg_temp.md(1), '4-4-2', pg_temp.starters_442(),
  array[pg_temp.pl('Test P2'), pg_temp.pl('Test D5')]
);
select pg_temp.check(
  (select count(*) from public.lineup_players lp join public.lineups l on l.id = lp.lineup_id
   where l.matchday_id = pg_temp.md(1) and l.user_id = pg_temp.uid('b')) = 13,
  'formazione salvata'
);

select pg_temp.expect_error(
  format('select public.save_lineup(%L, %L, %L::uuid[])', pg_temp.md(1), '4-4-3', pg_temp.starters_442()),
  'modulo non valido accettato'
);
select pg_temp.expect_error(
  format('select public.save_lineup(%L, %L, %L::uuid[])', pg_temp.md(1), '3-5-2', pg_temp.starters_442()),
  'titolari non coerenti con il modulo'
);
select pg_temp.expect_error(
  format('select public.save_lineup(%L, %L, %L::uuid[])', pg_temp.md(1), '4-4-2',
    (pg_temp.starters_442())[1:10] || pg_temp.pl('Test A3')),
  'giocatore non in rosa schierato'
);
select pg_temp.expect_error(
  format('select public.save_lineup(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.md(1), '4-4-2',
    pg_temp.starters_442(), array[pg_temp.pl('Test D1')]),
  'giocatore duplicato'
);
select pg_temp.expect_error(
  format('insert into public.lineups (matchday_id, league_id, user_id, formation) values (%L, %L, %L, %L)',
    pg_temp.md(2), pg_temp.lg(), pg_temp.uid('b'), '4-4-2'),
  'formazione scritta senza save_lineup'
);

-- Prima della scadenza i membri vedono tutte le formazioni (anche chi non
-- gioca contro B: in giornata 2 B riposa), l'estraneo C nessuna
select pg_temp.login('b');
select public.save_lineup(pg_temp.md(2), '4-4-2', pg_temp.starters_442());

select pg_temp.login('d');
select pg_temp.check(
  (select count(*) from public.lineups where user_id = pg_temp.uid('b')) = 2,
  'membro non vede le formazioni altrui prima della scadenza'
);
select pg_temp.check(
  (select count(*) from public.lineup_players) = 24,
  'membro non vede i giocatori delle formazioni altrui prima della scadenza'
);
select pg_temp.login('a');
select pg_temp.check(
  (select count(*) from public.lineups where user_id = pg_temp.uid('b')) = 2,
  'admin non vede le formazioni altrui prima della scadenza'
);

-- Vederla non vuol dire poterla modificare
select pg_temp.login('d');
select pg_temp.expect_error(
  format('update public.lineups set formation = %L where matchday_id = %L', '3-4-3', pg_temp.md(1)),
  'membro modifica la formazione altrui'
);
select pg_temp.expect_error(
  'delete from public.lineup_players',
  'membro cancella i giocatori della formazione altrui'
);
select pg_temp.expect_error(
  format('delete from public.lineups where user_id = %L', pg_temp.uid('b')),
  'membro cancella la formazione altrui'
);
select pg_temp.check(
  (select count(*) from public.lineup_players lp join public.lineups l on l.id = lp.lineup_id
   where l.matchday_id = pg_temp.md(1) and l.user_id = pg_temp.uid('b') and l.formation = '4-4-2') = 13,
  'formazione altrui modificata'
);

select pg_temp.login('c');
select pg_temp.check(
  (select count(*) from public.lineups) = 0,
  'estraneo vede le formazioni'
);
select pg_temp.check(
  (select count(*) from public.lineup_players) = 0,
  'estraneo vede i giocatori delle formazioni'
);

-- Scadenza passata: niente salvataggi, formazioni visibili
select pg_temp.login('a');
update public.matchdays set deadline = now() - interval '1 hour' where id = pg_temp.md(1);

select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.save_lineup(%L, %L, %L::uuid[])', pg_temp.md(1), '4-4-2', pg_temp.starters_442()),
  'formazione salvata dopo la scadenza'
);

select pg_temp.login('d');
select pg_temp.check(
  (select count(*) from public.lineups where matchday_id = pg_temp.md(1)) = 1,
  'formazione altrui non visibile dopo la scadenza'
);

-- Voti: solo admin
select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.import_votes(%L, %L::jsonb)', pg_temp.md(1), '[]'),
  'membro importa voti'
);

select pg_temp.login('a');
select pg_temp.check(
  public.import_votes(pg_temp.md(1), jsonb_build_array(
    jsonb_build_object('player_id', pg_temp.pl('Test P1'), 'vote', 6.5, 'fantavote', 7.5),
    jsonb_build_object('player_id', pg_temp.pl('Test D1'), 'vote', null, 'fantavote', null),
    jsonb_build_object('player_id', pg_temp.pl('Test P1'), 'vote', 6.5, 'fantavote', 7.5)
  )) = 2,
  'import voti (con riga duplicata)'
);
-- Reimport: sovrascrive
select public.import_votes(pg_temp.md(1), jsonb_build_array(
  jsonb_build_object('player_id', pg_temp.pl('Test P1'), 'vote', 6, 'fantavote', 5)
));
select pg_temp.check(
  (select fantavote from public.player_votes where matchday_id = pg_temp.md(1) and player_id = pg_temp.pl('Test P1')) = 5,
  'reimport voti sovrascrive'
);
-- Bonus e malus: solo chiavi note con interi da 1 a 20
select public.import_votes(pg_temp.md(1), jsonb_build_array(
  jsonb_build_object('player_id', pg_temp.pl('Test P1'), 'vote', 6, 'fantavote', 5,
    'events', jsonb_build_object('gs', 1, 'pi', 0, 'boh', 3, 'amm', 1.5, 'gol', '2'))
));
select pg_temp.check(
  (select events from public.player_votes where matchday_id = pg_temp.md(1) and player_id = pg_temp.pl('Test P1')) = '{"gs": 1}'::jsonb,
  'eventi del voto non ripuliti'
);
-- Correzione senza eventi (inserimento a mano): gli eventi restano
select public.import_votes(pg_temp.md(1), jsonb_build_array(
  jsonb_build_object('player_id', pg_temp.pl('Test P1'), 'vote', 6, 'fantavote', 5)
));
select pg_temp.check(
  (select events from public.player_votes where matchday_id = pg_temp.md(1) and player_id = pg_temp.pl('Test P1')) = '{"gs": 1}'::jsonb,
  'correzione a mano cancella gli eventi'
);

select pg_temp.login('d');
select pg_temp.check((select count(*) from public.player_votes) = 2, 'membro non vede i voti');

-- Punteggi e classifica
select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.save_matchday_results(%L, %L::jsonb)', pg_temp.md(1), '[]'),
  'membro salva punteggi'
);

select pg_temp.login('a');
select pg_temp.expect_error(
  format('select public.save_matchday_results(%L, %L::jsonb)', pg_temp.md(2), '[]'),
  'punteggi salvati prima della scadenza'
);

select public.save_matchday_results(pg_temp.md(1), jsonb_build_array(
  jsonb_build_object('user_id', pg_temp.uid('b'), 'points', 73, 'details', '{}'::jsonb),
  jsonb_build_object('user_id', pg_temp.uid('a'), 'points', 65.5)
));
-- B 73 = 2 gol, D senza formazione = 0 punti = 0 gol
select pg_temp.check(
  (select home_goals = 2 and away_goals = 0 and away_points = 0
   from public.fixtures where matchday_id = pg_temp.md(1)),
  'gol calcolati dai fantapunti'
);
select pg_temp.check(
  (select status from public.matchdays where id = pg_temp.md(1)) = 'scored',
  'giornata segnata come calcolata'
);
select pg_temp.check(
  (select points = 3 and won = 1 and goals_for = 2 and fantapoints = 73
   from public.standings where user_id = pg_temp.uid('b')),
  'classifica: vittoria B'
);
select pg_temp.check(
  (select points = 0 and lost = 1 from public.standings where user_id = pg_temp.uid('d')),
  'classifica: sconfitta D'
);
select pg_temp.check(
  (select played = 0 and points = 0 from public.standings where user_id = pg_temp.uid('a')),
  'classifica: A riposa'
);

-- Ricalcolo: sovrascrive senza duplicati (B 60 = 0 gol -> pareggio 0-0)
select public.save_matchday_results(pg_temp.md(1), jsonb_build_array(
  jsonb_build_object('user_id', pg_temp.uid('b'), 'points', 60)
));
select pg_temp.check(
  (select count(*) from public.matchday_scores where matchday_id = pg_temp.md(1)) = 1,
  'ricalcolo: punteggi duplicati'
);
select pg_temp.check(
  (select points = 1 and drawn = 1 and played = 1 and fantapoints = 60
   from public.standings where user_id = pg_temp.uid('b')),
  'ricalcolo: classifica aggiornata'
);

select pg_temp.login('c');
select pg_temp.check((select count(*) from public.standings) = 0, 'estraneo vede la classifica');

-- Loghi: li cambia solo la squadra stessa, e solo nella propria cartella
create function pg_temp.logo(p text) returns text language sql stable as $$
  select pg_temp.lg()::text || '/' || pg_temp.uid(p)::text || '/1.webp'
$$;

select pg_temp.login('b');
update public.league_members set logo_path = pg_temp.logo('b')
where league_id = pg_temp.lg() and user_id = pg_temp.uid('b');
select pg_temp.check(
  (select logo_path from public.league_members where league_id = pg_temp.lg() and user_id = pg_temp.uid('b')) = pg_temp.logo('b'),
  'squadra non salva il proprio logo'
);
select pg_temp.expect_error(
  format('update public.league_members set logo_path = %L where league_id = %L and user_id = %L',
    pg_temp.logo('d'), pg_temp.lg(), pg_temp.uid('b')),
  'logo fuori dalla propria cartella'
);
update public.league_members set logo_path = pg_temp.logo('d')
where league_id = pg_temp.lg() and user_id = pg_temp.uid('d');
select pg_temp.check(
  (select logo_path is null from public.league_members where league_id = pg_temp.lg() and user_id = pg_temp.uid('d')),
  'membro cambia il logo di un altro'
);

select pg_temp.login('a');
select pg_temp.expect_error(
  format('update public.league_members set logo_path = null where league_id = %L and user_id = %L',
    pg_temp.lg(), pg_temp.uid('b')),
  'admin cambia il logo di un altro'
);
-- Il nome squadra l'admin lo cambia ancora
update public.league_members set team_name = 'Squadra B'
where league_id = pg_temp.lg() and user_id = pg_temp.uid('b');
select pg_temp.check(
  (select team_name from public.league_members where league_id = pg_temp.lg() and user_id = pg_temp.uid('b')) = 'Squadra B',
  'admin non cambia più il nome squadra'
);

-- File dei loghi: solo nella cartella <lega>/<utente>/ di chi carica
select pg_temp.login('b');
select pg_temp.check(private.is_own_logo_folder(pg_temp.logo('b')), 'propria cartella dei loghi rifiutata');
select pg_temp.check(not private.is_own_logo_folder(pg_temp.logo('d')), 'logo caricato nella cartella altrui');
select pg_temp.check(
  not private.is_own_logo_folder(pg_temp.uid('b')::text || '/1.webp'),
  'logo caricato fuori dalla cartella della lega'
);
select pg_temp.login('c');
select pg_temp.check(not private.is_own_logo_folder(pg_temp.logo('c')), 'estraneo carica un logo nella lega');

reset role;
select pg_temp.check(
  (select public and file_size_limit = 524288 from storage.buckets where id = 'team-logos'),
  'bucket dei loghi mancante o non configurato'
);
select pg_temp.check(
  (select count(*) from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and policyname like 'loghi:%') = 3,
  'policy dei loghi mancanti'
);
set local role authenticated;

-- -------------------------------------------------------------
-- Mercato scambi
-- Rose a questo punto: B = P1 (20), P2, D1-D5, C1-C4, A1, A2 (1 ciascuno),
-- valore 32; A = A3 (5). Giornata 2 aperta con la formazione di B.
-- -------------------------------------------------------------
reset role;
create function pg_temp.trade(p_id text) returns uuid language sql stable as $$
  select current_setting('test.trade_' || p_id)::uuid
$$;
create function pg_temp.save_trade(p_id text, p_trade uuid) returns void language sql as $$
  select set_config('test.trade_' || p_id, p_trade::text, true)
$$;
create function pg_temp.owner(p_name text) returns uuid language sql stable as $$
  select user_id from public.roster_entries where league_id = pg_temp.lg() and player_id = pg_temp.pl(p_name)
$$;
create function pg_temp.balance(p text) returns integer language sql stable as $$
  select trade_balance from public.league_members where league_id = pg_temp.lg() and user_id = pg_temp.uid(p)
$$;
create function pg_temp.trade_status(p_id text) returns text language sql stable as $$
  select status from public.trades where id = pg_temp.trade(p_id)
$$;
set local role authenticated;

-- Mercato chiuso: niente proposte; lo apre solo l'admin
select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('a'),
    array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test A3')]),
  'proposta con il mercato chiuso'
);
select pg_temp.expect_error(format('select public.set_trade_market(%L, true)', pg_temp.lg()), 'membro apre il mercato');
select pg_temp.expect_error(
  format('update public.leagues set trade_market_open = true where id = %L', pg_temp.lg()),
  'mercato aperto senza la RPC'
);
select pg_temp.expect_error(
  format('update public.league_members set trade_balance = 100 where league_id = %L and user_id = %L',
    pg_temp.lg(), pg_temp.uid('b')),
  'membro cambia il proprio saldo scambi'
);

select pg_temp.login('a');
select pg_temp.expect_error(
  format('update public.league_members set trade_balance = 100 where league_id = %L and user_id = %L',
    pg_temp.lg(), pg_temp.uid('b')),
  'admin cambia il saldo scambi senza scambio'
);
select public.set_trade_market(pg_temp.lg(), true);
select pg_temp.check((select trade_market_open from public.leagues where id = pg_temp.lg()), 'mercato non aperto');
-- Tutte e due le squadre hanno speso tutto il budget
update public.leagues set budget = 32 where id = pg_temp.lg();

-- Proposte non valide
select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('a'),
    array[pg_temp.pl('Test A3')], array[pg_temp.pl('Test A1')]),
  'offerto un giocatore non suo'
);
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('a'),
    array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test P3')]),
  'chiesto uno svincolato'
);
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('b'),
    array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test A2')]),
  'scambio con se stesso'
);
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('a'),
    array[pg_temp.pl('Test A1')], '{}'),
  'scambio senza contropartita'
);
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('c'),
    array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test A3')]),
  'scambio con un estraneo'
);
select pg_temp.expect_error(
  format('insert into public.trades (league_id, proposer_id, receiver_id) values (%L, %L, %L)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.uid('a')),
  'proposta scritta senza la RPC'
);

-- Limite per ruolo dopo lo scambio (attaccanti = 2: B ne ha già 2)
select pg_temp.login('a');
update public.leagues set n_att = 2 where id = pg_temp.lg();
select pg_temp.login('b');
select pg_temp.expect_error(
  format('select public.propose_trade(%L, %L, %L::uuid[], %L::uuid[])', pg_temp.lg(), pg_temp.uid('a'),
    array[pg_temp.pl('Test D1')], array[pg_temp.pl('Test A3')]),
  'scambio oltre il limite del ruolo'
);
select pg_temp.check((select count(*) from public.trades) = 0, 'proposta non valida salvata');

-- Proposta valida: B dà A1 (1 credito) e chiede A3 (5 crediti); una seconda
-- proposta con gli stessi giocatori decadrà quando la prima è accettata
select pg_temp.save_trade('1', public.propose_trade(pg_temp.lg(), pg_temp.uid('a'),
  array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test A3')], '  Ci stai?  '));
select pg_temp.save_trade('2', public.propose_trade(pg_temp.lg(), pg_temp.uid('a'),
  array[pg_temp.pl('Test A1'), pg_temp.pl('Test C1')], array[pg_temp.pl('Test A3')]));
select pg_temp.check(
  (select message from public.trades where id = pg_temp.trade('1')) = 'Ci stai?',
  'messaggio della proposta'
);
select pg_temp.check(
  (select count(*) from public.trade_players where trade_id = pg_temp.trade('1')) = 2,
  'giocatori della proposta'
);

-- Le proposte le vedono solo le due squadre
select pg_temp.login('d');
select pg_temp.check((select count(*) from public.trades) = 0, 'terza squadra vede le proposte');
select pg_temp.check((select count(*) from public.trade_players) = 0, 'terza squadra vede i giocatori proposti');
select pg_temp.expect_error(format('select public.respond_trade(%L, true)', pg_temp.trade('1')), 'terza squadra accetta');
select pg_temp.login('c');
select pg_temp.check((select count(*) from public.trades) = 0, 'estraneo vede le proposte');
select pg_temp.login('b');
select pg_temp.check((select count(*) from public.trades) = 2, 'chi propone non vede le proprie proposte');
select pg_temp.expect_error(format('select public.respond_trade(%L, true)', pg_temp.trade('1')), 'chi propone accetta da solo');
select pg_temp.login('a');
select pg_temp.check((select count(*) from public.trades) = 2, 'chi riceve non vede le proposte');

-- A accetta: giocatori scambiati, valore rosa oltre il budget, crediti disponibili invariati
select public.respond_trade(pg_temp.trade('1'), true);
select pg_temp.check(pg_temp.trade_status('1') = 'accepted', 'proposta non accettata');
select pg_temp.check(pg_temp.owner('Test A3') = pg_temp.uid('b'), 'A3 non passato a B');
select pg_temp.check(pg_temp.owner('Test A1') = pg_temp.uid('a'), 'A1 non passato ad A');
select pg_temp.check(
  (select cost from public.roster_entries where league_id = pg_temp.lg() and player_id = pg_temp.pl('Test A3')) = 5,
  'il giocatore scambiato perde il costo d''asta'
);
select pg_temp.check(pg_temp.balance('b') = 4 and pg_temp.balance('a') = -4, 'saldo scambi');
select pg_temp.check(
  (select sum(cost) from public.roster_entries where league_id = pg_temp.lg() and user_id = pg_temp.uid('b')) = 36,
  'valore rosa di B dopo lo scambio'
);
select pg_temp.check(pg_temp.trade_status('2') = 'expired', 'proposta con giocatori già scambiati ancora valida');
select pg_temp.expect_error(format('select public.respond_trade(%L, true)', pg_temp.trade('2')), 'proposta decaduta accettata');

-- Formazioni: A1 tolto da quella aperta di B, resta in quella già chiusa
select pg_temp.check(
  (select count(*) from public.lineup_players lp join public.lineups l on l.id = lp.lineup_id
   where l.matchday_id = pg_temp.md(2) and l.user_id = pg_temp.uid('b')) = 10,
  'giocatore ceduto ancora nella formazione aperta'
);
select pg_temp.check(
  exists (select 1 from public.lineup_players lp join public.lineups l on l.id = lp.lineup_id
          where l.matchday_id = pg_temp.md(1) and l.user_id = pg_temp.uid('b') and lp.player_id = pg_temp.pl('Test A1')),
  'giocatore ceduto tolto da una formazione già chiusa'
);

-- Lo scambio eseguito lo vede tutta la lega
select pg_temp.login('d');
select pg_temp.check(
  (select count(*) from public.trades) = 1 and (select count(*) from public.trade_players) = 2,
  'terza squadra non vede lo scambio eseguito'
);

-- Asta (admin): i crediti disponibili tengono conto del saldo scambi.
-- B: 32 + 4 - 36 = 0 disponibili; A: 32 - 4 - 1 = 27
select pg_temp.login('a');
update public.leagues set n_gk = 3 where id = pg_temp.lg();
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P3')),
  'acquisto oltre i crediti disponibili dopo lo scambio'
);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 28)',
    pg_temp.lg(), pg_temp.uid('a'), pg_temp.pl('Test P3')),
  'acquisto oltre i crediti disponibili di chi ha ceduto valore'
);
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('a'), pg_temp.pl('Test P3'), 27);
delete from public.roster_entries where league_id = pg_temp.lg() and player_id = pg_temp.pl('Test P3');

-- Ritiro e rifiuto
select pg_temp.login('b');
select pg_temp.save_trade('3', public.propose_trade(pg_temp.lg(), pg_temp.uid('a'),
  array[pg_temp.pl('Test A2')], array[pg_temp.pl('Test A1')]));
select pg_temp.save_trade('4', public.propose_trade(pg_temp.lg(), pg_temp.uid('a'),
  array[pg_temp.pl('Test A3')], array[pg_temp.pl('Test A1')]));
select public.withdraw_trade(pg_temp.trade('3'));
select pg_temp.check(pg_temp.trade_status('3') = 'withdrawn', 'proposta non ritirata');
select pg_temp.login('a');
select pg_temp.expect_error(format('select public.withdraw_trade(%L)', pg_temp.trade('4')), 'chi riceve ritira la proposta');
select pg_temp.expect_error(format('select public.respond_trade(%L, true)', pg_temp.trade('3')), 'proposta ritirata accettata');
select public.respond_trade(pg_temp.trade('4'), false);
select pg_temp.check(pg_temp.trade_status('4') = 'rejected', 'proposta non rifiutata');
select pg_temp.check(pg_temp.owner('Test A3') = pg_temp.uid('b'), 'proposta rifiutata eseguita');
select pg_temp.login('d');
select pg_temp.check((select count(*) from public.trades) = 1, 'terza squadra vede proposte rifiutate o ritirate');

-- Annullamento: solo l'admin; giocatori e saldi tornano come prima
select pg_temp.login('b');
select pg_temp.expect_error(format('select public.cancel_trade(%L)', pg_temp.trade('1')), 'membro annulla uno scambio');
select pg_temp.login('a');
select pg_temp.expect_error(format('select public.cancel_trade(%L)', pg_temp.trade('4')), 'annullato uno scambio non eseguito');
select public.cancel_trade(pg_temp.trade('1'));
select pg_temp.check(pg_temp.trade_status('1') = 'cancelled', 'scambio non annullato');
select pg_temp.check(
  pg_temp.owner('Test A1') = pg_temp.uid('b') and pg_temp.owner('Test A3') = pg_temp.uid('a'),
  'annullamento: giocatori non tornati indietro'
);
select pg_temp.check(pg_temp.balance('b') = 0 and pg_temp.balance('a') = 0, 'annullamento: saldi non azzerati');
select pg_temp.expect_error(format('select public.cancel_trade(%L)', pg_temp.trade('1')), 'scambio annullato due volte');

-- Chiudendo il mercato le proposte in attesa decadono
select pg_temp.login('b');
select pg_temp.save_trade('5', public.propose_trade(pg_temp.lg(), pg_temp.uid('a'),
  array[pg_temp.pl('Test A1')], array[pg_temp.pl('Test A3')]));
select pg_temp.login('a');
select public.set_trade_market(pg_temp.lg(), false);
select pg_temp.check(pg_temp.trade_status('5') = 'expired', 'proposta ancora in attesa a mercato chiuso');
select pg_temp.expect_error(format('select public.respond_trade(%L, true)', pg_temp.trade('5')), 'scambio accettato a mercato chiuso');
update public.leagues set budget = 500, n_att = 6 where id = pg_temp.lg();

-- Membri: solo l'admin rimuove, e non se stesso
select pg_temp.login('b');
delete from public.league_members where user_id = pg_temp.uid('d');
select pg_temp.check(
  exists (select 1 from public.league_members where user_id = pg_temp.uid('d')),
  'membro rimuove un altro membro'
);
select pg_temp.expect_error(format('select public.regenerate_invite_code(%L)', pg_temp.lg()), 'membro rigenera il codice');

select pg_temp.login('a');
delete from public.league_members where user_id = pg_temp.uid('a') and league_id = pg_temp.lg();
select pg_temp.check(
  exists (select 1 from public.league_members where user_id = pg_temp.uid('a') and league_id = pg_temp.lg()),
  'admin rimuove se stesso'
);
select pg_temp.check(
  public.regenerate_invite_code(pg_temp.lg()) <> current_setting('test.code'),
  'codice invito rigenerato'
);

-- Utente non loggato (anon): nessun accesso
reset role;
set local role anon;
select pg_temp.expect_error($$ select count(*) from public.leagues $$, 'anon legge le leghe');
select pg_temp.expect_error($$ select public.join_league('X', 'Y') $$, 'anon chiama le RPC');

reset role;
select 'Tutti i test superati' as risultato;

rollback;
