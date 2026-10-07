-- =============================================================
-- Fantacalcio Serie B – 05 Correzione GRANT
-- =============================================================
-- Il progetto concede ancora in automatico TUTTI i permessi sulle tabelle
-- nuove ad anon e authenticated (vecchi default di Supabase). I GRANT per
-- colonna della migrazione 04 si sommavano a quelli invece di sostituirli:
-- per esempio un membro poteva cambiare il proprio "role" in admin.
-- Qui si tolgono tutti i permessi e si riassegnano solo quelli previsti.

-- Default per gli oggetti creati in futuro: nessun permesso automatico
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Tabelle e vista: via tutto, poi solo i permessi necessari
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

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

-- Funzioni: solo le RPC agli utenti loggati
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.create_league(text, text) to authenticated;
grant execute on function public.join_league(text, text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.generate_calendar(uuid) to authenticated;
grant execute on function public.save_lineup(uuid, text, uuid[], uuid[]) to authenticated;
grant execute on function public.import_votes(uuid, jsonb) to authenticated;
grant execute on function public.save_matchday_results(uuid, jsonb) to authenticated;
