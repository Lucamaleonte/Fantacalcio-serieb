-- =============================================================
-- Fantacalcio Serie B – 06 Rose modificabili solo dall'admin
-- =============================================================
-- L'asta si fa dal vivo e l'admin inserisce tutte le rose: i membri
-- possono solo leggerle. Le policy di roster_entries usano già questa
-- funzione, quindi basta ridefinirla (stessa firma, stessi GRANT).
-- Il parametro p_user_id resta per compatibilità con le policy.

create or replace function private.can_edit_roster(p_league_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_league_admin(p_league_id)
$$;
