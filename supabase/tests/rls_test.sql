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

-- Rose
select pg_temp.login('b');
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P1'), 10);

select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('a'), pg_temp.pl('Test A3')),
  'membro aggiunge giocatori alla rosa altrui'
);
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

select pg_temp.login('d');
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('d'), pg_temp.pl('Test P1')),
  'giocatore in due squadre'
);

-- Limite per ruolo (portieri = 2)
select pg_temp.login('a');
update public.leagues set n_gk = 2 where id = pg_temp.lg();

select pg_temp.login('b');
insert into public.roster_entries (league_id, user_id, player_id, cost)
values (pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P2'), 1);
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test P3')),
  'limite portieri superato'
);

-- Il membro non modifica le impostazioni della lega
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

-- Rose bloccate: il membro non scrive, l'admin sì
select pg_temp.login('a');
update public.leagues set rosters_locked = true where id = pg_temp.lg();

select pg_temp.login('b');
select pg_temp.expect_error(
  format('insert into public.roster_entries (league_id, user_id, player_id, cost) values (%L, %L, %L, 1)',
    pg_temp.lg(), pg_temp.uid('b'), pg_temp.pl('Test D1')),
  'inserimento con rose bloccate'
);

select pg_temp.login('a');
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

-- Prima della scadenza le formazioni altrui non si vedono
select pg_temp.login('d');
select pg_temp.check(
  (select count(*) from public.lineups where matchday_id = pg_temp.md(1)) = 0,
  'formazione altrui visibile prima della scadenza'
);
select pg_temp.check(
  (select count(*) from public.lineup_players) = 0,
  'giocatori della formazione altrui visibili prima della scadenza'
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
