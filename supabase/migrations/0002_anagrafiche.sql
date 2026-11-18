-- =====================================================================
-- 0002_anagrafiche.sql
-- Anagrafiche: condizioni di pagamento, listini, clienti/fornitori
-- (soggetti), articoli e prezzi per listino.
--
-- Richiede 0001_fondamenta.sql. Si esegue UNA volta per database.
--
-- Permessi: titolare, ufficio e contabilità leggono; titolare e ufficio
-- creano e modificano. Gli operai non vedono queste tabelle.
-- Niente cancellazioni: si archivia con attivo = false.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.tipo_soggetto as enum ('cliente', 'fornitore', 'entrambi');
create type public.tipo_articolo as enum ('articolo', 'lavorazione', 'servizio');


-- ---------------------------------------------------------------------
-- 2. condizioni_pagamento — es. "Bonifico 30 gg"
-- ---------------------------------------------------------------------
create table public.condizioni_pagamento (
  id             uuid primary key default gen_random_uuid(),
  descrizione    text not null check (btrim(descrizione) <> ''),
  giorni         integer not null default 0 check (giorni between 0 and 365),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.condizioni_pagamento is 'Condizioni di pagamento proposte a clienti e fornitori.';

-- due condizioni attive non possono avere la stessa descrizione
create unique index condizioni_pagamento_descrizione_unica
  on public.condizioni_pagamento (lower(btrim(descrizione))) where attivo;


-- ---------------------------------------------------------------------
-- 3. listini — es. "Rivenditori". Chi non ha listino paga il prezzo base.
-- ---------------------------------------------------------------------
create table public.listini (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (btrim(nome) <> ''),
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.listini is 'Listini prezzi. Un articolo senza prezzo nel listino usa il prezzo base.';

create unique index listini_nome_unico on public.listini (lower(btrim(nome))) where attivo;


-- ---------------------------------------------------------------------
-- 4. soggetti — clienti e fornitori in una sola tabella
-- ---------------------------------------------------------------------
create table public.soggetti (
  id                       uuid primary key default gen_random_uuid(),
  tipo                     public.tipo_soggetto not null default 'cliente',
  ragione_sociale          text not null check (btrim(ragione_sociale) <> ''),
  partita_iva              text check (partita_iva ~ '^[0-9]{11}$'),
  -- persone: 16 caratteri; aziende: spesso uguale alla P.IVA (11 cifre)
  codice_fiscale           text check (codice_fiscale ~ '^([A-Z0-9]{16}|[0-9]{11})$'),
  codice_sdi               text check (codice_sdi ~ '^[A-Z0-9]{7}$'),
  pec                      text check (pec ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  indirizzo                text,
  cap                      text check (cap ~ '^[0-9]{5}$'),
  citta                    text,
  provincia                text check (provincia ~ '^[A-Z]{2}$'),
  email                    text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono                 text,
  referente                text,
  condizione_pagamento_id  uuid references public.condizioni_pagamento (id),
  listino_id               uuid references public.listini (id),
  note                     text,
  attivo                   boolean not null default true,
  creato_il                timestamptz not null default now(),
  creato_da                uuid default auth.uid() references public.profili (id),
  aggiornato_il            timestamptz not null default now(),
  aggiornato_da            uuid default auth.uid() references public.profili (id)
);

comment on table public.soggetti is 'Clienti e fornitori. tipo = entrambi se un''azienda è sia cliente sia fornitore.';

-- la stessa partita IVA non può comparire due volte tra i soggetti attivi
create unique index soggetti_partita_iva_unica
  on public.soggetti (partita_iva) where attivo and partita_iva is not null;
create index soggetti_ragione_sociale_idx on public.soggetti (lower(ragione_sociale));

-- Pulisce i dati prima di salvarli (spazi, maiuscole, "IT" davanti alla P.IVA,
-- campi vuoti → null), così i controlli qui sopra non scattano per un dettaglio.
create or replace function public.normalizza_soggetto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ragione_sociale := btrim(new.ragione_sociale);
  new.partita_iva     := nullif(regexp_replace(regexp_replace(upper(coalesce(new.partita_iva, '')), '^\s*IT', ''), '[^0-9]', '', 'g'), '');
  new.codice_fiscale  := nullif(regexp_replace(upper(coalesce(new.codice_fiscale, '')), '\s', '', 'g'), '');
  new.codice_sdi      := nullif(regexp_replace(upper(coalesce(new.codice_sdi, '')), '\s', '', 'g'), '');
  new.pec             := nullif(lower(btrim(coalesce(new.pec, ''))), '');
  new.email           := nullif(lower(btrim(coalesce(new.email, ''))), '');
  new.provincia       := nullif(upper(btrim(coalesce(new.provincia, ''))), '');
  new.cap             := nullif(btrim(coalesce(new.cap, '')), '');
  new.indirizzo       := nullif(btrim(coalesce(new.indirizzo, '')), '');
  new.citta           := nullif(btrim(coalesce(new.citta, '')), '');
  new.telefono        := nullif(btrim(coalesce(new.telefono, '')), '');
  new.referente       := nullif(btrim(coalesce(new.referente, '')), '');
  new.note            := nullif(btrim(coalesce(new.note, '')), '');
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. articoli — articoli, lavorazioni e servizi
-- ---------------------------------------------------------------------
create table public.articoli (
  id             uuid primary key default gen_random_uuid(),
  codice         text,
  descrizione    text not null check (btrim(descrizione) <> ''),
  tipo           public.tipo_articolo not null default 'articolo',
  unita_misura   text not null default 'pz' check (btrim(unita_misura) <> ''),
  -- 4 decimali: i prezzi unitari possono essere frazioni di centesimo (es. 0,0350 €/pz)
  prezzo_base    numeric(12,4) not null default 0 check (prezzo_base >= 0),
  aliquota_iva   numeric(5,2) not null default 22 check (aliquota_iva in (0, 4, 5, 10, 22)),
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.articoli is 'Articoli, lavorazioni e servizi usati nei preventivi.';

-- il codice è facoltativo, ma se c'è è unico tra gli articoli attivi (maiuscole/minuscole uguali)
create unique index articoli_codice_unico
  on public.articoli (lower(codice)) where attivo and codice is not null;
create index articoli_descrizione_idx on public.articoli (lower(descrizione));

create or replace function public.normalizza_articolo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codice       := nullif(btrim(coalesce(new.codice, '')), '');
  new.descrizione  := btrim(new.descrizione);
  new.unita_misura := btrim(new.unita_misura);
  new.note         := nullif(btrim(coalesce(new.note, '')), '');
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. prezzi_listino — prezzo di un articolo in un listino
-- ---------------------------------------------------------------------
create table public.prezzi_listino (
  id             uuid primary key default gen_random_uuid(),
  listino_id     uuid not null references public.listini (id),
  articolo_id    uuid not null references public.articoli (id),
  prezzo         numeric(12,4) not null check (prezzo >= 0),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  -- una sola riga per coppia listino/articolo: per togliere un prezzo si mette attivo = false
  unique (listino_id, articolo_id)
);

comment on table public.prezzi_listino is 'Prezzo speciale di un articolo in un listino. Riga non attiva = vale il prezzo base.';

create index prezzi_listino_articolo_idx on public.prezzi_listino (articolo_id);

-- Prezzo di un articolo per un cliente: quello del suo listino se c'è, altrimenti il prezzo base.
-- (Lo useranno i Preventivi; rispetta i permessi di chi la chiama.)
create or replace function public.prezzo_per_cliente(p_articolo uuid, p_soggetto uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select pl.prezzo
       from public.prezzi_listino pl
       join public.listini l on l.id = pl.listino_id and l.attivo
       join public.soggetti s on s.listino_id = pl.listino_id
      where pl.articolo_id = p_articolo and pl.attivo and s.id = p_soggetto),
    (select a.prezzo_base from public.articoli a where a.id = p_articolo)
  );
$$;


-- ---------------------------------------------------------------------
-- 7. Trigger comuni (vedi 0001): pulizia dati, aggiornamento, niente
--    cancellazioni, registro modifiche
-- ---------------------------------------------------------------------
create trigger a_normalizza before insert or update on public.soggetti
  for each row execute function public.normalizza_soggetto();
create trigger a_normalizza before insert or update on public.articoli
  for each row execute function public.normalizza_articolo();

create trigger b_aggiornamento before update on public.condizioni_pagamento
  for each row execute function public.imposta_aggiornamento();
create trigger b_aggiornamento before update on public.listini
  for each row execute function public.imposta_aggiornamento();
create trigger b_aggiornamento before update on public.soggetti
  for each row execute function public.imposta_aggiornamento();
create trigger b_aggiornamento before update on public.articoli
  for each row execute function public.imposta_aggiornamento();
create trigger b_aggiornamento before update on public.prezzi_listino
  for each row execute function public.imposta_aggiornamento();

create trigger vieta_cancellazione before delete on public.condizioni_pagamento
  for each row execute function public.vieta_cancellazione();
create trigger vieta_cancellazione before delete on public.listini
  for each row execute function public.vieta_cancellazione();
create trigger vieta_cancellazione before delete on public.soggetti
  for each row execute function public.vieta_cancellazione();
create trigger vieta_cancellazione before delete on public.articoli
  for each row execute function public.vieta_cancellazione();
create trigger vieta_cancellazione before delete on public.prezzi_listino
  for each row execute function public.vieta_cancellazione();

create trigger z_registro after insert or update on public.condizioni_pagamento
  for each row execute function public.registra_modifica();
create trigger z_registro after insert or update on public.listini
  for each row execute function public.registra_modifica();
create trigger z_registro after insert or update on public.soggetti
  for each row execute function public.registra_modifica();
create trigger z_registro after insert or update on public.articoli
  for each row execute function public.registra_modifica();
create trigger z_registro after insert or update on public.prezzi_listino
  for each row execute function public.registra_modifica();


-- ---------------------------------------------------------------------
-- 8. Sicurezza: Row Level Security
-- ---------------------------------------------------------------------
alter table public.condizioni_pagamento enable row level security;
alter table public.listini              enable row level security;
alter table public.soggetti             enable row level security;
alter table public.articoli             enable row level security;
alter table public.prezzi_listino       enable row level security;

revoke all on public.condizioni_pagamento, public.listini, public.soggetti,
              public.articoli, public.prezzi_listino from anon;
revoke execute on function public.prezzo_per_cliente(uuid, uuid) from public, anon;
grant execute on function public.prezzo_per_cliente(uuid, uuid) to authenticated;

-- Stesse regole per tutte e cinque le tabelle:
--   lettura: titolare, ufficio, contabilità
--   inserimento e modifica: titolare, ufficio
do $$
declare
  t text;
begin
  foreach t in array array['condizioni_pagamento', 'listini', 'soggetti', 'articoli', 'prezzi_listino']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.ha_ruolo(''titolare'', ''ufficio'', ''contabilita'')))',
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


-- ---------------------------------------------------------------------
-- 9. Dati iniziali (si possono modificare o archiviare dall'app)
-- ---------------------------------------------------------------------
insert into public.condizioni_pagamento (descrizione, giorni) values
  ('Rimessa diretta', 0),
  ('Bonifico 30 gg', 30),
  ('Bonifico 60 gg', 60);
