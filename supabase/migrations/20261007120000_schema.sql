-- =============================================================
-- Fantacalcio Serie B – 01 Schema: tabelle e vincoli
-- =============================================================

-- Schema per le funzioni interne: NON esposto dalla Data API
create schema if not exists private;

-- Modulo valido: "D-C-A" con somma 10 (es. 4-4-2)
create function private.is_valid_formation(f text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when f ~ '^[1-9]-[1-9]-[1-9]$' then
      split_part(f, '-', 1)::int + split_part(f, '-', 2)::int + split_part(f, '-', 3)::int = 10
    else false
  end
$$;

create function private.are_valid_formations(fs text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(fs) > 0
    and coalesce((select bool_and(private.is_valid_formation(x)) from unnest(fs) as x), false)
$$;

-- -------------------------------------------------------------
-- Profili (uno per utente di Supabase Auth)
-- -------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 50),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Leghe
-- -------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  invite_code text not null unique,
  admin_id uuid not null references public.profiles (id),
  budget integer not null default 500 check (budget > 0),
  n_gk integer not null default 3 check (n_gk between 1 and 10),
  n_def integer not null default 8 check (n_def between 1 and 20),
  n_mid integer not null default 8 check (n_mid between 1 and 20),
  n_att integer not null default 6 check (n_att between 1 and 20),
  allowed_formations text[] not null
    default array['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2']
    check (private.are_valid_formations(allowed_formations)),
  max_substitutions integer not null default 5 check (max_substitutions between 0 and 11),
  no_vote_value numeric(6, 2) not null default 0,
  -- Scontri diretti: fantapunti -> gol (66 = 1 gol, poi +1 ogni 6 punti)
  goal_threshold numeric(6, 2) not null default 66 check (goal_threshold > 0),
  goal_step numeric(6, 2) not null default 6 check (goal_step > 0),
  rosters_locked boolean not null default false,
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------
-- Membri della lega
-- -------------------------------------------------------------
create table public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_name text not null check (char_length(btrim(team_name)) between 1 and 40),
  role text not null default 'member' check (role in ('admin', 'member')),
  -- Posizione nel calendario degli scontri diretti (assegnata da generate_calendar)
  calendar_position integer check (calendar_position >= 0),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id),
  unique (league_id, team_name),
  unique (league_id, calendar_position)
);

create index league_members_user_idx on public.league_members (user_id);

-- -------------------------------------------------------------
-- Giocatori (lista della lega, gestita dall'admin)
-- -------------------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  role text not null check (role in ('P', 'D', 'C', 'A')),
  real_team text not null check (char_length(btrim(real_team)) between 1 and 40),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (league_id, name, real_team)
);

-- -------------------------------------------------------------
-- Rose: un giocatore appartiene a una sola squadra per lega
-- -------------------------------------------------------------
create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  user_id uuid not null,
  player_id uuid not null references public.players (id),
  cost integer not null check (cost >= 0),
  created_at timestamptz not null default now(),
  foreign key (league_id, user_id)
    references public.league_members (league_id, user_id) on delete cascade,
  unique (league_id, player_id)
);

create index roster_entries_owner_idx on public.roster_entries (league_id, user_id);
create index roster_entries_player_idx on public.roster_entries (player_id);

-- -------------------------------------------------------------
-- Giornate
-- -------------------------------------------------------------
create table public.matchdays (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  number integer not null check (number between 1 and 60),
  deadline timestamptz not null,
  status text not null default 'open' check (status in ('open', 'locked', 'scored')),
  created_at timestamptz not null default now(),
  unique (league_id, number)
);

-- -------------------------------------------------------------
-- Scontri diretti (calendario e risultati)
-- -------------------------------------------------------------
create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays (id) on delete cascade,
  league_id uuid not null,
  home_user_id uuid not null,
  away_user_id uuid not null,
  home_points numeric(6, 2),
  away_points numeric(6, 2),
  home_goals integer,
  away_goals integer,
  foreign key (league_id, home_user_id)
    references public.league_members (league_id, user_id) on delete cascade,
  foreign key (league_id, away_user_id)
    references public.league_members (league_id, user_id) on delete cascade,
  check (home_user_id <> away_user_id),
  unique (matchday_id, home_user_id),
  unique (matchday_id, away_user_id)
);

create index fixtures_league_idx on public.fixtures (league_id);

-- -------------------------------------------------------------
-- Formazioni
-- -------------------------------------------------------------
create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays (id) on delete cascade,
  league_id uuid not null,
  user_id uuid not null,
  formation text not null check (private.is_valid_formation(formation)),
  updated_at timestamptz not null default now(),
  foreign key (league_id, user_id)
    references public.league_members (league_id, user_id) on delete cascade,
  unique (matchday_id, user_id)
);

create table public.lineup_players (
  lineup_id uuid not null references public.lineups (id) on delete cascade,
  player_id uuid not null references public.players (id),
  slot text not null check (slot in ('starter', 'bench')),
  -- Ordine: per la panchina conta nelle sostituzioni
  position integer not null check (position >= 1),
  primary key (lineup_id, player_id),
  unique (lineup_id, slot, position)
);

create index lineup_players_player_idx on public.lineup_players (player_id);

-- -------------------------------------------------------------
-- Voti (null = senza voto)
-- -------------------------------------------------------------
create table public.player_votes (
  matchday_id uuid not null references public.matchdays (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  vote numeric(6, 2) check (vote between 0 and 10),
  fantavote numeric(6, 2),
  primary key (matchday_id, player_id)
);

create index player_votes_player_idx on public.player_votes (player_id);

-- -------------------------------------------------------------
-- Punteggi per giornata
-- -------------------------------------------------------------
create table public.matchday_scores (
  matchday_id uuid not null references public.matchdays (id) on delete cascade,
  league_id uuid not null,
  user_id uuid not null,
  points numeric(6, 2) not null,
  -- titolari, sostituzioni, voti usati
  details jsonb not null default '{}'::jsonb,
  primary key (matchday_id, user_id),
  foreign key (league_id, user_id)
    references public.league_members (league_id, user_id) on delete cascade
);

create index matchday_scores_league_idx on public.matchday_scores (league_id);
