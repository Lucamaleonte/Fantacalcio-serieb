-- =============================================================
-- Fantacalcio Serie B – 07 Formazioni visibili a tutti i membri
-- =============================================================
-- Ogni membro della lega vede le formazioni di tutte le squadre in ogni
-- momento, anche prima della scadenza (finché è aperta si possono ancora
-- cambiare). Scrittura invariata: solo la propria, tramite save_lineup.

-- lineup_players segue la visibilità di lineups (la sua policy usa exists su lineups)
drop policy if exists "formazioni: lettura" on public.lineups;

create policy "formazioni: lettura" on public.lineups
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_league_member(league_id)
  );

-- Funzione di una versione precedente di questa migrazione, non più usata
drop function if exists private.is_opponent(uuid, uuid);
