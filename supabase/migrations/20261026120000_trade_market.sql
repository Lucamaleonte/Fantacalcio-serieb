-- =============================================================
-- Fantacalcio Serie B – 10 Mercato scambi
-- =============================================================
-- Quando l'admin apre il mercato, una squadra propone uno scambio a
-- un'altra (giocatori che dà + giocatori che chiede); se l'altra accetta,
-- lo scambio è eseguito subito. Le proposte le vedono solo le due squadre,
-- gli scambi conclusi tutta la lega. L'admin può annullare uno scambio.
--
-- Crediti: ogni giocatore mantiene il costo pagato all'asta (serve per un
-- eventuale svincolo). Lo scambio non cambia i crediti disponibili: la
-- differenza di valore finisce nel saldo scambi della squadra
-- (league_members.trade_balance). Il valore della rosa può quindi superare
-- il budget; il controllo diventa: valore rosa <= budget + saldo scambi.
-- Esempio: A dà un giocatore da 1 e riceve uno da 7 -> valore rosa +6,
-- saldo +6, crediti disponibili invariati; B il contrario.

-- -------------------------------------------------------------
-- Colonne nuove (scrivibili solo dalle funzioni qui sotto)
-- -------------------------------------------------------------
alter table public.leagues
  add column trade_market_open boolean not null default false;

alter table public.league_members
  add column trade_balance integer not null default 0;

-- -------------------------------------------------------------
-- Proposte di scambio
-- -------------------------------------------------------------
create table public.trades (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  proposer_id uuid not null,
  receiver_id uuid not null,
  -- pending = in attesa, accepted = eseguito, rejected = rifiutato,
  -- withdrawn = ritirato, expired = decaduto (mercato chiuso o giocatori
  -- già scambiati), cancelled = eseguito e poi annullato dall'admin
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'withdrawn', 'expired', 'cancelled')),
  message text check (char_length(message) <= 200),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  cancelled_at timestamptz,
  foreign key (league_id, proposer_id)
    references public.league_members (league_id, user_id) on delete cascade,
  foreign key (league_id, receiver_id)
    references public.league_members (league_id, user_id) on delete cascade,
  check (proposer_id <> receiver_id)
);

create index trades_league_idx on public.trades (league_id, created_at desc);

-- Giocatori di ogni proposta: from_user_id è la squadra che lo cede.
-- cost: costo d'asta al momento della proposta (aggiornato quando lo
-- scambio è eseguito), resta come storico.
create table public.trade_players (
  trade_id uuid not null references public.trades (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  from_user_id uuid not null,
  cost integer not null check (cost >= 0),
  primary key (trade_id, player_id)
);

create index trade_players_player_idx on public.trade_players (player_id);

-- -------------------------------------------------------------
-- Rose: il controllo del budget tiene conto del saldo scambi.
-- Durante uno scambio (fanta.trade_in_progress = 'on', impostato solo da
-- private.execute_trade) budget e ruoli si controllano a scambio finito:
-- spostando un giocatore alla volta, due rose piene supererebbero per un
-- attimo il limite del ruolo.
-- -------------------------------------------------------------
create or replace function private.check_roster_entry()
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
  v_balance integer;
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
  select m.trade_balance into v_balance
  from public.league_members m
  where m.league_id = new.league_id and m.user_id = new.user_id
  for update;

  select m.team_name into v_owner
  from public.roster_entries r
  join public.league_members m on m.league_id = r.league_id and m.user_id = r.user_id
  where r.league_id = new.league_id and r.player_id = new.player_id and r.id <> new.id;
  if found then
    raise exception 'Giocatore già preso da %', v_owner;
  end if;

  if coalesce(current_setting('fanta.trade_in_progress', true), '') = 'on' then
    return new;
  end if;

  select * into v_league from public.leagues where id = new.league_id;

  select coalesce(sum(r.cost), 0) into v_spent
  from public.roster_entries r
  where r.league_id = new.league_id and r.user_id = new.user_id and r.id <> new.id;
  if v_spent + new.cost > v_league.budget + coalesce(v_balance, 0) then
    raise exception 'Budget superato: residuo %, costo %',
      v_league.budget + coalesce(v_balance, 0) - v_spent, new.cost;
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

-- -------------------------------------------------------------
-- Limiti per ruolo dopo lo scambio: messaggio d'errore o null se va bene.
-- Si controllano solo i ruoli in cui una squadra riceve più di quanti ne
-- cede (una rosa già oltre il limite non blocca uno scambio che non la
-- peggiora). p_reverse = true: scambio al contrario (annullamento).
-- -------------------------------------------------------------
create function private.trade_role_problem(p_trade_id uuid, p_reverse boolean)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select * from public.trades where id = p_trade_id
  ),
  items as (
    select tp.player_id, p.role,
      case
        when not p_reverse then tp.from_user_id
        when tp.from_user_id = t.proposer_id then t.receiver_id
        else t.proposer_id
      end as giver
    from public.trade_players tp
    join public.players p on p.id = tp.player_id
    cross join t
    where tp.trade_id = p_trade_id
  ),
  sides as (
    select t.league_id, t.proposer_id as user_id, t.receiver_id as other_id from t
    union all
    select t.league_id, t.receiver_id, t.proposer_id from t
  ),
  delta as (
    select s.league_id, s.user_id, i.role,
      count(*) filter (where i.giver = s.other_id) as incoming,
      count(*) filter (where i.giver = s.user_id) as outgoing
    from sides s
    join items i on true
    group by s.league_id, s.user_id, i.role
  )
  select format('%s avrebbe %s %s (massimo %s)',
    m.team_name, c.n + d.incoming - d.outgoing,
    case d.role when 'P' then 'portieri' when 'D' then 'difensori'
      when 'C' then 'centrocampisti' else 'attaccanti' end,
    lim.n)
  from delta d
  join public.leagues l on l.id = d.league_id
  join public.league_members m on m.league_id = d.league_id and m.user_id = d.user_id
  cross join lateral (
    select case d.role when 'P' then l.n_gk when 'D' then l.n_def
      when 'C' then l.n_mid else l.n_att end as n
  ) lim
  cross join lateral (
    select count(*) as n
    from public.roster_entries r
    join public.players p on p.id = r.player_id
    where r.league_id = d.league_id and r.user_id = d.user_id and p.role = d.role
  ) c
  where d.incoming > d.outgoing
    and c.n + d.incoming - d.outgoing > lim.n
  order by m.team_name, d.role
  limit 1
$$;

-- -------------------------------------------------------------
-- Spostamenti di uno scambio: per ogni giocatore chi lo cede (giver), chi
-- lo riceve (taker), il costo attuale e il proprietario attuale (owner).
-- -------------------------------------------------------------
create function private.trade_moves(p_trade_id uuid, p_reverse boolean)
returns table (player_id uuid, giver uuid, taker uuid, cost integer, owner uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select tp.player_id, x.giver,
    case when x.giver = t.proposer_id then t.receiver_id else t.proposer_id end,
    r.cost, r.user_id
  from public.trades t
  join public.trade_players tp on tp.trade_id = t.id
  cross join lateral (
    select case
      when not p_reverse then tp.from_user_id
      when tp.from_user_id = t.proposer_id then t.receiver_id
      else t.proposer_id
    end as giver
  ) x
  left join public.roster_entries r
    on r.league_id = t.league_id and r.player_id = tp.player_id
  where t.id = p_trade_id
$$;

-- -------------------------------------------------------------
-- Esegue lo scambio (p_reverse = true: lo riporta indietro).
-- Da chiamare solo dalle RPC qui sotto, che controllano chi può farlo.
-- -------------------------------------------------------------
create function private.execute_trade(p_trade_id uuid, p_reverse boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades;
  v_problem text;
  v_moved uuid[];
begin
  select * into v_trade from public.trades where id = p_trade_id;

  -- Blocca le due rose (sempre nello stesso ordine: niente stalli)
  perform 1 from public.league_members m
  where m.league_id = v_trade.league_id
    and m.user_id in (v_trade.proposer_id, v_trade.receiver_id)
  order by m.user_id
  for update;

  select format('%s non è più nella rosa di %s', p.name, m.team_name) into v_problem
  from private.trade_moves(p_trade_id, p_reverse) mv
  join public.players p on p.id = mv.player_id
  join public.league_members m on m.league_id = v_trade.league_id and m.user_id = mv.giver
  where mv.owner is distinct from mv.giver
  limit 1;
  if v_problem is not null then
    raise exception 'Scambio non più valido: %', v_problem;
  end if;

  v_problem := private.trade_role_problem(p_trade_id, p_reverse);
  if v_problem is not null then
    raise exception 'Scambio non valido: %', v_problem;
  end if;

  -- Il valore ceduto esce dal saldo di chi cede ed entra in quello di chi riceve
  update public.league_members m
  set trade_balance = m.trade_balance + coalesce((
      select sum(mv.cost) from private.trade_moves(p_trade_id, p_reverse) mv
      where mv.taker = m.user_id
    ), 0) - coalesce((
      select sum(mv.cost) from private.trade_moves(p_trade_id, p_reverse) mv
      where mv.giver = m.user_id
    ), 0)
  where m.league_id = v_trade.league_id
    and m.user_id in (v_trade.proposer_id, v_trade.receiver_id);

  if not p_reverse then
    update public.trade_players tp
    set cost = mv.cost
    from private.trade_moves(p_trade_id, false) mv
    where tp.trade_id = p_trade_id and tp.player_id = mv.player_id;
  end if;

  select array_agg(mv.player_id) into v_moved
  from private.trade_moves(p_trade_id, p_reverse) mv;

  perform set_config('fanta.trade_in_progress', 'on', true);
  update public.roster_entries r
  set user_id = mv.taker
  from private.trade_moves(p_trade_id, p_reverse) mv
  where r.league_id = v_trade.league_id and r.player_id = mv.player_id;
  perform set_config('fanta.trade_in_progress', '', true);

  -- Formazioni ancora modificabili: via i giocatori che non sono più in rosa
  -- (quelle già chiuse restano come sono: la giornata conta per chi li aveva)
  delete from public.lineup_players lp
  using public.lineups l, public.matchdays md
  where lp.lineup_id = l.id
    and md.id = l.matchday_id
    and l.league_id = v_trade.league_id
    and md.status = 'open'
    and now() < md.deadline
    and lp.player_id = any (v_moved)
    and not exists (
      select 1 from public.roster_entries r
      where r.league_id = l.league_id and r.user_id = l.user_id and r.player_id = lp.player_id
    );

  -- Le altre proposte con questi giocatori non sono più valide
  update public.trades t
  set status = 'expired', decided_at = now()
  where t.league_id = v_trade.league_id
    and t.status = 'pending'
    and t.id <> p_trade_id
    and exists (
      select 1 from public.trade_players tp
      where tp.trade_id = t.id and tp.player_id = any (v_moved)
    );
end;
$$;

-- -------------------------------------------------------------
-- RPC: apre o chiude il mercato (solo admin).
-- Chiudendolo, le proposte in attesa decadono.
-- -------------------------------------------------------------
create function public.set_trade_market(p_league_id uuid, p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_league_admin(p_league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;

  update public.leagues set trade_market_open = coalesce(p_open, false)
  where id = p_league_id;

  if not coalesce(p_open, false) then
    update public.trades
    set status = 'expired', decided_at = now()
    where league_id = p_league_id and status = 'pending';
  end if;
end;
$$;

-- -------------------------------------------------------------
-- RPC: propone uno scambio (mercato aperto, giocatori delle due rose)
-- -------------------------------------------------------------
create function public.propose_trade(
  p_league_id uuid,
  p_receiver_id uuid,
  p_give uuid[],
  p_get uuid[],
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_receiver text;
  v_all uuid[];
  v_trade_id uuid;
  v_problem text;
begin
  if v_uid is null then
    raise exception 'Devi effettuare l''accesso';
  end if;
  if not private.is_league_member(p_league_id) then
    raise exception 'Lega non trovata';
  end if;
  if not coalesce((select trade_market_open from public.leagues where id = p_league_id), false) then
    raise exception 'Il mercato scambi è chiuso';
  end if;

  select team_name into v_receiver
  from public.league_members
  where league_id = p_league_id and user_id = p_receiver_id;
  if not found then
    raise exception 'Squadra non trovata';
  end if;
  if p_receiver_id = v_uid then
    raise exception 'Non puoi proporre uno scambio a te stesso';
  end if;

  p_give := coalesce(p_give, '{}');
  p_get := coalesce(p_get, '{}');
  v_all := p_give || p_get;
  if cardinality(p_give) = 0 or cardinality(p_get) = 0 then
    raise exception 'Scegli almeno un giocatore da dare e uno da ricevere';
  end if;
  if array_position(v_all, null) is not null
     or (select count(distinct x) from unnest(v_all) as x) <> cardinality(v_all) then
    raise exception 'Proposta non valida: giocatori ripetuti o mancanti';
  end if;

  if (select count(*) from public.roster_entries r
      where r.league_id = p_league_id and r.user_id = v_uid and r.player_id = any (p_give))
     <> cardinality(p_give) then
    raise exception 'Puoi offrire solo giocatori della tua rosa';
  end if;
  if (select count(*) from public.roster_entries r
      where r.league_id = p_league_id and r.user_id = p_receiver_id and r.player_id = any (p_get))
     <> cardinality(p_get) then
    raise exception 'Puoi chiedere solo giocatori della rosa di %', v_receiver;
  end if;

  insert into public.trades (league_id, proposer_id, receiver_id, message)
  values (p_league_id, v_uid, p_receiver_id, nullif(btrim(coalesce(p_message, '')), ''))
  returning id into v_trade_id;

  insert into public.trade_players (trade_id, player_id, from_user_id, cost)
  select v_trade_id, r.player_id, r.user_id, r.cost
  from public.roster_entries r
  where r.league_id = p_league_id and r.player_id = any (v_all);

  v_problem := private.trade_role_problem(v_trade_id, false);
  if v_problem is not null then
    raise exception 'Scambio non valido: %', v_problem;
  end if;

  return v_trade_id;
end;
$$;

-- -------------------------------------------------------------
-- RPC: chi riceve la proposta la accetta (scambio eseguito) o la rifiuta
-- -------------------------------------------------------------
create function public.respond_trade(p_trade_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found or v_trade.receiver_id is distinct from (select auth.uid()) then
    raise exception 'Proposta non trovata';
  end if;
  if v_trade.status <> 'pending' then
    raise exception 'La proposta non è più in attesa';
  end if;

  if not coalesce(p_accept, false) then
    update public.trades set status = 'rejected', decided_at = now() where id = p_trade_id;
    return;
  end if;

  if not coalesce((select trade_market_open from public.leagues where id = v_trade.league_id), false) then
    raise exception 'Il mercato scambi è chiuso';
  end if;

  perform private.execute_trade(p_trade_id, false);
  update public.trades set status = 'accepted', decided_at = now() where id = p_trade_id;
end;
$$;

-- -------------------------------------------------------------
-- RPC: chi ha proposto lo scambio lo ritira (finché è in attesa)
-- -------------------------------------------------------------
create function public.withdraw_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found or v_trade.proposer_id is distinct from (select auth.uid()) then
    raise exception 'Proposta non trovata';
  end if;
  if v_trade.status <> 'pending' then
    raise exception 'La proposta non è più in attesa';
  end if;
  update public.trades set status = 'withdrawn', decided_at = now() where id = p_trade_id;
end;
$$;

-- -------------------------------------------------------------
-- RPC: l'admin annulla uno scambio eseguito (i giocatori tornano indietro,
-- se sono ancora nelle rose in cui li ha portati lo scambio)
-- -------------------------------------------------------------
create function public.cancel_trade(p_trade_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trade public.trades;
begin
  select * into v_trade from public.trades where id = p_trade_id for update;
  if not found or not private.is_league_admin(v_trade.league_id) then
    raise exception 'Operazione riservata all''admin';
  end if;
  if v_trade.status <> 'accepted' then
    raise exception 'Si possono annullare solo gli scambi eseguiti';
  end if;

  perform private.execute_trade(p_trade_id, true);
  update public.trades set status = 'cancelled', cancelled_at = now() where id = p_trade_id;
end;
$$;

-- -------------------------------------------------------------
-- RLS: proposte visibili alle due squadre; scambi eseguiti (o annullati)
-- a tutta la lega. Nessuna scrittura diretta: solo tramite le RPC.
-- -------------------------------------------------------------
alter table public.trades enable row level security;
alter table public.trade_players enable row level security;

create policy "scambi: lettura" on public.trades
  for select to authenticated
  using (
    proposer_id = (select auth.uid())
    or receiver_id = (select auth.uid())
    or (status in ('accepted', 'cancelled') and private.is_league_member(league_id))
  );

create policy "scambi giocatori: lettura" on public.trade_players
  for select to authenticated
  using (exists (select 1 from public.trades t where t.id = trade_id));

-- -------------------------------------------------------------
-- GRANT (il progetto concede ancora tutto in automatico sulle tabelle nuove)
-- -------------------------------------------------------------
revoke all on public.trades, public.trade_players from anon, authenticated;
grant select on public.trades, public.trade_players to authenticated;

revoke execute on function private.trade_moves(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.trade_role_problem(uuid, boolean) from public, anon, authenticated;
revoke execute on function private.execute_trade(uuid, boolean) from public, anon, authenticated;

revoke execute on function public.set_trade_market(uuid, boolean) from public, anon;
revoke execute on function public.propose_trade(uuid, uuid, uuid[], uuid[], text) from public, anon;
revoke execute on function public.respond_trade(uuid, boolean) from public, anon;
revoke execute on function public.withdraw_trade(uuid) from public, anon;
revoke execute on function public.cancel_trade(uuid) from public, anon;

grant execute on function public.set_trade_market(uuid, boolean) to authenticated;
grant execute on function public.propose_trade(uuid, uuid, uuid[], uuid[], text) to authenticated;
grant execute on function public.respond_trade(uuid, boolean) to authenticated;
grant execute on function public.withdraw_trade(uuid) to authenticated;
grant execute on function public.cancel_trade(uuid) to authenticated;
