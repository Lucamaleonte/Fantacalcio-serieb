-- =============================================================
-- Fantacalcio Serie B – 02 Funzioni interne e trigger
-- =============================================================
-- Le funzioni "security definer" girano con i permessi del proprietario
-- (ignorano la RLS): per questo fissano search_path = '' e usano nomi
-- completi (public.tabella).

-- -------------------------------------------------------------
-- Funzioni di supporto per le policy RLS
-- -------------------------------------------------------------
create function private.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id and m.user_id = (select auth.uid())
  )
$$;

create function private.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id
      and m.user_id = (select auth.uid())
      and m.role = 'admin'
  )
$$;

-- Vero se l'utente corrente e p_user_id sono in almeno una lega comune
create function private.shares_league_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.league_members me
    join public.league_members other on other.league_id = me.league_id
    where me.user_id = (select auth.uid()) and other.user_id = p_user_id
  )
$$;

create function private.matchday_league_id(p_matchday_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select league_id from public.matchdays where id = p_matchday_id
$$;

-- Formazioni chiuse: scadenza passata o giornata non più aperta
create function private.is_matchday_closed(p_matchday_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select now() >= md.deadline or md.status <> 'open'
     from public.matchdays md where md.id = p_matchday_id),
    false
  )
$$;

-- Il membro modifica solo la propria rosa e solo se le rose non sono bloccate;
-- l'admin modifica tutte le rose
create function private.can_edit_roster(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_league_admin(p_league_id)
    or (
      p_user_id = (select auth.uid())
      and private.is_league_member(p_league_id)
      and not coalesce(
        (select l.rosters_locked from public.leagues l where l.id = p_league_id),
        true
      )
    )
$$;

-- Fantapunti -> gol negli scontri diretti
create function private.points_to_goals(p_points numeric, p_threshold numeric, p_step numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_points < p_threshold then 0
    else floor((p_points - p_threshold) / p_step)::int + 1
  end
$$;

-- Codice invito: 10 caratteri esadecimali maiuscoli (casuali, da gen_random_uuid)
create function private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
$$;

-- -------------------------------------------------------------
-- Profilo creato automaticamente alla registrazione
-- -------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(
      coalesce(
        nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
        split_part(coalesce(new.email, ''), '@', 1)
      ),
      50
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -------------------------------------------------------------
-- Rose: budget, limiti per ruolo, giocatore in una sola squadra
-- -------------------------------------------------------------
create function private.check_roster_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
  v_player public.players;
  v_owner text;
  v_spent integer;
  v_count integer;
  v_limit integer;
begin
  select * into v_player from public.players where id = new.player_id;
  if v_player.league_id is distinct from new.league_id then
    raise exception 'Il giocatore non appartiene a questa lega';
  end if;
  if not v_player.active and (tg_op = 'INSERT' or new.player_id <> old.player_id) then
    raise exception 'Il giocatore % non è attivo', v_player.name;
  end if;

  -- Serializza le modifiche alla stessa rosa (evita di superare i limiti in parallelo)
  perform 1 from public.league_members m
  where m.league_id = new.league_id and m.user_id = new.user_id
  for update;

  select m.team_name into v_owner
  from public.roster_entries r
  join public.league_members m on m.league_id = r.league_id and m.user_id = r.user_id
  where r.league_id = new.league_id and r.player_id = new.player_id and r.id <> new.id;
  if found then
    raise exception 'Giocatore già preso da %', v_owner;
  end if;

  select * into v_league from public.leagues where id = new.league_id;

  select coalesce(sum(r.cost), 0) into v_spent
  from public.roster_entries r
  where r.league_id = new.league_id and r.user_id = new.user_id and r.id <> new.id;
  if v_spent + new.cost > v_league.budget then
    raise exception 'Budget superato: residuo %, costo %', v_league.budget - v_spent, new.cost;
  end if;

  select count(*) into v_count
  from public.roster_entries r
  join public.players p on p.id = r.player_id
  where r.league_id = new.league_id and r.user_id = new.user_id
    and r.id <> new.id and p.role = v_player.role;
  v_limit := case v_player.role
    when 'P' then v_league.n_gk
    when 'D' then v_league.n_def
    when 'C' then v_league.n_mid
    else v_league.n_att
  end;
  if v_count + 1 > v_limit then
    raise exception 'Ruolo % al completo: massimo % giocatori', v_player.role, v_limit;
  end if;

  return new;
end;
$$;

create trigger roster_entries_check
  before insert or update on public.roster_entries
  for each row execute function private.check_roster_entry();

-- -------------------------------------------------------------
-- Calendario scontri diretti (girone all'italiana, metodo del cerchio)
-- -------------------------------------------------------------
-- Gli accoppiamenti dipendono solo dal numero della giornata e dalla
-- posizione in calendario delle squadre: con N squadre il girone dura
-- N-1 giornate (N pari) e poi si ripete invertendo casa/trasferta.
create function private.build_fixtures(p_matchday_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_md public.matchdays;
  v_teams uuid[];
  v_n integer;
  v_rounds integer;
  v_round integer;
  v_cycle integer;
  v_a integer;
  v_b integer;
  v_tmp integer;
  v_home uuid;
  v_away uuid;
begin
  select * into v_md from public.matchdays where id = p_matchday_id;
  if not found or v_md.status = 'scored' then
    return;
  end if;

  delete from public.fixtures where matchday_id = p_matchday_id;

  select array_agg(m.user_id order by m.calendar_position) into v_teams
  from public.league_members m
  where m.league_id = v_md.league_id and m.calendar_position is not null;

  v_n := coalesce(cardinality(v_teams), 0);
  if v_n < 2 then
    return;
  end if;
  -- Numero dispari: si aggiunge un "riposo" (null)
  if v_n % 2 = 1 then
    v_teams := array_append(v_teams, null);
    v_n := v_n + 1;
  end if;

  v_rounds := v_n - 1;
  v_round := (v_md.number - 1) % v_rounds;
  v_cycle := (v_md.number - 1) / v_rounds;

  for i in 0 .. v_n / 2 - 1 loop
    if i = 0 then
      -- La squadra in ultima posizione resta fissa; alterna casa/trasferta
      v_a := v_n - 1;
      v_b := v_round;
      if v_round % 2 = 1 then
        v_tmp := v_a; v_a := v_b; v_b := v_tmp;
      end if;
    else
      v_a := (v_round + i) % v_rounds;
      v_b := (v_round - i + v_rounds) % v_rounds;
    end if;

    v_home := v_teams[v_a + 1];
    v_away := v_teams[v_b + 1];
    -- Nel girone di ritorno si invertono casa e trasferta
    if v_cycle % 2 = 1 then
      v_home := v_teams[v_b + 1];
      v_away := v_teams[v_a + 1];
    end if;

    if v_home is not null and v_away is not null then
      insert into public.fixtures (matchday_id, league_id, home_user_id, away_user_id)
      values (p_matchday_id, v_md.league_id, v_home, v_away);
    end if;
  end loop;
end;
$$;

create function private.on_matchday_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.build_fixtures(new.id);
  return new;
end;
$$;

create trigger matchdays_build_fixtures
  after insert on public.matchdays
  for each row execute function private.on_matchday_created();
