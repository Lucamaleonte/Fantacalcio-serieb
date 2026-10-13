-- =============================================================
-- Fantacalcio Serie B – 09 Bonus e malus dei voti
-- =============================================================
-- Ogni voto può avere gli eventi della partita (gol, assist, cartellini,
-- gol subiti, porta inviolata, rigori, autogol), mostrati nella sfida
-- accanto al voto base e al fantavoto. Il fantavoto resta quello
-- importato: gli eventi servono solo a vederli.
--
-- Formato: {"gol": 1, "assist": 2, "amm": 1, "esp": 1, "gs": 3, "pi": 1,
--           "rp": 1, "rs": 1, "au": 1}  (chiavi assenti = 0)

alter table public.player_votes
  add column events jsonb not null default '{}'::jsonb
  check (jsonb_typeof(events) = 'object');

-- Tiene solo le chiavi note con valori interi da 1 a 20
create function private.clean_vote_events(p_events jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value::numeric::integer), '{}'::jsonb)
  from jsonb_each(
    case when jsonb_typeof(p_events) = 'object' then p_events else '{}'::jsonb end
  ) as e
  where e.key in ('gol', 'assist', 'amm', 'esp', 'gs', 'pi', 'rp', 'rs', 'au')
    and case
      when jsonb_typeof(e.value) = 'number'
        then e.value::numeric between 1 and 20
          and e.value::numeric = trunc(e.value::numeric)
      else false
    end
$$;

revoke execute on function private.clean_vote_events(jsonb) from public, anon, authenticated;

-- -------------------------------------------------------------
-- Import voti (solo admin): come prima, più gli eventi.
-- Una riga senza "events" (es. correzione a mano del fantavoto)
-- mantiene gli eventi già salvati.
-- -------------------------------------------------------------
create or replace function public.import_votes(p_matchday_id uuid, p_rows jsonb)
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

  insert into public.player_votes (matchday_id, player_id, vote, fantavote, events)
  select distinct on (p.id)
    p_matchday_id, p.id, (r ->> 'vote')::numeric, (r ->> 'fantavote')::numeric,
    case
      when r ? 'events' then private.clean_vote_events(r -> 'events')
      else coalesce(
        (select v.events from public.player_votes v
         where v.matchday_id = p_matchday_id and v.player_id = p.id),
        '{}'::jsonb)
    end
  from jsonb_array_elements(p_rows) as r
  join public.players p
    on p.id = (r ->> 'player_id')::uuid and p.league_id = v_league_id
  order by p.id
  on conflict (matchday_id, player_id)
  do update set vote = excluded.vote, fantavote = excluded.fantavote,
    events = excluded.events;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
