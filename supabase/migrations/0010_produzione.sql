-- =====================================================================
-- 0010_produzione.sql  (schema v1.1, 25/11/2026)
-- Produzione: macchine e competenze, orari, commesse e lavori,
-- programma del giorno (assegnazioni), ferie e permessi.
--
-- Richiede 0001…0009. Si esegue UNA volta per database.
--
-- Come funziona:
--   macchine       → le macchine (Stampante UV piana, Fresa Zund…) e le
--                    "postazioni" senza macchina (Grafica, Posa esterna…):
--                    sono le righe del programma "per macchina"
--   competenze     → chi sa usare quale macchina (principale / sa usarla)
--   orari_lavoro   → fasce orarie dell'azienda (lun–ven 08:00–12:30 e
--                    13:30–17:00); una persona può averne di sue
--   fermi_macchina → manutenzioni e guasti
--   commesse       → il lavoro accettato dal cliente. STESSO NUMERO del
--                    preventivo (23/26 → commessa 23/26); senza preventivo
--                    prende il numero successivo dallo stesso contatore
--   lavori         → i pezzi di una commessa (dalle fasi del preventivo),
--                    con macchina, ore e stato; anche lavori interni
--   assegnazioni   → il programma: chi fa quale lavoro, su quale macchina,
--                    in che giorno, dalle… alle… (un lavoro si può dividere)
--   assenze        → ferie, permessi, malattia
--
-- Gli avvisi del programma (persona assente, macchina ferma, fuori orario,
-- senza competenza, più lavori insieme) li calcola la vista "programma":
-- sono informazioni, non blocchi.
--
-- Permessi:
--   macchine, competenze, orari, fermi, assegnazioni
--       → leggono tutti gli utenti attivi; scrive solo il titolare
--   commesse, lavori
--       → leggono tutti gli utenti attivi (non contengono prezzi);
--         scrivono titolare e ufficio; gli operai cambiano solo lo
--         STATO dei lavori a loro assegnati (iniziato / finito)
--   assenze
--       → il titolare legge e scrive tutto; ognuno legge le proprie;
--         gli altri vedono le assenze dei colleghi nella vista
--         assenze_elenco, dove la malattia compare come «assente»
--   viste commesse_elenco, programma, dipendenti_elenco, assenze_elenco
--       → tutti gli utenti attivi (nome del cliente e indirizzo di posa
--         anche agli operai, che non leggono "soggetti")
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.tipo_macchina     as enum ('macchina', 'postazione');
create type public.livello_competenza as enum ('principale', 'sa_usarla');
create type public.stato_commessa    as enum ('da_pianificare', 'in_lavorazione', 'controllo_qualita', 'completata');
create type public.stato_lavoro      as enum ('da_fare', 'in_corso', 'finito');
create type public.tipo_assenza      as enum ('ferie', 'permesso', 'malattia');


-- ---------------------------------------------------------------------
-- 2. Funzioni di servizio
-- ---------------------------------------------------------------------

-- Periodo "dal giorno/ora … al giorno/ora" (ora locale, senza fuso).
-- Senza ore: dall'inizio del primo giorno alla fine dell'ultimo.
create or replace function public.periodo(p_dal date, p_al date, p_dalle time, p_alle time)
returns tsrange
language sql
immutable
set search_path = ''
as $$
  select tsrange(
    p_dal + coalesce(p_dalle, time '00:00'),
    case when p_alle is null then (p_al + 1) + time '00:00' else p_al + p_alle end,
    '[)');
$$;

-- Indirizzo su una riga: "Via Roma 5, 35100 Padova (PD)"
create or replace function public.indirizzo_testo(
  p_indirizzo text, p_civico text, p_cap text, p_comune text, p_provincia text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(concat_ws(', ',
    nullif(btrim(concat_ws(' ', p_indirizzo, p_civico)), ''),
    nullif(btrim(concat_ws(' ', p_cap, p_comune,
      case when p_provincia is not null then '(' || p_provincia || ')' end)), '')
  ), '');
$$;


-- ---------------------------------------------------------------------
-- 3. macchine — macchine e postazioni (le righe del programma)
-- ---------------------------------------------------------------------
create table public.macchine (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  nome           text not null check (btrim(nome) <> ''),
  tipo           public.tipo_macchina not null default 'macchina',
  reparto        text,             -- es. "Stampa", "Taglio", "Fresa"
  tariffa_id     uuid references public.tariffe_orarie (id),   -- per riconoscere le fasi del preventivo
  fuori_sede     boolean not null default false,               -- posa: nel programma si vede l'indirizzo
  ordine         integer not null default 0,                   -- posizione nel programma
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.macchine is 'Macchine e postazioni senza macchina (grafica, laboratorio, posa): sono le righe del programma del giorno.';

create index macchine_azienda_idx on public.macchine (azienda_id);
create unique index macchine_nome_unico on public.macchine (azienda_id, lower(btrim(nome))) where attivo;


-- ---------------------------------------------------------------------
-- 4. competenze — chi sa usare quale macchina
--    Una riga per coppia: tolta → attivo = false; se torna si riattiva.
-- ---------------------------------------------------------------------
create table public.competenze (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  dipendente_id  uuid not null references public.dipendenti (id),
  macchina_id    uuid not null references public.macchine (id),
  livello        public.livello_competenza not null default 'sa_usarla',
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint competenze_una_per_coppia unique (dipendente_id, macchina_id)
);

comment on table public.competenze is 'Chi sa usare quale macchina: principale (è la sua macchina) o sa_usarla (può sostituire).';

create index competenze_azienda_idx  on public.competenze (azienda_id);
create index competenze_macchina_idx on public.competenze (macchina_id);


-- ---------------------------------------------------------------------
-- 5. orari_lavoro — fasce orarie (una riga per fascia)
--    dipendente_id vuoto = orario dell'azienda.
--    Se una persona ha almeno una fascia sua, per lei vale SOLO il suo
--    orario (part-time, sabato…). Un giorno senza fasce = non lavorativo.
-- ---------------------------------------------------------------------
create table public.orari_lavoro (
  id                uuid primary key default gen_random_uuid(),
  azienda_id        uuid not null default public.azienda_corrente() references public.azienda (id),
  dipendente_id     uuid references public.dipendenti (id),
  giorno_settimana  smallint not null check (giorno_settimana between 1 and 7),   -- 1 = lunedì … 7 = domenica
  dalle             time not null,
  alle              time not null,
  attivo            boolean not null default true,
  creato_il         timestamptz not null default now(),
  creato_da         uuid default auth.uid() references public.profili (id),
  aggiornato_il     timestamptz not null default now(),
  aggiornato_da     uuid default auth.uid() references public.profili (id),
  constraint orari_lavoro_ore check (alle > dalle)
);

comment on table public.orari_lavoro is 'Fasce dell''orario di lavoro: dell''azienda (dipendente_id vuoto) o di una persona, che allora sostituisce quello aziendale.';

create index orari_lavoro_azienda_idx on public.orari_lavoro (azienda_id);
create index orari_lavoro_dipendente_idx on public.orari_lavoro (dipendente_id) where dipendente_id is not null;

-- Fasce orarie di una persona in un giorno (persona vuota = orario dell'azienda)
create or replace function public.fasce_orario(p_azienda_id uuid, p_dipendente_id uuid, p_giorno date)
returns table (dalle time, alle time)
language sql
stable
set search_path = ''
as $$
  select o.dalle, o.alle
    from public.orari_lavoro o
   where o.azienda_id = p_azienda_id
     and o.attivo
     and o.giorno_settimana = extract(isodow from p_giorno)
     and o.dipendente_id is not distinct from (
           case when p_dipendente_id is not null and exists (
                  select 1 from public.orari_lavoro x
                   where x.dipendente_id = p_dipendente_id and x.attivo)
                then p_dipendente_id end)
   order by o.dalle;
$$;


-- ---------------------------------------------------------------------
-- 6. fermi_macchina — manutenzioni e guasti
--    Senza ore: giorni interi. "dalle" vale per il primo giorno,
--    "alle" per l'ultimo.
-- ---------------------------------------------------------------------
create table public.fermi_macchina (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  macchina_id    uuid not null references public.macchine (id),
  dal            date not null,
  al             date not null,
  dalle          time,
  alle           time,
  motivo         text not null check (btrim(motivo) <> ''),   -- es. "Manutenzione"
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint fermi_macchina_periodo check (not isempty(public.periodo(dal, al, dalle, alle)))
);

comment on table public.fermi_macchina is 'Periodi in cui una macchina è ferma (manutenzione, guasto): il programma avvisa.';

create index fermi_macchina_azienda_idx  on public.fermi_macchina (azienda_id);
create index fermi_macchina_macchina_idx on public.fermi_macchina (macchina_id, dal) where attivo;


-- ---------------------------------------------------------------------
-- 7. commesse
--    Numero = numero del preventivo (stesso anno e progressivo).
--    Senza preventivo: numero successivo dal contatore dei preventivi.
-- ---------------------------------------------------------------------
create table public.commesse (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  anno           smallint not null,
  progressivo    integer not null,
  numero         text generated always as (
                   progressivo::text || '/' || lpad((anno % 100)::text, 2, '0')
                 ) stored,
  preventivo_id  uuid references public.preventivi (id),   -- vuoto = commessa senza preventivo
  soggetto_id    uuid not null references public.soggetti (id),   -- cliente
  sede_id        uuid references public.sedi_soggetto (id),   -- dove si fa la posa / la consegna
  descrizione    text not null check (btrim(descrizione) <> ''),
  data           date not null default current_date,
  data_consegna  date,
  stato          public.stato_commessa not null default 'da_pianificare',
  urgente        boolean not null default false,
  note           text,   -- interne
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.commesse is 'Commesse di produzione. Stesso numero del preventivo; ore e avanzamento si calcolano dai lavori (vista commesse_elenco).';

create index commesse_azienda_idx  on public.commesse (azienda_id);
create index commesse_soggetto_idx on public.commesse (soggetto_id);
create index commesse_ordine_idx   on public.commesse (anno desc, progressivo desc);
create unique index commesse_numero_unico on public.commesse (azienda_id, anno, progressivo) where attivo;
-- un preventivo ha al massimo una commessa attiva
create unique index commesse_preventivo_unico on public.commesse (preventivo_id) where attivo and preventivo_id is not null;


-- ---------------------------------------------------------------------
-- 8. lavori — i pezzi di una commessa (o lavori interni senza commessa)
-- ---------------------------------------------------------------------
create table public.lavori (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  commessa_id    uuid references public.commesse (id),   -- vuoto = lavoro interno (manutenzione…)
  fase_id        uuid references public.fasi_preventivo (id),   -- da quale fase del preventivo viene
  ordine         integer not null default 0,
  titolo         text not null check (btrim(titolo) <> ''),   -- es. "Stampa", "Fresatura lettere"
  descrizione    text,
  macchina_id    uuid references public.macchine (id),   -- macchina o postazione prevista
  ore_previste   numeric(6,2) check (ore_previste >= 0),
  stato          public.stato_lavoro not null default 'da_fare',
  iniziato_il    timestamptz,   -- li scrive il database quando cambia lo stato
  finito_il      timestamptz,
  urgente        boolean not null default false,
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint lavori_fase_con_commessa check (fase_id is null or commessa_id is not null)
);

comment on table public.lavori is 'Lavori da fare: dalle fasi del preventivo della commessa, oppure lavori interni (commessa vuota).';

create index lavori_azienda_idx  on public.lavori (azienda_id);
create index lavori_commessa_idx on public.lavori (commessa_id, ordine);
create index lavori_macchina_idx on public.lavori (macchina_id) where attivo;


-- ---------------------------------------------------------------------
-- 9. assegnazioni — il programma del giorno
--    Un lavoro si può dividere in più assegnazioni (giorni, persone).
--    La persona può mancare ("da assegnare"); più lavori nello stesso
--    momento sono permessi (è un'informazione nella vista "programma").
-- ---------------------------------------------------------------------
create table public.assegnazioni (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  lavoro_id      uuid not null references public.lavori (id),
  dipendente_id  uuid references public.dipendenti (id),
  macchina_id    uuid references public.macchine (id),   -- se vuota: quella del lavoro
  giorno         date not null,
  dalle          time not null,
  alle           time not null,
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint assegnazioni_ore check (alle > dalle)
);

comment on table public.assegnazioni is 'Programma del giorno: chi fa quale lavoro, su quale macchina, in che giorno e a che ora. Lo scrive solo il titolare.';

create index assegnazioni_azienda_idx    on public.assegnazioni (azienda_id);
create index assegnazioni_giorno_idx     on public.assegnazioni (giorno) where attivo;
create index assegnazioni_lavoro_idx     on public.assegnazioni (lavoro_id);
create index assegnazioni_dipendente_idx on public.assegnazioni (dipendente_id, giorno) where attivo;


-- ---------------------------------------------------------------------
-- 10. assenze — ferie, permessi, malattia
--     Senza ore: giorni interi. Permesso a ore: stesso giorno, dalle–alle.
-- ---------------------------------------------------------------------
create table public.assenze (
  id             uuid primary key default gen_random_uuid(),
  azienda_id     uuid not null default public.azienda_corrente() references public.azienda (id),
  dipendente_id  uuid not null references public.dipendenti (id),
  tipo           public.tipo_assenza not null,
  dal            date not null,
  al             date not null,
  dalle          time,
  alle           time,
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint assenze_periodo check (not isempty(public.periodo(dal, al, dalle, alle)))
);

comment on table public.assenze is 'Ferie, permessi e malattia. Il motivo «malattia» lo vede solo il titolare (e la persona stessa).';

create index assenze_azienda_idx    on public.assenze (azienda_id);
create index assenze_dipendente_idx on public.assenze (dipendente_id, dal) where attivo;


-- ---------------------------------------------------------------------
-- 11. Pulizia e controlli (trigger a_…)
-- ---------------------------------------------------------------------

create or replace function public.normalizza_macchina()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome    := btrim(new.nome);
  new.reparto := public.pulisci(new.reparto);
  new.note    := public.pulisci(new.note);

  -- non si archivia (macchina venduta, postazione tolta) finché ha lavori
  -- nel programma da oggi in poi: vanno prima spostati su un'altra macchina
  if tg_op = 'UPDATE' and old.attivo and not new.attivo and exists (
    select 1 from public.assegnazioni a
     where a.macchina_id = new.id and a.attivo and a.giorno >= current_date
  ) then
    raise exception '«%» ha ancora lavori nel programma da oggi in poi: spostali prima su un''altra macchina.', new.nome;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_fermo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.motivo := btrim(new.motivo);
  return new;
end;
$$;

create or replace function public.normalizza_assenza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.note := public.pulisci(new.note);
  return new;
end;
$$;

-- Commessa: dal preventivo copia cliente e descrizione; il preventivo
-- dev'essere accettato; il cliente non dev'essere un fornitore; la sede
-- dev'essere del cliente.
create or replace function public.normalizza_commessa()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prev public.preventivi;
begin
  new.descrizione := btrim(new.descrizione);
  new.note        := public.pulisci(new.note);

  if tg_op = 'INSERT' and new.preventivo_id is not null then
    select * into v_prev from public.preventivi p where p.id = new.preventivo_id and p.attivo;
    if not found then
      raise exception 'Preventivo non trovato.';
    end if;
    if v_prev.stato <> 'accettato' then
      raise exception 'Il preventivo % non è accettato: non si può convertire in commessa.', v_prev.numero;
    end if;
    if exists (select 1 from public.commesse c where c.preventivo_id = new.preventivo_id and c.attivo) then
      raise exception 'Il preventivo % ha già una commessa.', v_prev.numero;
    end if;
    new.soggetto_id := coalesce(new.soggetto_id, v_prev.soggetto_id);
    if new.soggetto_id <> v_prev.soggetto_id then
      raise exception 'La commessa va intestata allo stesso cliente del preventivo.';
    end if;
    new.descrizione := coalesce(nullif(new.descrizione, ''), v_prev.oggetto);
  end if;

  if tg_op = 'INSERT' or new.soggetto_id is distinct from old.soggetto_id then
    if exists (select 1 from public.soggetti s where s.id = new.soggetto_id and s.tipo = 'fornitore') then
      raise exception 'La commessa va intestata a un cliente, non a un fornitore.';
    end if;
  end if;

  if new.sede_id is not null and not exists (
    select 1 from public.sedi_soggetto se where se.id = new.sede_id and se.soggetto_id = new.soggetto_id
  ) then
    raise exception 'La sede scelta non è del cliente della commessa.';
  end if;
  return new;
end;
$$;

-- Numero: quello del preventivo, altrimenti il successivo del contatore
-- dei preventivi (così nessun preventivo avrà lo stesso numero).
-- (parte dopo a0_azienda e a_normalizza: azienda e preventivo sono già controllati)
create or replace function public.numera_commessa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.preventivo_id is not null then
    select p.anno, p.progressivo into new.anno, new.progressivo
      from public.preventivi p where p.id = new.preventivo_id;
  else
    new.anno        := extract(year from new.data)::smallint;
    new.progressivo := public.prossimo_numero(new.azienda_id, 'preventivo', new.anno);
  end if;
  return new;
end;
$$;

-- Numero e preventivo non cambiano più.
create or replace function public.proteggi_commessa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anno          := old.anno;
  new.progressivo   := old.progressivo;
  new.preventivo_id := old.preventivo_id;
  return new;
end;
$$;

-- Lavoro: la fase dev'essere del preventivo della commessa; un lavoro
-- non cambia commessa; data di inizio e fine dallo stato. Gli operai
-- (che hanno il permesso solo sui lavori a loro assegnati) cambiano
-- solo lo stato.
create or replace function public.normalizza_lavoro()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.titolo      := btrim(new.titolo);
  new.descrizione := public.pulisci(new.descrizione);
  new.note        := public.pulisci(new.note);

  if tg_op = 'UPDATE' then
    new.commessa_id := old.commessa_id;
    new.iniziato_il := old.iniziato_il;
    new.finito_il   := old.finito_il;

    if auth.uid() is not null and not public.ha_ruolo('titolare', 'ufficio')
       and (to_jsonb(new) - 'stato' - 'aggiornato_il' - 'aggiornato_da')
           is distinct from (to_jsonb(old) - 'stato' - 'aggiornato_il' - 'aggiornato_da') then
      raise exception 'Puoi cambiare solo lo stato del lavoro (iniziato, finito).';
    end if;

    -- non si archivia un lavoro ancora in programma da oggi in poi
    if old.attivo and not new.attivo and exists (
      select 1 from public.assegnazioni a
       where a.lavoro_id = new.id and a.attivo and a.giorno >= current_date
    ) then
      raise exception 'Il lavoro «%» è nel programma: toglilo prima dal programma.', new.titolo;
    end if;
  end if;

  if new.fase_id is not null and (tg_op = 'INSERT' or new.fase_id is distinct from old.fase_id) then
    if not exists (
      select 1 from public.fasi_preventivo f
        join public.commesse c on c.preventivo_id = f.preventivo_id
       where f.id = new.fase_id and c.id = new.commessa_id
    ) then
      raise exception 'La fase scelta non è del preventivo di questa commessa.';
    end if;
  end if;

  -- date di inizio e fine
  if new.stato = 'da_fare' then
    new.iniziato_il := null;
    new.finito_il   := null;
  elsif new.stato = 'in_corso' then
    new.iniziato_il := coalesce(new.iniziato_il, now());
    new.finito_il   := null;
  else
    new.iniziato_il := coalesce(new.iniziato_il, now());
    new.finito_il   := coalesce(new.finito_il, now());
  end if;
  return new;
end;
$$;

-- Assegnazione: lavoro attivo; macchina proposta dal lavoro; il lavoro
-- non si sposta da un'assegnazione all'altra.
create or replace function public.normalizza_assegnazione()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_lavoro public.lavori;
begin
  new.note := public.pulisci(new.note);
  if tg_op = 'UPDATE' then
    new.lavoro_id := old.lavoro_id;
  end if;

  select * into v_lavoro from public.lavori l where l.id = new.lavoro_id;
  if tg_op = 'INSERT' and not v_lavoro.attivo then
    raise exception 'Il lavoro «%» è archiviato.', v_lavoro.titolo;
  end if;
  new.macchina_id := coalesce(new.macchina_id, v_lavoro.macchina_id);
  return new;
end;
$$;

-- Stato della commessa calcolato dai lavori:
--   tutti i lavori finiti                      → controllo_qualita
--   qualcosa nel programma, iniziato o finito  → in_lavorazione
--   altrimenti                                 → da_pianificare
-- Una commessa "completata" (la segna a mano titolare o ufficio) non cambia.
-- "security definer": parte anche quando un operaio segna un lavoro
-- finito, e lui non può modificare le commesse.
create or replace function public.ricalcola_stato_commessa(p_commessa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lavori    integer;
  v_finiti    integer;
  v_avviata   boolean;
  v_stato     public.stato_commessa;
begin
  if p_commessa_id is null then
    return;
  end if;

  select count(*),
         count(*) filter (where l.stato = 'finito'),
         coalesce(bool_or(l.stato <> 'da_fare'), false)
    into v_lavori, v_finiti, v_avviata
    from public.lavori l
   where l.commessa_id = p_commessa_id and l.attivo;

  v_avviata := v_avviata or exists (
    select 1 from public.assegnazioni a
      join public.lavori l on l.id = a.lavoro_id
     where l.commessa_id = p_commessa_id and l.attivo and a.attivo);

  v_stato := case
    when v_lavori > 0 and v_finiti = v_lavori then 'controllo_qualita'
    when v_avviata then 'in_lavorazione'
    else 'da_pianificare'
  end;

  update public.commesse
     set stato = v_stato
   where id = p_commessa_id and stato <> 'completata' and stato is distinct from v_stato;
end;
$$;

revoke execute on function public.ricalcola_stato_commessa(uuid) from public, anon, authenticated;

create or replace function public.dopo_lavoro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ricalcola_stato_commessa(new.commessa_id);
  return null;
end;
$$;

create or replace function public.dopo_assegnazione()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ricalcola_stato_commessa(
    (select l.commessa_id from public.lavori l where l.id = new.lavoro_id));
  return null;
end;
$$;

revoke execute on function public.dopo_lavoro(), public.dopo_assegnazione() from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 12. Trigger (ordine alfabetico: a0_azienda, a_…, b_aggiornamento,
--     y_…, z_registro)
-- ---------------------------------------------------------------------
create trigger a0_azienda before insert or update on public.macchine
  for each row execute function public.allinea_azienda('tariffa_id:tariffe_orarie');
create trigger a0_azienda before insert or update on public.competenze
  for each row execute function public.allinea_azienda('dipendente_id:dipendenti', 'macchina_id:macchine');
create trigger a0_azienda before insert or update on public.orari_lavoro
  for each row execute function public.allinea_azienda('dipendente_id:dipendenti');
create trigger a0_azienda before insert or update on public.fermi_macchina
  for each row execute function public.allinea_azienda('macchina_id:macchine');
create trigger a0_azienda before insert or update on public.commesse
  for each row execute function public.allinea_azienda(
    'preventivo_id:preventivi', 'soggetto_id:soggetti', 'sede_id:sedi_soggetto');
create trigger a0_azienda before insert or update on public.lavori
  for each row execute function public.allinea_azienda(
    'commessa_id:commesse', 'fase_id:fasi_preventivo', 'macchina_id:macchine');
create trigger a0_azienda before insert or update on public.assegnazioni
  for each row execute function public.allinea_azienda(
    'lavoro_id:lavori', 'dipendente_id:dipendenti', 'macchina_id:macchine');
create trigger a0_azienda before insert or update on public.assenze
  for each row execute function public.allinea_azienda('dipendente_id:dipendenti');

create trigger a_normalizza before insert or update on public.macchine
  for each row execute function public.normalizza_macchina();
create trigger a_normalizza before insert or update on public.fermi_macchina
  for each row execute function public.normalizza_fermo();
create trigger a_normalizza before insert or update on public.assenze
  for each row execute function public.normalizza_assenza();
create trigger a_normalizza before insert or update on public.commesse
  for each row execute function public.normalizza_commessa();
create trigger a_numera before insert on public.commesse
  for each row execute function public.numera_commessa();
create trigger a_proteggi before update on public.commesse
  for each row execute function public.proteggi_commessa();
create trigger a_normalizza before insert or update on public.lavori
  for each row execute function public.normalizza_lavoro();
create trigger a_normalizza before insert or update on public.assegnazioni
  for each row execute function public.normalizza_assegnazione();

create trigger y_stato_commessa after insert or update on public.lavori
  for each row execute function public.dopo_lavoro();
create trigger y_stato_commessa after insert or update on public.assegnazioni
  for each row execute function public.dopo_assegnazione();

do $$
declare
  t text;
begin
  foreach t in array array[
    'macchine', 'competenze', 'orari_lavoro', 'fermi_macchina',
    'commesse', 'lavori', 'assegnazioni', 'assenze'
  ] loop
    execute format('create trigger b_aggiornamento before update on public.%I
                      for each row execute function public.imposta_aggiornamento()', t);
    execute format('create trigger vieta_cancellazione before delete on public.%I
                      for each row execute function public.vieta_cancellazione()', t);
    execute format('create trigger z_registro after insert or update on public.%I
                      for each row execute function public.registra_modifica()', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 13. Sicurezza: Row Level Security
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'macchine', 'competenze', 'orari_lavoro', 'fermi_macchina',
    'commesse', 'lavori', 'assegnazioni', 'assenze'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    -- stessa azienda, OLTRE al ruolo (vedi 0009)
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (azienda_id = (select public.azienda_corrente()))
         with check (azienda_id = (select public.azienda_corrente()))',
      t || ': stessa azienda', t);
  end loop;

  -- Leggono tutti gli utenti attivi; scrive solo il titolare
  foreach t in array array['macchine', 'competenze', 'orari_lavoro', 'fermi_macchina', 'assegnazioni']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.ruolo_corrente()) is not null)',
      t || ': lettura', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.ha_ruolo(''titolare'')))',
      t || ': inserimento titolare', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.ha_ruolo(''titolare'')))
         with check ((select public.ha_ruolo(''titolare'')))',
      t || ': modifica titolare', t);
  end loop;

  -- Commesse e lavori: leggono tutti gli utenti attivi; scrivono titolare e ufficio
  foreach t in array array['commesse', 'lavori']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.ruolo_corrente()) is not null)',
      t || ': lettura', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.ha_ruolo(''titolare'', ''ufficio'')))',
      t || ': inserimento', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.ha_ruolo(''titolare'', ''ufficio'')))
         with check ((select public.ha_ruolo(''titolare'', ''ufficio'')))',
      t || ': modifica', t);
  end loop;
end;
$$;

-- Gli operai cambiano lo stato dei lavori a loro assegnati
-- (il trigger a_normalizza impedisce di cambiare altro).
create policy "lavori: stato dall'operaio" on public.lavori
  for update to authenticated
  using (
    (select public.ha_ruolo('operaio'))
    and exists (
      select 1 from public.assegnazioni a
        join public.dipendenti d on d.id = a.dipendente_id
       where a.lavoro_id = lavori.id and a.attivo and d.profilo_id = (select auth.uid()))
  )
  with check (
    (select public.ha_ruolo('operaio'))
    and exists (
      select 1 from public.assegnazioni a
        join public.dipendenti d on d.id = a.dipendente_id
       where a.lavoro_id = lavori.id and a.attivo and d.profilo_id = (select auth.uid()))
  );

-- Assenze: il titolare tutto; ognuno legge le proprie.
create policy "assenze: lettura" on public.assenze
  for select to authenticated
  using (
    (select public.ha_ruolo('titolare'))
    or ((select public.ruolo_corrente()) is not null
        and exists (select 1 from public.dipendenti d
                     where d.id = assenze.dipendente_id and d.profilo_id = (select auth.uid())))
  );
create policy "assenze: inserimento titolare" on public.assenze
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare')));
create policy "assenze: modifica titolare" on public.assenze
  for update to authenticated
  using ((select public.ha_ruolo('titolare')))
  with check ((select public.ha_ruolo('titolare')));


-- ---------------------------------------------------------------------
-- 14. Viste
--     Le viste qui sotto NON usano security_invoker: mostrano a tutti
--     gli utenti attivi alcuni dati di tabelle che gli operai non leggono
--     (nome del cliente, indirizzo di posa, nomi dei colleghi, assenze).
--     Per questo filtrano a mano ruolo e azienda, e non mostrano prezzi.
-- ---------------------------------------------------------------------

-- Nomi delle persone (per il programma "per persona" e «Chi può farlo»)
create view public.dipendenti_elenco
as
select
  d.id,
  d.nome,
  d.cognome,
  btrim(d.nome || ' ' || d.cognome) as nome_completo,
  d.attivo,
  (d.profilo_id is not null and d.profilo_id = auth.uid()) as io
from public.dipendenti d
where (select public.ruolo_corrente()) is not null
  and d.azienda_id = (select public.azienda_corrente());

comment on view public.dipendenti_elenco is 'Nome e cognome dei dipendenti, per tutti gli utenti attivi. "io" = il dipendente collegato a chi legge.';

-- Assenze di tutti: la malattia la vede solo il titolare (e la persona
-- stessa); gli altri vedono «assente». Le note solo titolare e persona.
create view public.assenze_elenco
as
select
  a.id,
  a.dipendente_id,
  a.dal,
  a.al,
  a.dalle,
  a.alle,
  case
    when a.tipo <> 'malattia' or (select public.ha_ruolo('titolare')) or d.profilo_id = auth.uid()
      then a.tipo::text
    else 'assente'
  end as motivo,
  case when (select public.ha_ruolo('titolare')) or d.profilo_id = auth.uid() then a.note end as note
from public.assenze a
join public.dipendenti d on d.id = a.dipendente_id
where a.attivo
  and (select public.ruolo_corrente()) is not null
  and a.azienda_id = (select public.azienda_corrente());

comment on view public.assenze_elenco is 'Assenze attive per il programma e il calendario. Motivo «assente» al posto di «malattia» per chi non è titolare.';

-- Commesse con cliente, luogo, ore e avanzamento (senza prezzi)
create view public.commesse_elenco
as
select
  c.id,
  c.numero,
  c.anno,
  c.progressivo,
  c.preventivo_id,
  c.soggetto_id,
  s.denominazione as cliente,
  c.sede_id,
  coalesce(
    public.indirizzo_testo(se.indirizzo, se.civico, se.cap, se.comune, se.provincia),
    public.indirizzo_testo(s.indirizzo, s.civico, s.cap, s.comune, s.provincia)
  ) as luogo,
  c.descrizione,
  c.data,
  c.data_consegna,
  c.stato,
  c.urgente,
  c.attivo,
  coalesce(l.lavori, 0) as lavori,
  coalesce(l.lavori_finiti, 0) as lavori_finiti,
  coalesce(l.ore_previste, 0) as ore_previste,
  coalesce(l.ore_finite, 0) as ore_finite,
  -- avanzamento: sulle ore previste, oppure sul numero di lavori
  case
    when coalesce(l.ore_previste, 0) > 0 then round(100 * l.ore_finite / l.ore_previste)::integer
    when coalesce(l.lavori, 0) > 0 then round(100.0 * l.lavori_finiti / l.lavori)::integer
    else 0
  end as avanzamento
from public.commesse c
join public.soggetti s on s.id = c.soggetto_id
left join public.sedi_soggetto se on se.id = c.sede_id
left join (
  select commessa_id,
         count(*) as lavori,
         count(*) filter (where stato = 'finito') as lavori_finiti,
         sum(coalesce(ore_previste, 0)) as ore_previste,
         sum(coalesce(ore_previste, 0)) filter (where stato = 'finito') as ore_finite
    from public.lavori
   where attivo and commessa_id is not null
   group by commessa_id
) l on l.commessa_id = c.id
where (select public.ruolo_corrente()) is not null
  and c.azienda_id = (select public.azienda_corrente());

comment on view public.commesse_elenco is 'Commesse con nome del cliente, luogo (sede della commessa o sede legale), ore previste e avanzamento. Senza prezzi: la leggono tutti gli utenti attivi.';

-- Ore già messe nel programma per ogni lavoro (security_invoker)
create view public.lavori_riepilogo
with (security_invoker = true)
as
select
  l.id as lavoro_id,
  l.commessa_id,
  l.ore_previste,
  coalesce(a.ore_programmate, 0) as ore_programmate,
  greatest(coalesce(l.ore_previste, 0) - coalesce(a.ore_programmate, 0), 0) as ore_da_programmare,
  a.primo_giorno,
  a.ultimo_giorno
from public.lavori l
left join (
  select lavoro_id,
         round(sum(extract(epoch from (alle - dalle)) / 3600)::numeric, 2) as ore_programmate,
         min(giorno) as primo_giorno,
         max(giorno) as ultimo_giorno
    from public.assegnazioni
   where attivo
   group by lavoro_id
) a on a.lavoro_id = l.id
where l.attivo;

comment on view public.lavori_riepilogo is 'Per ogni lavoro attivo: ore previste, già nel programma e ancora da programmare.';

-- Il programma con tutto quello che serve per mostrarlo e gli avvisi.
-- Gli avvisi sono informazioni: niente è vietato.
create view public.programma
as
select
  a.id,
  a.giorno,
  a.dalle,
  a.alle,
  round((extract(epoch from (a.alle - a.dalle)) / 3600)::numeric, 2) as ore,
  a.note,
  a.lavoro_id,
  l.titolo,
  l.descrizione,
  l.stato as stato_lavoro,
  (l.urgente or coalesce(c.urgente, false)) as urgente,
  l.commessa_id,
  c.numero as commessa_numero,
  c.descrizione as commessa_descrizione,
  s.denominazione as cliente,
  c.data_consegna,
  a.macchina_id,
  m.nome as macchina,
  m.tipo as tipo_macchina,
  -- indirizzo solo per le postazioni fuori sede (posa)
  case when m.fuori_sede then coalesce(
    public.indirizzo_testo(se.indirizzo, se.civico, se.cap, se.comune, se.provincia),
    public.indirizzo_testo(s.indirizzo, s.civico, s.cap, s.comune, s.provincia))
  end as luogo_posa,
  a.dipendente_id,
  btrim(d.nome || ' ' || d.cognome) as persona,
  (d.profilo_id is not null and d.profilo_id = auth.uid()) as mio,

  -- avvisi
  (a.dipendente_id is null) as senza_persona,
  (a.dipendente_id is not null and a.macchina_id is not null and not exists (
     select 1 from public.competenze k
      where k.dipendente_id = a.dipendente_id and k.macchina_id = a.macchina_id and k.attivo)
  ) as senza_competenza,
  exists (
    select 1 from public.assenze x
     where x.dipendente_id = a.dipendente_id and x.attivo
       and public.periodo(x.dal, x.al, x.dalle, x.alle) && public.periodo(a.giorno, a.giorno, a.dalle, a.alle)
  ) as persona_assente,
  exists (
    select 1 from public.fermi_macchina f
     where f.macchina_id = a.macchina_id and f.attivo
       and public.periodo(f.dal, f.al, f.dalle, f.alle) && public.periodo(a.giorno, a.giorno, a.dalle, a.alle)
  ) as macchina_ferma,
  not exists (
    select 1 from public.fasce_orario(a.azienda_id, a.dipendente_id, a.giorno) o
     where o.dalle <= a.dalle and o.alle >= a.alle
  ) as fuori_orario,
  -- informazioni (consentito): la stessa persona o la stessa macchina
  -- su più lavori nello stesso momento
  exists (
    select 1 from public.assegnazioni b
     where b.id <> a.id and b.attivo and b.giorno = a.giorno
       and b.dipendente_id = a.dipendente_id
       and b.dalle < a.alle and b.alle > a.dalle
  ) as persona_su_piu_lavori,
  exists (
    select 1 from public.assegnazioni b
     where b.id <> a.id and b.attivo and b.giorno = a.giorno
       and b.macchina_id = a.macchina_id
       and b.dalle < a.alle and b.alle > a.dalle
  ) as macchina_su_piu_lavori
from public.assegnazioni a
join public.lavori l on l.id = a.lavoro_id
left join public.commesse c on c.id = l.commessa_id
left join public.soggetti s on s.id = c.soggetto_id
left join public.sedi_soggetto se on se.id = c.sede_id
left join public.macchine m on m.id = a.macchina_id
left join public.dipendenti d on d.id = a.dipendente_id
where a.attivo
  and (select public.ruolo_corrente()) is not null
  and a.azienda_id = (select public.azienda_corrente());

comment on view public.programma is 'Programma del giorno (assegnazioni attive) con lavoro, commessa, cliente, macchina, persona e avvisi. Senza prezzi: la leggono tutti gli utenti attivi.';

revoke all on public.dipendenti_elenco, public.assenze_elenco, public.commesse_elenco,
              public.lavori_riepilogo, public.programma from anon;
grant select on public.dipendenti_elenco, public.assenze_elenco, public.commesse_elenco,
                public.lavori_riepilogo, public.programma to authenticated;


-- ---------------------------------------------------------------------
-- 15. salva_commessa — salva la commessa con i suoi lavori "tutto o niente"
--
-- p_commessa: { preventivo_id (solo alla creazione), soggetto_id, sede_id,
--               descrizione, data, data_consegna, urgente, note }
--   Con preventivo_id: numero, cliente e (se vuota) descrizione dal preventivo.
-- p_lavori:   [{ id (vuoto se nuovo), fase_id, titolo, descrizione,
--               macchina_id, ore_previste, urgente, note }]
-- L'ordine nell'elenco è l'ordine dei lavori. Lavori con "id" aggiornati,
-- senza "id" nuovi, lavori attivi non più presenti archiviati.
-- Lo stato della commessa e dei lavori NON si cambia da qui.
-- Restituisce l'id della commessa.
-- ---------------------------------------------------------------------
create or replace function public.salva_commessa(
  p_id        uuid,
  p_commessa  jsonb,
  p_lavori    jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_lavoro  jsonb;
  v_lav_id  uuid;
  v_tenuti  uuid[] := '{}';
  v_ordine  integer := 0;
begin
  if v_id is null then
    insert into public.commesse (
      preventivo_id, soggetto_id, sede_id, descrizione, data, data_consegna, urgente, note)
    select r.preventivo_id, r.soggetto_id, r.sede_id, coalesce(r.descrizione, ''),
           coalesce(r.data, current_date), r.data_consegna, coalesce(r.urgente, false), r.note
      from jsonb_populate_record(null::public.commesse, p_commessa) r
    returning id into v_id;
  else
    update public.commesse c set (
      soggetto_id, sede_id, descrizione, data, data_consegna, urgente, note
    ) = (
      select coalesce(r.soggetto_id, c.soggetto_id), r.sede_id, r.descrizione,
             coalesce(r.data, c.data), r.data_consegna, coalesce(r.urgente, false), r.note
        from jsonb_populate_record(null::public.commesse, p_commessa) r
    )
    where c.id = v_id;
    if not found then
      raise exception 'Commessa non trovata o permessi insufficienti.';
    end if;
  end if;

  for v_lavoro in select * from jsonb_array_elements(coalesce(p_lavori, '[]')) loop
    v_ordine := v_ordine + 1;
    if coalesce(v_lavoro ->> 'id', '') = '' then
      insert into public.lavori (commessa_id, fase_id, ordine, titolo, descrizione, macchina_id, ore_previste, urgente, note)
      select v_id, r.fase_id, v_ordine, r.titolo, r.descrizione, r.macchina_id, r.ore_previste,
             coalesce(r.urgente, false), r.note
        from jsonb_populate_record(null::public.lavori, v_lavoro - 'id') r
      returning id into v_lav_id;
    else
      v_lav_id := (v_lavoro ->> 'id')::uuid;
      update public.lavori x set
        (fase_id, ordine, titolo, descrizione, macchina_id, ore_previste, urgente, note, attivo) = (
          select r.fase_id, v_ordine, r.titolo, r.descrizione, r.macchina_id, r.ore_previste,
                 coalesce(r.urgente, false), r.note, true
            from jsonb_populate_record(null::public.lavori, v_lavoro) r)
       where x.id = v_lav_id and x.commessa_id = v_id;
      if not found then
        raise exception 'Lavoro della commessa non trovato.';
      end if;
    end if;
    v_tenuti := v_tenuti || v_lav_id;
  end loop;

  update public.lavori set attivo = false
   where commessa_id = v_id and attivo and id <> all (v_tenuti);

  return v_id;
end;
$$;

revoke execute on function public.salva_commessa(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salva_commessa(uuid, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 16. Dati iniziali
-- ---------------------------------------------------------------------

-- Orario aziendale: lun–ven 08:00–12:30 e 13:30–17:00 (7,5 h),
-- per ogni azienda esistente e per quelle nuove (crea_azienda).
create or replace function public.orario_iniziale(p_azienda_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.orari_lavoro (azienda_id, giorno_settimana, dalle, alle)
  select p_azienda_id, g, f.dalle, f.alle
    from generate_series(1, 5) g
   cross join (values (time '08:00', time '12:30'), (time '13:30', time '17:00')) f (dalle, alle);
$$;

revoke execute on function public.orario_iniziale(uuid) from public, anon, authenticated;

create or replace function public.dopo_nuova_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.orario_iniziale(new.id);
  return null;
end;
$$;

revoke execute on function public.dopo_nuova_azienda() from public, anon, authenticated;

create trigger y_orario_iniziale after insert on public.azienda
  for each row execute function public.dopo_nuova_azienda();

select public.orario_iniziale(a.id) from public.azienda a;

-- Macchine e postazioni dell'azienda di oggi (la più vecchia), con la
-- tariffa oraria del preventivo quando ne esiste una con quel nome.
insert into public.macchine (azienda_id, nome, tipo, reparto, fuori_sede, ordine, tariffa_id)
select az.id, m.nome, m.tipo::public.tipo_macchina, m.reparto, m.fuori_sede, m.ordine,
       (select t.id from public.tariffe_orarie t
         where t.azienda_id = az.id and t.attivo and t.nome = m.tariffa limit 1)
  from (select id from public.azienda order by creato_il, id limit 1) az
 cross join (values
   ('Stampante UV piana', 'macchina',   'Stampa',      false, 1, 'Stampante UV'),
   ('Stampante UV RTR',   'macchina',   'Stampa',      false, 2, 'Stampante UV'),
   ('Canon Colorado',     'macchina',   'Stampa',      false, 3, null),
   ('Plotter Summa',      'macchina',   'Taglio',      false, 4, null),
   ('Fresa Zund',         'macchina',   'Fresa',       false, 5, null),
   ('Fresa Jwei',         'macchina',   'Fresa',       false, 6, null),
   ('Grafica',            'postazione', 'Grafica',     false, 7, 'Grafica'),
   ('Laboratorio',        'postazione', 'Laboratorio', false, 8, 'Laboratorio'),
   ('Posa esterna',       'postazione', 'Posa',        true,  9, 'Posa (trasferta compresa)')
 ) m (nome, tipo, reparto, fuori_sede, ordine, tariffa);
