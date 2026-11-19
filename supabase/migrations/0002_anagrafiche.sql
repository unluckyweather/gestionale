-- =====================================================================
-- 0002_anagrafiche.sql  (v0.5, mockup confermato il 19/11/2026)
-- Anagrafiche: tabelle fiscali (codici IVA, condizioni di pagamento,
-- banche aziendali), categorie, clienti/fornitori (soggetti) con
-- contatti, sedi e dichiarazioni d'intento, catalogo materiali (articoli).
--
-- Richiede 0001_fondamenta.sql. Si esegue UNA volta per database.
--
-- Permessi (gli operai non vedono nessuna di queste tabelle):
--   soggetti, contatti, sedi, dichiarazioni, articoli, categorie
--       → leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
--   codici_iva, condizioni_pagamento, banche_aziendali
--       → leggono titolare, ufficio, contabilità; scrivono titolare e contabilità
-- Niente cancellazioni: si archivia con attivo = false.
--
-- Codici paese e nazione: sigla ISO di 2 lettere (IT, DE, FR…), come
-- vuole la fattura elettronica. I controlli italiani (P.IVA 11 cifre,
-- CAP 5 cifre, provincia 2 lettere) valgono solo quando il paese è IT.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.tipo_soggetto  as enum ('cliente', 'fornitore', 'entrambi');
create type public.forma_soggetto as enum ('azienda', 'persona_fisica', 'pubblica_amministrazione');
create type public.tipo_sede      as enum ('operativa', 'altra');
create type public.tipo_articolo  as enum ('articolo', 'lavorazione', 'servizio');


-- ---------------------------------------------------------------------
-- 2. Tabelle fiscali e di servizio
-- ---------------------------------------------------------------------

-- codici_iva — es. "22" (aliquota ordinaria), "N3.1" (non imponibile, esportazione)
create table public.codici_iva (
  id             uuid primary key default gen_random_uuid(),
  codice         text not null check (btrim(codice) <> ''),
  descrizione    text not null check (btrim(descrizione) <> ''),
  aliquota       numeric(5,2) not null check (aliquota in (0, 4, 5, 10, 22)),
  -- natura per la fattura elettronica (N1…N7, con sottocodici es. N3.1): solo se l'aliquota è 0
  natura         text check (natura ~ '^N[1-7](\.[1-9])?$'),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint codici_iva_natura_se_zero check ((aliquota = 0) = (natura is not null))
);

comment on table public.codici_iva is 'Codici IVA: aliquota e, se esente/non imponibile, natura per la fattura elettronica.';

create unique index codici_iva_codice_unico on public.codici_iva (lower(btrim(codice))) where attivo;


-- condizioni_pagamento — es. "Bonifico 30 gg"
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

create unique index condizioni_pagamento_descrizione_unica
  on public.condizioni_pagamento (lower(btrim(descrizione))) where attivo;


-- banche_aziendali — le banche dell'azienda (appoggio per Ri.Ba. e bonifici)
create table public.banche_aziendali (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (btrim(nome) <> ''),
  iban           text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  abi            text check (abi ~ '^[0-9]{5}$'),
  cab            text check (cab ~ '^[0-9]{5}$'),
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.banche_aziendali is 'Banche dell''azienda, scelte come banca d''appoggio nella scheda di clienti e fornitori.';

create unique index banche_aziendali_nome_unico on public.banche_aziendali (lower(btrim(nome))) where attivo;


-- categorie_soggetto — categorie merceologiche di clienti e fornitori
create table public.categorie_soggetto (
  id             uuid primary key default gen_random_uuid(),
  descrizione    text not null check (btrim(descrizione) <> ''),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.categorie_soggetto is 'Categorie merceologiche di clienti e fornitori.';

create unique index categorie_soggetto_descrizione_unica
  on public.categorie_soggetto (lower(btrim(descrizione))) where attivo;


-- ---------------------------------------------------------------------
-- 3. soggetti — clienti e fornitori in una sola tabella
-- ---------------------------------------------------------------------
create table public.soggetti (
  id                       uuid primary key default gen_random_uuid(),
  tipo                     public.tipo_soggetto not null default 'cliente',
  forma                    public.forma_soggetto not null default 'azienda',

  -- Nome: ragione sociale (azienda), denominazione ente (PA), cognome e nome (persona)
  ragione_sociale          text,
  cognome                  text,
  nome                     text,
  -- nome da mostrare negli elenchi e da usare nella ricerca (calcolato, non si scrive)
  denominazione            text generated always as (
                             coalesce(ragione_sociale, btrim(coalesce(cognome, '') || ' ' || coalesce(nome, '')))
                           ) stored,
  nome_breve               text,
  categoria_id             uuid references public.categorie_soggetto (id),
  sito_web                 text,

  -- Dati fiscali e fattura elettronica
  paese_iva                text not null default 'IT' check (paese_iva ~ '^[A-Z]{2}$'),
  partita_iva              text,
  codice_fiscale           text,
  codice_sdi               text check (codice_sdi ~ '^[A-Z0-9]{7}$'),
  codice_ufficio_pa        text check (codice_ufficio_pa ~ '^[A-Z0-9]{6}$'),
  split_payment            boolean not null default false,
  pec                      text check (pec ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  codice_iva_abituale_id   uuid references public.codici_iva (id),

  -- Sede legale (va in fattura)
  indirizzo                text,
  civico                   text,
  cap                      text,
  comune                   text,
  provincia                text,
  nazione                  text not null default 'IT' check (nazione ~ '^[A-Z]{2}$'),

  -- Banca
  iban                     text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  abi                      text check (abi ~ '^[0-9]{5}$'),
  cab                      text check (cab ~ '^[0-9]{5}$'),
  banca_agenzia            text,
  banca_aziendale_id       uuid references public.banche_aziendali (id),
  note_riba                text,

  -- Pagamento e scadenze
  condizione_pagamento_id  uuid references public.condizioni_pagamento (id),
  mese_escluso_1           smallint check (mese_escluso_1 between 1 and 12),
  mese_escluso_2           smallint check (mese_escluso_2 between 1 and 12),
  giorno_fisso             smallint check (giorno_fisso between 1 and 31),

  -- Reverse charge (solo fornitori, da confermare con il commercialista)
  reverse_charge           boolean not null default false,
  rc_tipo_documento        text check (rc_tipo_documento in ('TD16', 'TD17', 'TD18', 'TD19')),
  rc_natura                text check (rc_natura ~ '^N[1-7](\.[1-9])?$'),
  rc_codice_iva_id         uuid references public.codici_iva (id),

  -- Note e privacy
  note_interne             text,
  note_documenti           text,
  privacy_inviata_il       date,
  privacy_firmata_il       date,

  attivo                   boolean not null default true,
  creato_il                timestamptz not null default now(),
  creato_da                uuid default auth.uid() references public.profili (id),
  aggiornato_il            timestamptz not null default now(),
  aggiornato_da            uuid default auth.uid() references public.profili (id),

  -- Controlli italiani solo per i soggetti italiani
  constraint soggetti_partita_iva_formato check (
    partita_iva is null
    or (paese_iva = 'IT' and partita_iva ~ '^[0-9]{11}$')
    or (paese_iva <> 'IT' and partita_iva ~ '^[A-Z0-9]{2,28}$')
  ),
  constraint soggetti_codice_fiscale_formato check (
    codice_fiscale is null
    or paese_iva <> 'IT'
    or codice_fiscale ~ '^([A-Z0-9]{16}|[0-9]{11})$'
  ),
  constraint soggetti_cap_formato       check (cap is null or nazione <> 'IT' or cap ~ '^[0-9]{5}$'),
  constraint soggetti_provincia_formato check (provincia is null or nazione <> 'IT' or provincia ~ '^[A-Z]{2}$'),

  -- Coerenza tra forma e campi
  constraint soggetti_nome_obbligatorio check (
    case forma
      when 'persona_fisica' then cognome is not null and nome is not null
      else ragione_sociale is not null
    end
  ),
  constraint soggetti_campi_pa check (
    forma = 'pubblica_amministrazione' or (codice_ufficio_pa is null and not split_payment)
  ),
  constraint soggetti_reverse_charge check (
    (reverse_charge and tipo <> 'cliente')
    or (not reverse_charge and rc_tipo_documento is null and rc_natura is null and rc_codice_iva_id is null)
  )
);

comment on table public.soggetti is 'Clienti e fornitori (aziende, persone fisiche, PA, anche esteri). tipo = entrambi se è sia cliente sia fornitore.';
comment on column public.soggetti.denominazione is 'Calcolata: ragione sociale oppure "cognome nome". Per elenchi e ricerca.';

-- la stessa partita IVA (dello stesso paese) non può comparire due volte tra i soggetti attivi
create unique index soggetti_partita_iva_unica
  on public.soggetti (paese_iva, partita_iva) where attivo and partita_iva is not null;
create index soggetti_denominazione_idx on public.soggetti (lower(denominazione));


-- ---------------------------------------------------------------------
-- 4. Tabelle collegate a un soggetto
-- ---------------------------------------------------------------------

-- contatti_soggetto — più contatti per soggetto
create table public.contatti_soggetto (
  id                 uuid primary key default gen_random_uuid(),
  soggetto_id        uuid not null references public.soggetti (id),
  riferimento        text,           -- Commerciale, Amministrazione… o scritto a mano
  persona            text,
  email              text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono           text,
  cellulare          text,
  riceve_preventivi  boolean not null default false,
  riceve_fatture     boolean not null default false,
  attivo             boolean not null default true,
  creato_il          timestamptz not null default now(),
  creato_da          uuid default auth.uid() references public.profili (id),
  aggiornato_il      timestamptz not null default now(),
  aggiornato_da      uuid default auth.uid() references public.profili (id),
  -- una riga di contatto deve contenere almeno qualcosa
  constraint contatti_non_vuoto check (coalesce(riferimento, persona, email, telefono, cellulare) is not null)
);

comment on table public.contatti_soggetto is 'Contatti di clienti e fornitori. riceve_* = a chi proporre l''invio di preventivi e fatture.';

create index contatti_soggetto_soggetto_idx on public.contatti_soggetto (soggetto_id);
create index contatti_soggetto_email_idx on public.contatti_soggetto (lower(email));


-- sedi_soggetto — sede operativa (al massimo una attiva) e altre sedi
create table public.sedi_soggetto (
  id             uuid primary key default gen_random_uuid(),
  soggetto_id    uuid not null references public.soggetti (id),
  tipo           public.tipo_sede not null default 'altra',
  nome           text,
  indirizzo      text,
  civico         text,
  cap            text,
  comune         text,
  provincia      text,
  nazione        text not null default 'IT' check (nazione ~ '^[A-Z]{2}$'),
  telefono       text,
  annotazioni    text,
  consegna       boolean not null default false,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  constraint sedi_cap_formato       check (cap is null or nazione <> 'IT' or cap ~ '^[0-9]{5}$'),
  constraint sedi_provincia_formato check (provincia is null or nazione <> 'IT' or provincia ~ '^[A-Z]{2}$'),
  constraint sedi_non_vuota         check (coalesce(nome, indirizzo, comune) is not null),
  -- la sede operativa è sempre proponibile come destinazione nei DDT
  constraint sedi_operativa_consegna check (tipo <> 'operativa' or consegna)
);

comment on table public.sedi_soggetto is 'Sedi di clienti e fornitori. Nessuna sede operativa = coincide con la sede legale.';

create index sedi_soggetto_soggetto_idx on public.sedi_soggetto (soggetto_id);
create unique index sedi_soggetto_una_operativa
  on public.sedi_soggetto (soggetto_id) where tipo = 'operativa' and attivo;


-- dichiarazioni_intento — esportatori abituali (solo clienti) · da confermare
create table public.dichiarazioni_intento (
  id             uuid primary key default gen_random_uuid(),
  soggetto_id    uuid not null references public.soggetti (id),
  -- protocollo di ricezione dell'Agenzia delle Entrate: 17 cifre, trattino, 6 cifre
  protocollo     text not null check (protocollo ~ '^[0-9]{17}-[0-9]{6}$'),
  data           date not null,
  anno           smallint not null check (anno between 2000 and 2100),
  importo        numeric(12,2) not null check (importo > 0),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.dichiarazioni_intento is 'Dichiarazioni d''intento dei clienti esportatori abituali. Già fatturato e residuo si calcoleranno dalle fatture.';

create index dichiarazioni_intento_soggetto_idx on public.dichiarazioni_intento (soggetto_id);
create unique index dichiarazioni_intento_protocollo_unico
  on public.dichiarazioni_intento (protocollo) where attivo;


-- ---------------------------------------------------------------------
-- 5. articoli — catalogo dei materiali acquistati, con il loro costo
-- ---------------------------------------------------------------------
create table public.articoli (
  id                  uuid primary key default gen_random_uuid(),
  codice              text,
  descrizione         text not null check (btrim(descrizione) <> ''),
  tipo                public.tipo_articolo not null default 'articolo',
  unita_misura        text not null default 'pz' check (btrim(unita_misura) <> ''),
  -- IVA esclusa, 4 decimali: i costi unitari possono essere frazioni di centesimo
  costo_unitario      numeric(12,4) not null default 0 check (costo_unitario >= 0),
  -- solo materiali in bobina: m² = larghezza × metri lineari
  larghezza_bobina_m  numeric(6,3) check (larghezza_bobina_m > 0),
  codice_iva_id       uuid references public.codici_iva (id),   -- se vuoto: il codice "22"
  fornitore_id        uuid references public.soggetti (id),     -- fornitore abituale
  note                text,
  attivo              boolean not null default true,
  creato_il           timestamptz not null default now(),
  creato_da           uuid default auth.uid() references public.profili (id),
  aggiornato_il       timestamptz not null default now(),
  aggiornato_da       uuid default auth.uid() references public.profili (id)
);

comment on table public.articoli is 'Catalogo materiali (con costo d''acquisto), lavorazioni e servizi usati nei preventivi a fasi. Non è un listino di vendita.';

create unique index articoli_codice_unico
  on public.articoli (lower(codice)) where attivo and codice is not null;
create index articoli_descrizione_idx on public.articoli (lower(descrizione));
create index articoli_fornitore_idx on public.articoli (fornitore_id);


-- ---------------------------------------------------------------------
-- 6. Pulizia dei dati prima del salvataggio (trigger a_normalizza)
--    Spazi, maiuscole/minuscole, campi vuoti → null; toglie i campi che
--    non c'entrano con la forma scelta, così i controlli non scattano
--    per un dettaglio.
-- ---------------------------------------------------------------------

-- testo ripulito: spazi tolti ai lati, vuoto → null
create or replace function public.pulisci(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(t), '');
$$;

-- toglie tutti gli spazi e mette in maiuscolo, vuoto → null
create or replace function public.pulisci_codice(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(upper(regexp_replace(coalesce(t, ''), '\s', '', 'g')), '');
$$;

create or replace function public.normalizza_soggetto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ragione_sociale   := public.pulisci(new.ragione_sociale);
  new.cognome           := public.pulisci(new.cognome);
  new.nome              := public.pulisci(new.nome);
  new.nome_breve        := public.pulisci(new.nome_breve);
  new.sito_web          := public.pulisci(new.sito_web);
  new.paese_iva         := coalesce(public.pulisci_codice(new.paese_iva), 'IT');
  new.partita_iva       := public.pulisci_codice(replace(new.partita_iva, '.', ''));
  -- "IT01234567890" → "01234567890" (la sigla paese sta nel suo campo)
  if new.partita_iva is not null and left(new.partita_iva, 2) = new.paese_iva then
    new.partita_iva := nullif(substr(new.partita_iva, 3), '');
  end if;
  new.codice_fiscale    := public.pulisci_codice(new.codice_fiscale);
  new.codice_sdi        := public.pulisci_codice(new.codice_sdi);
  new.codice_ufficio_pa := public.pulisci_codice(new.codice_ufficio_pa);
  new.pec               := lower(public.pulisci(new.pec));
  new.indirizzo         := public.pulisci(new.indirizzo);
  new.civico            := public.pulisci(new.civico);
  new.cap               := public.pulisci(new.cap);
  new.comune            := public.pulisci(new.comune);
  new.provincia         := public.pulisci_codice(new.provincia);
  new.nazione           := coalesce(public.pulisci_codice(new.nazione), 'IT');
  new.iban              := public.pulisci_codice(new.iban);
  new.abi               := public.pulisci(new.abi);
  new.cab               := public.pulisci(new.cab);
  new.banca_agenzia     := public.pulisci(new.banca_agenzia);
  new.note_riba         := public.pulisci(new.note_riba);
  new.rc_tipo_documento := public.pulisci_codice(new.rc_tipo_documento);
  new.rc_natura         := public.pulisci(new.rc_natura);
  new.note_interne      := public.pulisci(new.note_interne);
  new.note_documenti    := public.pulisci(new.note_documenti);

  -- campi che non c'entrano con la forma scelta
  if new.forma = 'persona_fisica' then
    new.ragione_sociale := null;
  else
    new.cognome := null;
    new.nome    := null;
  end if;
  if new.forma <> 'pubblica_amministrazione' then
    new.codice_ufficio_pa := null;
    new.split_payment     := false;
  end if;
  if not new.reverse_charge then
    new.rc_tipo_documento := null;
    new.rc_natura         := null;
    new.rc_codice_iva_id  := null;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_contatto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.riferimento := public.pulisci(new.riferimento);
  new.persona     := public.pulisci(new.persona);
  new.email       := lower(public.pulisci(new.email));
  new.telefono    := public.pulisci(new.telefono);
  new.cellulare   := public.pulisci(new.cellulare);
  return new;
end;
$$;

create or replace function public.normalizza_sede()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome        := public.pulisci(new.nome);
  new.indirizzo   := public.pulisci(new.indirizzo);
  new.civico      := public.pulisci(new.civico);
  new.cap         := public.pulisci(new.cap);
  new.comune      := public.pulisci(new.comune);
  new.provincia   := public.pulisci_codice(new.provincia);
  new.nazione     := coalesce(public.pulisci_codice(new.nazione), 'IT');
  new.telefono    := public.pulisci(new.telefono);
  new.annotazioni := public.pulisci(new.annotazioni);
  if new.tipo = 'operativa' then
    new.consegna := true;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_dichiarazione()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- accetta "12345678901234567/123456" o con spazi: diventa 12345678901234567-123456
  new.protocollo := regexp_replace(coalesce(new.protocollo, ''), '[\s/]+', '-', 'g');
  new.protocollo := regexp_replace(new.protocollo, '^([0-9]{17})-*([0-9]{6})$', '\1-\2');
  return new;
end;
$$;

create or replace function public.normalizza_articolo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.codice       := public.pulisci(new.codice);
  new.descrizione  := btrim(new.descrizione);
  new.unita_misura := btrim(new.unita_misura);
  new.note         := public.pulisci(new.note);
  -- codice IVA non indicato: si propone il "22"
  if new.codice_iva_id is null then
    select c.id into new.codice_iva_id
      from public.codici_iva c
     where c.codice = '22' and c.attivo
     limit 1;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_tabella_fiscale()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'codici_iva' then
    new.codice := btrim(new.codice);
    new.natura := public.pulisci_codice(new.natura);
  elsif tg_table_name = 'banche_aziendali' then
    new.iban := public.pulisci_codice(new.iban);
    new.abi  := public.pulisci(new.abi);
    new.cab  := public.pulisci(new.cab);
    new.note := public.pulisci(new.note);
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Trigger comuni (vedi 0001): pulizia dati, aggiornamento, niente
--    cancellazioni, registro modifiche
-- ---------------------------------------------------------------------
create trigger a_normalizza before insert or update on public.soggetti
  for each row execute function public.normalizza_soggetto();
create trigger a_normalizza before insert or update on public.contatti_soggetto
  for each row execute function public.normalizza_contatto();
create trigger a_normalizza before insert or update on public.sedi_soggetto
  for each row execute function public.normalizza_sede();
create trigger a_normalizza before insert or update on public.dichiarazioni_intento
  for each row execute function public.normalizza_dichiarazione();
create trigger a_normalizza before insert or update on public.articoli
  for each row execute function public.normalizza_articolo();
create trigger a_normalizza before insert or update on public.codici_iva
  for each row execute function public.normalizza_tabella_fiscale();
create trigger a_normalizza before insert or update on public.banche_aziendali
  for each row execute function public.normalizza_tabella_fiscale();

do $$
declare
  t text;
begin
  foreach t in array array[
    'codici_iva', 'condizioni_pagamento', 'banche_aziendali', 'categorie_soggetto',
    'soggetti', 'contatti_soggetto', 'sedi_soggetto', 'dichiarazioni_intento', 'articoli'
  ]
  loop
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
-- 8. Sicurezza: Row Level Security
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  -- Anagrafiche: leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
  foreach t in array array[
    'categorie_soggetto', 'soggetti', 'contatti_soggetto', 'sedi_soggetto',
    'dichiarazioni_intento', 'articoli'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
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

  -- Tabelle fiscali: leggono titolare, ufficio, contabilità; scrivono titolare e contabilità
  foreach t in array array['codici_iva', 'condizioni_pagamento', 'banche_aziendali']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using ((select public.ha_ruolo(''titolare'', ''ufficio'', ''contabilita'')))',
      t || ': lettura', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check ((select public.ha_ruolo(''titolare'', ''contabilita'')))',
      t || ': inserimento', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using ((select public.ha_ruolo(''titolare'', ''contabilita'')))
         with check ((select public.ha_ruolo(''titolare'', ''contabilita'')))',
      t || ': modifica', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. salva_soggetto — salva la scheda intera "tutto o niente"
--
-- Riceve il soggetto e gli elenchi di contatti, sedi e dichiarazioni
-- (in formato JSON). Se una parte non va, non si salva niente.
-- Righe con "id" → aggiornate; senza "id" → nuove; righe attive del
-- soggetto che non compaiono più → archiviate (attivo = false).
-- "security invoker": gira con i permessi di chi la chiama, quindi le
-- regole RLS qui sopra valgono anche dentro la funzione.
-- Un campo che manca nel JSON vale "vuoto" (null); per tipo e forma si
-- usano i predefiniti (cliente, azienda).
-- Restituisce l'id del soggetto.
-- ---------------------------------------------------------------------
create or replace function public.salva_soggetto(
  p_id            uuid,
  p_soggetto      jsonb,
  p_contatti      jsonb default '[]',
  p_sedi          jsonb default '[]',
  p_dichiarazioni jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id    uuid := p_id;
  v_riga  jsonb;
  v_tenuti uuid[];
  v_tipo  public.tipo_soggetto;
begin
  -- 1. il soggetto
  if v_id is null then
    insert into public.soggetti (
      tipo, forma, ragione_sociale, cognome, nome, nome_breve, categoria_id, sito_web,
      paese_iva, partita_iva, codice_fiscale, codice_sdi, codice_ufficio_pa, split_payment, pec,
      codice_iva_abituale_id, indirizzo, civico, cap, comune, provincia, nazione,
      iban, abi, cab, banca_agenzia, banca_aziendale_id, note_riba,
      condizione_pagamento_id, mese_escluso_1, mese_escluso_2, giorno_fisso,
      reverse_charge, rc_tipo_documento, rc_natura, rc_codice_iva_id,
      note_interne, note_documenti, privacy_inviata_il, privacy_firmata_il
    )
    select
      coalesce(r.tipo, 'cliente'), coalesce(r.forma, 'azienda'), r.ragione_sociale, r.cognome, r.nome, r.nome_breve, r.categoria_id, r.sito_web,
      r.paese_iva, r.partita_iva, r.codice_fiscale, r.codice_sdi, r.codice_ufficio_pa,
      coalesce(r.split_payment, false), r.pec,
      r.codice_iva_abituale_id, r.indirizzo, r.civico, r.cap, r.comune, r.provincia, r.nazione,
      r.iban, r.abi, r.cab, r.banca_agenzia, r.banca_aziendale_id, r.note_riba,
      r.condizione_pagamento_id, r.mese_escluso_1, r.mese_escluso_2, r.giorno_fisso,
      coalesce(r.reverse_charge, false), r.rc_tipo_documento, r.rc_natura, r.rc_codice_iva_id,
      r.note_interne, r.note_documenti, r.privacy_inviata_il, r.privacy_firmata_il
    from jsonb_populate_record(null::public.soggetti, p_soggetto) r
    returning id into v_id;
  else
    update public.soggetti s set (
      tipo, forma, ragione_sociale, cognome, nome, nome_breve, categoria_id, sito_web,
      paese_iva, partita_iva, codice_fiscale, codice_sdi, codice_ufficio_pa, split_payment, pec,
      codice_iva_abituale_id, indirizzo, civico, cap, comune, provincia, nazione,
      iban, abi, cab, banca_agenzia, banca_aziendale_id, note_riba,
      condizione_pagamento_id, mese_escluso_1, mese_escluso_2, giorno_fisso,
      reverse_charge, rc_tipo_documento, rc_natura, rc_codice_iva_id,
      note_interne, note_documenti, privacy_inviata_il, privacy_firmata_il, attivo
    ) = (
      select
        coalesce(r.tipo, 'cliente'), coalesce(r.forma, 'azienda'), r.ragione_sociale, r.cognome, r.nome, r.nome_breve, r.categoria_id, r.sito_web,
        r.paese_iva, r.partita_iva, r.codice_fiscale, r.codice_sdi, r.codice_ufficio_pa,
        coalesce(r.split_payment, false), r.pec,
        r.codice_iva_abituale_id, r.indirizzo, r.civico, r.cap, r.comune, r.provincia, r.nazione,
        r.iban, r.abi, r.cab, r.banca_agenzia, r.banca_aziendale_id, r.note_riba,
        r.condizione_pagamento_id, r.mese_escluso_1, r.mese_escluso_2, r.giorno_fisso,
        coalesce(r.reverse_charge, false), r.rc_tipo_documento, r.rc_natura, r.rc_codice_iva_id,
        r.note_interne, r.note_documenti, r.privacy_inviata_il, r.privacy_firmata_il,
        coalesce(r.attivo, true)
      from jsonb_populate_record(null::public.soggetti, p_soggetto) r
    )
    where s.id = v_id;
    if not found then
      raise exception 'Scheda non trovata o permessi insufficienti.';
    end if;
  end if;

  select tipo into v_tipo from public.soggetti where id = v_id;

  -- 2. contatti
  v_tenuti := '{}';
  for v_riga in select * from jsonb_array_elements(coalesce(p_contatti, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.contatti_soggetto
        (soggetto_id, riferimento, persona, email, telefono, cellulare, riceve_preventivi, riceve_fatture)
      select v_id, r.riferimento, r.persona, r.email, r.telefono, r.cellulare,
             coalesce(r.riceve_preventivi, false), coalesce(r.riceve_fatture, false)
        from jsonb_populate_record(null::public.contatti_soggetto, v_riga - 'id') r
      returning jsonb_build_object('id', id) into v_riga;  -- serve l'id nuovo, per non archiviarlo sotto
    else
      update public.contatti_soggetto c set
        (riferimento, persona, email, telefono, cellulare, riceve_preventivi, riceve_fatture, attivo) = (
          select r.riferimento, r.persona, r.email, r.telefono, r.cellulare,
                 coalesce(r.riceve_preventivi, false), coalesce(r.riceve_fatture, false), true
            from jsonb_populate_record(null::public.contatti_soggetto, v_riga) r)
       where c.id = (v_riga ->> 'id')::uuid and c.soggetto_id = v_id;
      if not found then
        raise exception 'Contatto non trovato.';
      end if;
    end if;
    v_tenuti := v_tenuti || (v_riga ->> 'id')::uuid;
  end loop;
  update public.contatti_soggetto set attivo = false
   where soggetto_id = v_id and attivo and id <> all (v_tenuti);

  -- 3. sedi (operativa e altre)
  v_tenuti := '{}';
  -- prima si archiviano le sedi tolte, così una nuova sede operativa non urta la vecchia
  update public.sedi_soggetto set attivo = false
   where soggetto_id = v_id and attivo
     and id::text not in (
       select coalesce(e ->> 'id', '') from jsonb_array_elements(coalesce(p_sedi, '[]')) e);
  for v_riga in select * from jsonb_array_elements(coalesce(p_sedi, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.sedi_soggetto
        (soggetto_id, tipo, nome, indirizzo, civico, cap, comune, provincia, nazione, telefono, annotazioni, consegna)
      select v_id, coalesce(r.tipo, 'altra'), r.nome, r.indirizzo, r.civico, r.cap, r.comune, r.provincia,
             r.nazione, r.telefono, r.annotazioni, coalesce(r.consegna, false)
        from jsonb_populate_record(null::public.sedi_soggetto, v_riga - 'id') r;
    else
      update public.sedi_soggetto x set
        (tipo, nome, indirizzo, civico, cap, comune, provincia, nazione, telefono, annotazioni, consegna, attivo) = (
          select coalesce(r.tipo, 'altra'), r.nome, r.indirizzo, r.civico, r.cap, r.comune, r.provincia,
                 r.nazione, r.telefono, r.annotazioni, coalesce(r.consegna, false), true
            from jsonb_populate_record(null::public.sedi_soggetto, v_riga) r)
       where x.id = (v_riga ->> 'id')::uuid and x.soggetto_id = v_id;
      if not found then
        raise exception 'Sede non trovata.';
      end if;
    end if;
  end loop;

  -- 4. dichiarazioni d'intento (solo clienti)
  if v_tipo = 'fornitore' and jsonb_array_length(coalesce(p_dichiarazioni, '[]')) > 0 then
    raise exception 'Le dichiarazioni d''intento si registrano solo per i clienti.';
  end if;
  v_tenuti := '{}';
  for v_riga in select * from jsonb_array_elements(coalesce(p_dichiarazioni, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.dichiarazioni_intento (soggetto_id, protocollo, data, anno, importo)
      select v_id, r.protocollo, r.data, r.anno, r.importo
        from jsonb_populate_record(null::public.dichiarazioni_intento, v_riga - 'id') r
      returning jsonb_build_object('id', id) into v_riga;
    else
      update public.dichiarazioni_intento d set (protocollo, data, anno, importo, attivo) = (
          select r.protocollo, r.data, r.anno, r.importo, true
            from jsonb_populate_record(null::public.dichiarazioni_intento, v_riga) r)
       where d.id = (v_riga ->> 'id')::uuid and d.soggetto_id = v_id;
      if not found then
        raise exception 'Dichiarazione d''intento non trovata.';
      end if;
    end if;
    v_tenuti := v_tenuti || (v_riga ->> 'id')::uuid;
  end loop;
  update public.dichiarazioni_intento set attivo = false
   where soggetto_id = v_id and attivo and id <> all (v_tenuti);

  return v_id;
end;
$$;

revoke execute on function public.salva_soggetto(uuid, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.salva_soggetto(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 10. Dati iniziali (si possono modificare o archiviare dall'app)
--     Codici IVA e nature: elenco da confermare con il commercialista.
-- ---------------------------------------------------------------------
insert into public.codici_iva (codice, descrizione, aliquota, natura) values
  ('22',   'Aliquota ordinaria',                         22, null),
  ('10',   'Aliquota ridotta 10%',                       10, null),
  ('5',    'Aliquota ridotta 5%',                         5, null),
  ('4',    'Aliquota minima 4%',                          4, null),
  ('N3.1', 'Non imponibile, esportazione',                0, 'N3.1'),
  ('N3.5', 'Non imponibile, dichiarazione d''intento',    0, 'N3.5'),
  ('N6.9', 'Inversione contabile (reverse charge), altri casi', 0, 'N6.9');

insert into public.condizioni_pagamento (descrizione, giorni) values
  ('Rimessa diretta', 0),
  ('Bonifico 30 gg', 30),
  ('Bonifico 60 gg', 60);
