-- =============================================================
-- Fantacalcio Serie B – 04 Row Level Security, vista classifica, GRANT
-- =============================================================
-- La sicurezza dei dati è garantita SOLO da qui: il frontend è pubblico.
-- Le scritture non elencate passano dalle funzioni RPC (03_rpc).

-- -------------------------------------------------------------
-- RLS attiva su tutte le tabelle
-- -------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.players enable row level security;
alter table public.roster_entries enable row level security;
alter table public.matchdays enable row level security;
alter table public.fixtures enable row level security;
alter table public.lineups enable row level security;
alter table public.lineup_players enable row level security;
alter table public.player_votes enable row level security;
alter table public.matchday_scores enable row level security;

-- profiles: il proprio profilo e quelli dei compagni di lega
create policy "profili: lettura" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.shares_league_with(id));

create policy "profili: modifica del proprio" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- leagues: lettura ai membri, modifica all'admin (creazione via create_league)
create policy "leghe: lettura membri" on public.leagues
  for select to authenticated
  using (private.is_league_member(id));

create policy "leghe: modifica admin" on public.leagues
  for update to authenticated
  using (private.is_league_admin(id))
  with check (private.is_league_admin(id));

-- league_members: ingresso via join_league
create policy "membri: lettura membri" on public.league_members
  for select to authenticated
  using (private.is_league_member(league_id));

create policy "membri: modifica nome squadra" on public.league_members
  for update to authenticated
  using (user_id = (select auth.uid()) or private.is_league_admin(league_id))
  with check (user_id = (select auth.uid()) or private.is_league_admin(league_id));

create policy "membri: rimozione da admin" on public.league_members
  for delete to authenticated
  using (private.is_league_admin(league_id) and role <> 'admin');

-- players: lettura ai membri, scrittura all'admin
create policy "giocatori: lettura membri" on public.players
  for select to authenticated
  using (private.is_league_member(league_id));

create policy "giocatori: inserimento admin" on public.players
  for insert to authenticated
  with check (private.is_league_admin(league_id));

create policy "giocatori: modifica admin" on public.players
  for update to authenticated
  using (private.is_league_admin(league_id))
  with check (private.is_league_admin(league_id));

create policy "giocatori: eliminazione admin" on public.players
  for delete to authenticated
  using (private.is_league_admin(league_id));

-- roster_entries: lettura ai membri; il membro scrive solo la propria rosa
-- (se non bloccata), l'admin tutte
create policy "rose: lettura membri" on public.roster_entries
  for select to authenticated
  using (private.is_league_member(league_id));

create policy "rose: inserimento" on public.roster_entries
  for insert to authenticated
  with check (private.can_edit_roster(league_id, user_id));

create policy "rose: modifica" on public.roster_entries
  for update to authenticated
  using (private.can_edit_roster(league_id, user_id))
  with check (private.can_edit_roster(league_id, user_id));

create policy "rose: eliminazione" on public.roster_entries
  for delete to authenticated
  using (private.can_edit_roster(league_id, user_id));

-- matchdays: lettura ai membri, scrittura all'admin
create policy "giornate: lettura membri" on public.matchdays
  for select to authenticated
  using (private.is_league_member(league_id));

create policy "giornate: inserimento admin" on public.matchdays
  for insert to authenticated
  with check (private.is_league_admin(league_id));

create policy "giornate: modifica admin" on public.matchdays
  for update to authenticated
  using (private.is_league_admin(league_id))
  with check (private.is_league_admin(league_id));

create policy "giornate: eliminazione admin" on public.matchdays
  for delete to authenticated
  using (private.is_league_admin(league_id));

-- fixtures: sola lettura (scritte da calendario e save_matchday_results)
create policy "partite: lettura membri" on public.fixtures
  for select to authenticated
  using (private.is_league_member(league_id));

-- lineups: la propria sempre; quelle degli altri solo dopo la scadenza.
-- Scrittura solo tramite save_lineup.
create policy "formazioni: lettura" on public.lineups
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_league_member(league_id) and private.is_matchday_closed(matchday_id))
  );

create policy "formazioni giocatori: lettura" on public.lineup_players
  for select to authenticated
  using (exists (select 1 from public.lineups l where l.id = lineup_id));

-- player_votes e matchday_scores: sola lettura (scritte dalle RPC admin)
create policy "voti: lettura membri" on public.player_votes
  for select to authenticated
  using (private.is_league_member(private.matchday_league_id(matchday_id)));

create policy "punteggi: lettura membri" on public.matchday_scores
  for select to authenticated
  using (private.is_league_member(league_id));

-- -------------------------------------------------------------
-- Vista classifica (scontri diretti: V=3, N=1, P=0)
-- security_invoker: rispetta la RLS di chi la interroga.
-- Ordinamento consigliato: points desc, fantapoints desc, goal_difference desc
-- -------------------------------------------------------------
create view public.standings
with (security_invoker = true)
as
with results as (
  select f.league_id, f.home_user_id as user_id,
    f.home_goals as goals_for, f.away_goals as goals_against
  from public.fixtures f
  join public.matchdays md on md.id = f.matchday_id
  where md.status = 'scored' and f.home_goals is not null
  union all
  select f.league_id, f.away_user_id,
    f.away_goals, f.home_goals
  from public.fixtures f
  join public.matchdays md on md.id = f.matchday_id
  where md.status = 'scored' and f.away_goals is not null
),
totals as (
  select m.league_id, m.user_id, m.team_name,
    count(r.user_id)::int as played,
    count(*) filter (where r.goals_for > r.goals_against)::int as won,
    count(*) filter (where r.goals_for = r.goals_against)::int as drawn,
    count(*) filter (where r.goals_for < r.goals_against)::int as lost,
    coalesce(sum(r.goals_for), 0)::int as goals_for,
    coalesce(sum(r.goals_against), 0)::int as goals_against
  from public.league_members m
  left join results r on r.league_id = m.league_id and r.user_id = m.user_id
  group by m.league_id, m.user_id, m.team_name
)
select
  t.league_id,
  t.user_id,
  t.team_name,
  t.played,
  t.won,
  t.drawn,
  t.lost,
  t.goals_for,
  t.goals_against,
  t.goals_for - t.goals_against as goal_difference,
  t.won * 3 + t.drawn as points,
  coalesce((
    select sum(ms.points)
    from public.matchday_scores ms
    join public.matchdays md on md.id = ms.matchday_id
    where ms.league_id = t.league_id and ms.user_id = t.user_id and md.status = 'scored'
  ), 0) as fantapoints
from totals t;

-- -------------------------------------------------------------
-- GRANT espliciti (obbligatori per la Data API nei progetti nuovi).
-- anon (utente non loggato) non ha accesso a nulla.
-- -------------------------------------------------------------
grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

revoke all on all tables in schema public from anon;

grant select, update (display_name) on public.profiles to authenticated;

grant select,
  update (name, budget, n_gk, n_def, n_mid, n_att, allowed_formations,
          max_substitutions, no_vote_value, goal_threshold, goal_step, rosters_locked)
  on public.leagues to authenticated;

grant select, update (team_name), delete on public.league_members to authenticated;

grant select, insert, update, delete on public.players to authenticated;

grant select, insert, update (cost), delete on public.roster_entries to authenticated;

grant select, insert, update (deadline, status), delete on public.matchdays to authenticated;

grant select on public.fixtures to authenticated;
grant select on public.lineups to authenticated;
grant select on public.lineup_players to authenticated;
grant select on public.player_votes to authenticated;
grant select on public.matchday_scores to authenticated;
grant select on public.standings to authenticated;

-- Funzioni: di default Postgres le rende eseguibili da tutti (PUBLIC).
-- Le RPC solo agli utenti loggati; le funzioni interne solo dove servono alle policy.
revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;

grant execute on function public.create_league(text, text) to authenticated;
grant execute on function public.join_league(text, text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.generate_calendar(uuid) to authenticated;
grant execute on function public.save_lineup(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.import_votes(uuid, jsonb) to authenticated;
grant execute on function public.save_matchday_results(uuid, jsonb) to authenticated;

grant execute on function private.is_league_member(uuid) to authenticated;
grant execute on function private.is_league_admin(uuid) to authenticated;
grant execute on function private.shares_league_with(uuid) to authenticated;
grant execute on function private.matchday_league_id(uuid) to authenticated;
grant execute on function private.is_matchday_closed(uuid) to authenticated;
grant execute on function private.can_edit_roster(uuid, uuid) to authenticated;
grant execute on function private.is_valid_formation(text) to authenticated;
grant execute on function private.are_valid_formations(text[]) to authenticated;
