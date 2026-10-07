-- =============================================================
-- Fantacalcio Serie B – 03 Funzioni RPC (chiamabili dall'app)
-- =============================================================
-- Tutte "security definer": controllano da sole chi le chiama.

-- -------------------------------------------------------------
-- Crea la lega (una sola per progetto: chi la crea diventa admin)
-- -------------------------------------------------------------
create function public.create_league(p_name text, p_team_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_league_id uuid;
begin
  if v_uid is null then
    raise exception 'Devi effettuare l''accesso';
  end if;

  -- Evita due creazioni contemporanee
  perform pg_advisory_xact_lock(hashtext('fantacalcio.create_league'));
  if exists (select 1 from public.leagues) then
    raise exception 'La lega esiste già: entra con il codice invito';
  end if;

  insert into public.leagues (name, invite_code, admin_id)
  values (btrim(p_name), private.new_invite_code(), v_uid)
  returning id into v_league_id;

  insert into public.league_members (league_id, user_id, team_name, role)
  values (v_league_id, v_uid, btrim(p_team_name), 'admin');

  return v_league_id;
end;
$$;

-- -------------------------------------------------------------
-- Entra in una lega con il codice invito
-- -------------------------------------------------------------
create function public.join_league(p_code text, p_team_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_league_id uuid;
begin
  if v_uid is null then
    raise exception 'Devi effettuare l''accesso';
  end if;

  select id into v_league_id
  from public.leagues
  where invite_code = upper(btrim(p_code));
  if not found then
    raise exception 'Codice invito non valido';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_league_id and user_id = v_uid
  ) then
    raise exception 'Fai già parte di questa lega';
  end if;

  if exists (
    select 1 from public.league_members
    where league_id = v_league_id and lower(team_name) = lower(btrim(p_team_name))
  ) then
    raise exception 'Nome squadra già usato';
  end if;

  insert into public.league_members (league_id, user_id, team_name, role)
  values (v_league_id, v_uid, btrim(p_team_name), 'member');

  return v_league_id;
end;
$$;

-- -------------------------------------------------------------
-- Rigenera il codice invito (solo admin)
-- -------------------------------------------------------------
create function public.regenerate_invite_code(p_league_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not private.is_league_admin(p_league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;

  v_code := private.new_invite_code();
  update public.leagues set invite_code = v_code where id = p_league_id;
  return v_code;
end;
$$;

-- -------------------------------------------------------------
-- Genera il calendario degli scontri diretti (solo admin)
-- Ordine delle squadre casuale; ricrea le partite delle giornate non calcolate.
-- -------------------------------------------------------------
create function public.generate_calendar(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_league_admin(p_league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;

  update public.league_members set calendar_position = null
  where league_id = p_league_id;

  with shuffled as (
    select user_id, (row_number() over (order by random()) - 1)::int as pos
    from public.league_members
    where league_id = p_league_id
  )
  update public.league_members m
  set calendar_position = s.pos
  from shuffled s
  where m.league_id = p_league_id and m.user_id = s.user_id;

  perform private.build_fixtures(md.id)
  from public.matchdays md
  where md.league_id = p_league_id and md.status <> 'scored';
end;
$$;

-- -------------------------------------------------------------
-- Salva la formazione (solo la propria, solo prima della scadenza)
-- p_starters: 11 giocatori in ordine; p_bench: panchina in ordine di sostituzione
-- -------------------------------------------------------------
create function public.save_lineup(
  p_matchday_id uuid,
  p_formation text,
  p_starters uuid[],
  p_bench uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_md public.matchdays;
  v_league public.leagues;
  v_all uuid[];
  v_in_roster integer;
  v_gk integer;
  v_def integer;
  v_mid integer;
  v_att integer;
  v_lineup_id uuid;
begin
  if v_uid is null then
    raise exception 'Devi effettuare l''accesso';
  end if;

  select * into v_md from public.matchdays where id = p_matchday_id;
  if not found or not private.is_league_member(v_md.league_id) then
    raise exception 'Giornata non trovata';
  end if;
  if v_md.status <> 'open' or now() >= v_md.deadline then
    raise exception 'Formazione chiusa: la scadenza è passata';
  end if;

  select * into v_league from public.leagues where id = v_md.league_id;
  if not private.is_valid_formation(p_formation)
     or not (p_formation = any (v_league.allowed_formations)) then
    raise exception 'Modulo % non consentito', p_formation;
  end if;

  p_bench := coalesce(p_bench, '{}');
  v_all := coalesce(p_starters, '{}') || p_bench;

  if coalesce(cardinality(p_starters), 0) <> 11 then
    raise exception 'Servono 11 titolari';
  end if;
  if array_position(v_all, null) is not null then
    raise exception 'Formazione non valida: giocatore mancante';
  end if;
  if (select count(distinct x) from unnest(v_all) as x) <> cardinality(v_all) then
    raise exception 'Lo stesso giocatore è inserito più volte';
  end if;

  select count(*) into v_in_roster
  from unnest(v_all) as x(player_id)
  join public.roster_entries r
    on r.player_id = x.player_id and r.league_id = v_md.league_id and r.user_id = v_uid;
  if v_in_roster <> cardinality(v_all) then
    raise exception 'Puoi schierare solo giocatori della tua rosa';
  end if;

  select
    count(*) filter (where p.role = 'P'),
    count(*) filter (where p.role = 'D'),
    count(*) filter (where p.role = 'C'),
    count(*) filter (where p.role = 'A')
  into v_gk, v_def, v_mid, v_att
  from unnest(p_starters) as x(player_id)
  join public.players p on p.id = x.player_id;

  if v_gk <> 1
     or v_def <> split_part(p_formation, '-', 1)::int
     or v_mid <> split_part(p_formation, '-', 2)::int
     or v_att <> split_part(p_formation, '-', 3)::int then
    raise exception 'I titolari non rispettano il modulo %: servono 1 portiere e %', p_formation, p_formation;
  end if;

  insert into public.lineups (matchday_id, league_id, user_id, formation, updated_at)
  values (p_matchday_id, v_md.league_id, v_uid, p_formation, now())
  on conflict (matchday_id, user_id)
  do update set formation = excluded.formation, updated_at = excluded.updated_at
  returning id into v_lineup_id;

  delete from public.lineup_players where lineup_id = v_lineup_id;

  insert into public.lineup_players (lineup_id, player_id, slot, position)
  select v_lineup_id, x.player_id, 'starter', x.ord::int
  from unnest(p_starters) with ordinality as x(player_id, ord);

  insert into public.lineup_players (lineup_id, player_id, slot, position)
  select v_lineup_id, x.player_id, 'bench', x.ord::int
  from unnest(p_bench) with ordinality as x(player_id, ord);

  return v_lineup_id;
end;
$$;

-- -------------------------------------------------------------
-- Import voti (solo admin): upsert, reimportare sovrascrive
-- p_rows: [{"player_id": "...", "vote": 6.5, "fantavote": 7.5}, ...]
-- Ritorna il numero di voti salvati.
-- -------------------------------------------------------------
create function public.import_votes(p_matchday_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league_id uuid := private.matchday_league_id(p_matchday_id);
  v_count integer;
begin
  if v_league_id is null or not private.is_league_admin(v_league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Formato voti non valido';
  end if;

  insert into public.player_votes (matchday_id, player_id, vote, fantavote)
  select distinct on (p.id)
    p_matchday_id, p.id, (r ->> 'vote')::numeric, (r ->> 'fantavote')::numeric
  from jsonb_array_elements(p_rows) as r
  join public.players p
    on p.id = (r ->> 'player_id')::uuid and p.league_id = v_league_id
  order by p.id
  on conflict (matchday_id, player_id)
  do update set vote = excluded.vote, fantavote = excluded.fantavote;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- -------------------------------------------------------------
-- Salva i punteggi calcolati e i risultati degli scontri diretti (solo admin)
-- p_scores: [{"user_id": "...", "points": 72.5, "details": {...}}, ...]
-- Ripetibile: sovrascrive i punteggi precedenti della giornata.
-- -------------------------------------------------------------
create function public.save_matchday_results(p_matchday_id uuid, p_scores jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_md public.matchdays;
  v_league public.leagues;
begin
  select * into v_md from public.matchdays where id = p_matchday_id;
  if not found or not private.is_league_admin(v_md.league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;
  if now() < v_md.deadline then
    raise exception 'La scadenza delle formazioni non è ancora passata';
  end if;
  if jsonb_typeof(p_scores) <> 'array' then
    raise exception 'Formato punteggi non valido';
  end if;

  select * into v_league from public.leagues where id = v_md.league_id;

  delete from public.matchday_scores where matchday_id = p_matchday_id;

  insert into public.matchday_scores (matchday_id, league_id, user_id, points, details)
  select p_matchday_id, v_md.league_id, m.user_id,
    (s ->> 'points')::numeric, coalesce(s -> 'details', '{}'::jsonb)
  from jsonb_array_elements(p_scores) as s
  join public.league_members m
    on m.league_id = v_md.league_id and m.user_id = (s ->> 'user_id')::uuid;

  -- Squadra senza punteggio = 0 fantapunti
  update public.fixtures f
  set
    home_points = coalesce((
      select ms.points from public.matchday_scores ms
      where ms.matchday_id = f.matchday_id and ms.user_id = f.home_user_id
    ), 0),
    away_points = coalesce((
      select ms.points from public.matchday_scores ms
      where ms.matchday_id = f.matchday_id and ms.user_id = f.away_user_id
    ), 0)
  where f.matchday_id = p_matchday_id;

  update public.fixtures f
  set
    home_goals = private.points_to_goals(f.home_points, v_league.goal_threshold, v_league.goal_step),
    away_goals = private.points_to_goals(f.away_points, v_league.goal_threshold, v_league.goal_step)
  where f.matchday_id = p_matchday_id;

  update public.matchdays set status = 'scored' where id = p_matchday_id;
end;
$$;
