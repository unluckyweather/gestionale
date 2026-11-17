-- =====================================================================
-- 0001_fondamenta.sql
-- Fondamenta del gestionale: ruoli, profili (chi entra nell'app),
-- dipendenti, registro delle modifiche e regole di sicurezza (RLS).
--
-- Si esegue UNA volta per database, in ordine: prima gestionale-dev,
-- poi (dopo l'approvazione) gestionale-prod.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.ruolo_utente as enum ('titolare', 'ufficio', 'contabilita', 'operaio');
create type public.azione_registro as enum ('creazione', 'modifica', 'archiviazione');


-- ---------------------------------------------------------------------
-- 2. Funzioni di servizio riutilizzate da tutte le tabelle
-- ---------------------------------------------------------------------

-- Ad ogni modifica scrive chi e quando; impedisce di alterare chi/quando ha creato.
create or replace function public.imposta_aggiornamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.aggiornato_il := now();
  new.aggiornato_da := auth.uid();
  new.creato_il := old.creato_il;
  new.creato_da := old.creato_da;
  return new;
end;
$$;

-- Le righe non si cancellano mai: si archiviano (attivo = false).
create or replace function public.vieta_cancellazione()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le righe di % non si cancellano: archiviale (attivo = false).', tg_table_name;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. profili — chi può entrare nell'app (uno per account Supabase Auth)
-- ---------------------------------------------------------------------
create table public.profili (
  id                 uuid primary key references auth.users (id) on delete restrict,
  email              text not null,
  nome_visualizzato  text not null default '',
  ruolo              public.ruolo_utente not null default 'operaio',
  attivo             boolean not null default false,
  creato_il          timestamptz not null default now(),
  creato_da          uuid default auth.uid(),
  aggiornato_il      timestamptz not null default now(),
  aggiornato_da      uuid default auth.uid()
);

comment on table public.profili is 'Account che possono entrare nell''app. Nuovi account nascono disattivati: li attiva il titolare.';

-- Funzioni per i permessi. "security definer" = leggono profili anche
-- quando le regole RLS non lo permetterebbero all'utente (servono proprio a quello).
create or replace function public.ruolo_corrente()
returns public.ruolo_utente
language sql
stable
security definer
set search_path = ''
as $$
  select ruolo from public.profili where id = auth.uid() and attivo;
$$;

create or replace function public.ha_ruolo(variadic ruoli public.ruolo_utente[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.ruolo_corrente() = any (ruoli), false);
$$;

-- Quando su Supabase si crea un nuovo utente, nasce il suo profilo (disattivato, ruolo operaio).
create or replace function public.crea_profilo_nuovo_utente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profili (id, email, nome_visualizzato)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1))
  );
  return new;
end;
$$;

create trigger al_nuovo_utente
  after insert on auth.users
  for each row execute function public.crea_profilo_nuovo_utente();

-- Protezioni: nessuno cambia il proprio ruolo o si disattiva da solo
-- (così il titolare non può chiudersi fuori per sbaglio); l'email non si cambia da qui.
create or replace function public.proteggi_profilo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.email := old.email;
  if auth.uid() = old.id and (new.ruolo <> old.ruolo or new.attivo <> old.attivo) then
    raise exception 'Non puoi cambiare il tuo ruolo o disattivare il tuo account.';
  end if;
  return new;
end;
$$;

-- (i trigger "before" partono in ordine alfabetico: a_ prima di b_)
create trigger a_proteggi before update on public.profili
  for each row execute function public.proteggi_profilo();
create trigger b_aggiornamento before update on public.profili
  for each row execute function public.imposta_aggiornamento();
create trigger vieta_cancellazione before delete on public.profili
  for each row execute function public.vieta_cancellazione();


-- ---------------------------------------------------------------------
-- 4. dipendenti — anagrafica del personale
-- ---------------------------------------------------------------------
create table public.dipendenti (
  id                   uuid primary key default gen_random_uuid(),
  nome                 text not null check (btrim(nome) <> ''),
  cognome              text not null check (btrim(cognome) <> ''),
  mansione_principale  text,
  profilo_id           uuid unique references public.profili (id),
  attivo               boolean not null default true,
  creato_il            timestamptz not null default now(),
  creato_da            uuid default auth.uid() references public.profili (id),
  aggiornato_il        timestamptz not null default now(),
  aggiornato_da        uuid default auth.uid() references public.profili (id)
);

comment on table public.dipendenti is 'Personale. profilo_id vuoto = il dipendente non usa l''app.';

create trigger b_aggiornamento before update on public.dipendenti
  for each row execute function public.imposta_aggiornamento();
create trigger vieta_cancellazione before delete on public.dipendenti
  for each row execute function public.vieta_cancellazione();


-- ---------------------------------------------------------------------
-- 5. registro_modifiche — chi ha fatto cosa (si scrive solo da trigger)
-- ---------------------------------------------------------------------
create table public.registro_modifiche (
  id         uuid primary key default gen_random_uuid(),
  tabella    text not null,
  record_id  uuid not null,
  azione     public.azione_registro not null,
  autore     uuid references public.profili (id),
  quando     timestamptz not null default now(),
  prima      jsonb,
  dopo       jsonb
);

create index registro_modifiche_record_idx on public.registro_modifiche (tabella, record_id);
create index registro_modifiche_quando_idx on public.registro_modifiche (quando desc);

-- Il registro non si modifica e non si cancella.
create or replace function public.vieta_modifica_registro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Il registro modifiche non si può modificare né cancellare.';
end;
$$;

create trigger blocca before update or delete on public.registro_modifiche
  for each row execute function public.vieta_modifica_registro();

-- Funzione generica: da agganciare a ogni tabella da tracciare (vedi sotto).
create or replace function public.registra_modifica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azione public.azione_registro;
  v_prima  jsonb;
  v_dopo   jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    v_azione := 'creazione';
  else
    v_prima := to_jsonb(old);
    -- se non è cambiato niente (a parte la data di aggiornamento) non registra
    if (v_prima - 'aggiornato_il' - 'aggiornato_da') = (v_dopo - 'aggiornato_il' - 'aggiornato_da') then
      return null;
    end if;
    if ((v_prima ->> 'attivo')::boolean is true and (v_dopo ->> 'attivo')::boolean is false)
       or (v_prima ->> 'archiviato_il' is null and v_dopo ->> 'archiviato_il' is not null) then
      v_azione := 'archiviazione';
    else
      v_azione := 'modifica';
    end if;
  end if;

  insert into public.registro_modifiche (tabella, record_id, azione, autore, prima, dopo)
  values (tg_table_name, (v_dopo ->> 'id')::uuid, v_azione, auth.uid(), v_prima, v_dopo);
  return null;
end;
$$;

create trigger z_registro after insert or update on public.profili
  for each row execute function public.registra_modifica();
create trigger z_registro after insert or update on public.dipendenti
  for each row execute function public.registra_modifica();


-- ---------------------------------------------------------------------
-- 6. Sicurezza: Row Level Security (i permessi stanno nel database)
-- ---------------------------------------------------------------------
alter table public.profili            enable row level security;
alter table public.dipendenti         enable row level security;
alter table public.registro_modifiche enable row level security;

-- Chi non ha fatto login (anon) non vede niente di queste tabelle.
revoke all on public.profili, public.dipendenti, public.registro_modifiche from anon;
-- Il registro lo scrivono solo i trigger.
revoke insert, update, delete on public.registro_modifiche from authenticated;

-- profili: ognuno vede il proprio; titolare, ufficio e contabilità vedono tutti.
create policy "profili: lettura" on public.profili
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select public.ha_ruolo('titolare', 'ufficio', 'contabilita'))
  );

-- profili: solo il titolare modifica (ruoli, attivazione, nome). Nessuno inserisce
-- (li crea il trigger) e nessuno cancella.
create policy "profili: modifica titolare" on public.profili
  for update to authenticated
  using ((select public.ha_ruolo('titolare')))
  with check ((select public.ha_ruolo('titolare')));

-- dipendenti: titolare/ufficio/contabilità vedono tutti; un account attivo vede sé stesso.
create policy "dipendenti: lettura" on public.dipendenti
  for select to authenticated
  using (
    (select public.ha_ruolo('titolare', 'ufficio', 'contabilita'))
    or (profilo_id = (select auth.uid()) and (select public.ruolo_corrente()) is not null)
  );

create policy "dipendenti: inserimento titolare" on public.dipendenti
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare')));

create policy "dipendenti: modifica titolare" on public.dipendenti
  for update to authenticated
  using ((select public.ha_ruolo('titolare')))
  with check ((select public.ha_ruolo('titolare')));

-- registro: solo il titolare legge.
create policy "registro: lettura titolare" on public.registro_modifiche
  for select to authenticated
  using ((select public.ha_ruolo('titolare')));
