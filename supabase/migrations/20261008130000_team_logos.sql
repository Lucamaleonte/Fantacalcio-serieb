-- =============================================================
-- Fantacalcio Serie B – 08 Loghi delle squadre
-- =============================================================
-- Ogni squadra carica il proprio logo (immagine quadrata, ridotta nel
-- browser a 256 px) nel bucket pubblico "team-logos", nella cartella
-- <league_id>/<user_id>/. Il percorso del logo attuale è in
-- league_members.logo_path. Solo la squadra stessa può cambiarlo:
-- nemmeno l'admin cambia il logo degli altri.

-- -------------------------------------------------------------
-- Colonna con il percorso del logo (sempre nella cartella della squadra)
-- -------------------------------------------------------------
alter table public.league_members
  add column logo_path text
  check (
    logo_path is null
    or (char_length(logo_path) <= 200
        and logo_path like league_id::text || '/' || user_id::text || '/%')
  );

grant update (logo_path) on public.league_members to authenticated;

-- La policy di modifica di league_members vale anche per l'admin:
-- il trigger limita il logo alla squadra stessa
create function private.check_logo_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.logo_path is distinct from old.logo_path
     and new.user_id <> (select auth.uid()) then
    raise exception 'Il logo può cambiarlo solo la squadra stessa';
  end if;
  return new;
end;
$$;

revoke execute on function private.check_logo_owner() from public, anon, authenticated;

create trigger league_members_logo_owner
  before update of logo_path on public.league_members
  for each row execute function private.check_logo_owner();

-- -------------------------------------------------------------
-- Storage: bucket pubblico in lettura (link non indovinabili), max 512 KB
-- -------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('team-logos', 'team-logos', true, 524288,
        array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Vero se il file è nella cartella <league_id>/<user_id>/ dell'utente collegato
create function private.is_own_logo_folder(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.user_id = (select auth.uid())
      and p_name like m.league_id::text || '/' || m.user_id::text || '/%'
  )
$$;

revoke execute on function private.is_own_logo_folder(text) from public, anon, authenticated;
grant execute on function private.is_own_logo_folder(text) to authenticated;

-- Caricamento, lettura (serve anche per cancellare) e cancellazione:
-- solo nella propria cartella. Nessuna modifica: ogni logo ha un nome nuovo.
create policy "loghi: caricamento nella propria cartella" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'team-logos' and private.is_own_logo_folder(name));

create policy "loghi: lettura della propria cartella" on storage.objects
  for select to authenticated
  using (bucket_id = 'team-logos' and private.is_own_logo_folder(name));

create policy "loghi: cancellazione nella propria cartella" on storage.objects
  for delete to authenticated
  using (bucket_id = 'team-logos' and private.is_own_logo_folder(name));
