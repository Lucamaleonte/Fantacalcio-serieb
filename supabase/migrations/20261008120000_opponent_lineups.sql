-- =============================================================
-- Fantacalcio Serie B – 07 Formazione dell'avversario prima della scadenza
-- =============================================================
-- Prima della scadenza ognuno vede anche la formazione dell'avversario
-- diretto della giornata (stessa partita in fixtures); quelle delle altre
-- squadre restano nascoste fino alla scadenza. Scrittura invariata: solo
-- la propria, tramite save_lineup.

-- Vero se l'utente collegato e p_user_id si affrontano nella giornata
create function private.is_opponent(p_matchday_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.fixtures f
    where f.matchday_id = p_matchday_id
      and (
        (f.home_user_id = (select auth.uid()) and f.away_user_id = p_user_id)
        or (f.away_user_id = (select auth.uid()) and f.home_user_id = p_user_id)
      )
  )
$$;

revoke execute on function private.is_opponent(uuid, uuid) from public, anon, authenticated;
grant execute on function private.is_opponent(uuid, uuid) to authenticated;

-- lineup_players segue la visibilità di lineups (la sua policy usa exists su lineups)
drop policy "formazioni: lettura" on public.lineups;

create policy "formazioni: lettura" on public.lineups
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (private.is_league_member(league_id) and private.is_matchday_closed(matchday_id))
    or private.is_opponent(matchday_id, user_id)
  );
