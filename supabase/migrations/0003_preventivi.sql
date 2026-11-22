-- =====================================================================
-- 0003_preventivi.sql  (schema v0.6, 22/11/2026)
-- Preventivi a fasi: tariffe orarie, preventivi, fasi, ore e materiali
-- di ogni fase, modelli di lavorazione, numerazione "23/26".
--
-- Richiede 0001_fondamenta.sql e 0002_anagrafiche.sql.
-- Si esegue UNA volta per database.
--
-- Come funziona un preventivo:
--   preventivo → fasi (Grafica, Stampa, Posa…) → per ogni fase righe di
--   ORE (ore × costo orario) e righe di MATERIALI (quantità × costo).
--   Costo totale × (1 + ricarico %) = prezzo calcolato; il prezzo al
--   cliente si può correggere a mano. Il cliente vede solo le fasi e il prezzo.
--
-- Un MODELLO di lavorazione usa le stesse tabelle di fasi, ore e
-- materiali: la fase appartiene a un preventivo OPPURE a un modello.
--
-- Permessi (gli operai non vedono niente di questa sezione):
--   preventivi, fasi, ore, materiali, modelli
--       → leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
--   tariffe_orarie
--       → leggono titolare, ufficio, contabilità; scrive solo il titolare
--   numeratori → nessuno direttamente (li aggiorna il database)
--
-- Un preventivo ACCETTATO o RIFIUTATO non si modifica più: si può solo
-- cambiarne lo stato o archiviarlo. Per rifarlo si duplica.
-- Niente cancellazioni: si archivia con attivo = false.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.tipo_tariffa     as enum ('persona', 'macchina', 'posa');
create type public.stato_preventivo as enum ('bozza', 'inviato', 'accettato', 'rifiutato');


-- ---------------------------------------------------------------------
-- 2. numeratori — l'ultimo numero usato, per documento e anno
--    Esempio: ('preventivo', 2026, 113) → il prossimo è 114/26.
--    Servirà anche per le commesse. Lo aggiorna solo il database,
--    dentro lo stesso salvataggio: due persone che creano un preventivo
--    nello stesso istante ricevono numeri diversi, e se il salvataggio
--    non va a buon fine il numero non viene "bruciato".
--
--    Per partire da un numero diverso (es. continuare da FileMaker) il
--    titolare lo imposta una volta dal SQL Editor:
--      insert into numeratori (documento, anno, ultimo) values ('preventivo', 2026, 113)
--      on conflict (documento, anno) do update set ultimo = excluded.ultimo;
-- ---------------------------------------------------------------------
create table public.numeratori (
  documento  text not null,
  anno       smallint not null check (anno between 2000 and 2999),
  ultimo     integer not null default 0 check (ultimo >= 0),
  primary key (documento, anno)
);

comment on table public.numeratori is 'Ultimo numero usato per documento e anno (preventivi, commesse…). Lo aggiorna solo il database.';

-- Prossimo numero. "security definer" perché gli utenti non possono
-- toccare numeratori direttamente; la si usa solo dai trigger qui sotto.
create or replace function public.prossimo_numero(p_documento text, p_anno smallint)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.numeratori as n (documento, anno, ultimo)
  values (p_documento, p_anno, 1)
  on conflict (documento, anno) do update set ultimo = n.ultimo + 1
  returning n.ultimo;
$$;

revoke execute on function public.prossimo_numero(text, smallint) from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. tariffe_orarie — costo di un'ora di lavoro (persona, macchina, posa)
-- ---------------------------------------------------------------------
create table public.tariffe_orarie (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null check (btrim(nome) <> ''),
  tipo           public.tipo_tariffa not null default 'persona',
  costo_orario   numeric(12,2) not null default 0 check (costo_orario >= 0),
  note           text,
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.tariffe_orarie is 'Tariffe orarie (€/ora) usate nelle righe di ore dei preventivi. La posa comprende la trasferta.';

create unique index tariffe_orarie_nome_unico on public.tariffe_orarie (lower(btrim(nome))) where attivo;


-- ---------------------------------------------------------------------
-- 4. modelli_lavorazione — preventivi "tipo" da cui partire
--    (le fasi stanno in fasi_preventivo, con modello_id)
-- ---------------------------------------------------------------------
create table public.modelli_lavorazione (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (btrim(nome) <> ''),
  descrizione           text,
  ricarico_percentuale  numeric(5,2) not null default 35 check (ricarico_percentuale between 0 and 999),
  note                  text,
  attivo                boolean not null default true,
  creato_il             timestamptz not null default now(),
  creato_da             uuid default auth.uid() references public.profili (id),
  aggiornato_il         timestamptz not null default now(),
  aggiornato_da         uuid default auth.uid() references public.profili (id)
);

comment on table public.modelli_lavorazione is 'Modelli di lavorazione (es. "Banner PVC con occhielli"): fasi, ore e materiali tipici da copiare in un nuovo preventivo.';

create unique index modelli_lavorazione_nome_unico on public.modelli_lavorazione (lower(btrim(nome))) where attivo;


-- ---------------------------------------------------------------------
-- 5. preventivi
-- ---------------------------------------------------------------------
create table public.preventivi (
  id                    uuid primary key default gen_random_uuid(),
  -- Numero: progressivo per anno, mostrato come "23/26". Lo assegna il database.
  anno                  smallint not null,
  progressivo           integer not null,
  numero                text generated always as (
                          progressivo::text || '/' || lpad((anno % 100)::text, 2, '0')
                        ) stored,
  soggetto_id           uuid not null references public.soggetti (id),
  oggetto               text not null check (btrim(oggetto) <> ''),
  modello_id            uuid references public.modelli_lavorazione (id),
  data                  date not null default current_date,
  valido_fino           date,
  stato                 public.stato_preventivo not null default 'bozza',
  ricarico_percentuale  numeric(5,2) not null default 35 check (ricarico_percentuale between 0 and 999),
  -- vuoto = si usa il prezzo calcolato; compilato = prezzo corretto a mano
  prezzo_cliente        numeric(12,2) check (prezzo_cliente >= 0),
  codice_iva_id         uuid references public.codici_iva (id),
  cig                   text,   -- solo per la PA
  cup                   text,   -- solo per la PA
  note                  text,   -- note interne
  attivo                boolean not null default true,
  creato_il             timestamptz not null default now(),
  creato_da             uuid default auth.uid() references public.profili (id),
  aggiornato_il         timestamptz not null default now(),
  aggiornato_da         uuid default auth.uid() references public.profili (id),
  constraint preventivi_numero_unico unique (anno, progressivo),
  constraint preventivi_validita check (valido_fino is null or valido_fino >= data)
);

comment on table public.preventivi is 'Preventivi a fasi. Costi, ore e totali si calcolano nella vista preventivi_riepilogo.';

create index preventivi_soggetto_idx on public.preventivi (soggetto_id);
create index preventivi_ordine_idx   on public.preventivi (anno desc, progressivo desc);
create index preventivi_oggetto_idx  on public.preventivi (lower(oggetto));


-- ---------------------------------------------------------------------
-- 6. fasi_preventivo — le fasi di un preventivo o di un modello
-- ---------------------------------------------------------------------
create table public.fasi_preventivo (
  id                   uuid primary key default gen_random_uuid(),
  preventivo_id        uuid references public.preventivi (id),
  modello_id           uuid references public.modelli_lavorazione (id),
  ordine               integer not null default 0,
  titolo               text not null check (btrim(titolo) <> ''),
  descrizione_cliente  text,   -- il testo che va nel PDF
  attivo               boolean not null default true,
  creato_il            timestamptz not null default now(),
  creato_da            uuid default auth.uid() references public.profili (id),
  aggiornato_il        timestamptz not null default now(),
  aggiornato_da        uuid default auth.uid() references public.profili (id),
  -- una fase appartiene a un preventivo OPPURE a un modello, mai a tutti e due
  constraint fasi_preventivo_o_modello check ((preventivo_id is null) <> (modello_id is null))
);

comment on table public.fasi_preventivo is 'Fasi di lavorazione di un preventivo (preventivo_id) o di un modello (modello_id).';

create index fasi_preventivo_preventivo_idx on public.fasi_preventivo (preventivo_id, ordine);
create index fasi_preventivo_modello_idx    on public.fasi_preventivo (modello_id, ordine);


-- ---------------------------------------------------------------------
-- 7. ore_fase — righe di ore di lavoro (ore × costo orario)
-- ---------------------------------------------------------------------
create table public.ore_fase (
  id             uuid primary key default gen_random_uuid(),
  fase_id        uuid not null references public.fasi_preventivo (id),
  ordine         integer not null default 0,
  tariffa_id     uuid not null references public.tariffe_orarie (id),
  ore            numeric(6,2) not null default 0 check (ore >= 0),   -- ore totali (2 persone × 4 h = 8)
  persone        integer check (persone between 1 and 99),          -- solo per mostrare il dettaglio
  -- copiato dalla tariffa quando si crea la riga: se la tariffa cambia,
  -- i preventivi già fatti restano com'erano
  costo_orario   numeric(12,2) not null check (costo_orario >= 0),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id)
);

comment on table public.ore_fase is 'Ore di lavoro di una fase. costo_orario è copiato dalla tariffa al momento dell''inserimento.';

create index ore_fase_fase_idx on public.ore_fase (fase_id, ordine);


-- ---------------------------------------------------------------------
-- 8. materiali_fase — righe di materiali (quantità × costo unitario)
-- ---------------------------------------------------------------------
create table public.materiali_fase (
  id              uuid primary key default gen_random_uuid(),
  fase_id         uuid not null references public.fasi_preventivo (id),
  ordine          integer not null default 0,
  articolo_id     uuid references public.articoli (id),   -- vuoto = materiale non a catalogo
  descrizione     text not null check (btrim(descrizione) <> ''),
  unita_misura    text not null default 'pz' check (btrim(unita_misura) <> ''),
  -- solo per i materiali in bobina: quantità (m²) = larghezza × metri lineari
  larghezza_m     numeric(6,3) check (larghezza_m > 0),
  metri_lineari   numeric(10,3) check (metri_lineari > 0),
  quantita        numeric(12,3) not null default 0 check (quantita >= 0),
  -- copiato dall'articolo quando si crea la riga (modificabile)
  costo_unitario  numeric(12,4) not null check (costo_unitario >= 0),
  attivo          boolean not null default true,
  creato_il       timestamptz not null default now(),
  creato_da       uuid default auth.uid() references public.profili (id),
  aggiornato_il   timestamptz not null default now(),
  aggiornato_da   uuid default auth.uid() references public.profili (id),
  constraint materiali_fase_bobina check ((larghezza_m is null) = (metri_lineari is null))
);

comment on table public.materiali_fase is 'Materiali di una fase. Per le bobine la quantità in m² la calcola il database.';

create index materiali_fase_fase_idx on public.materiali_fase (fase_id, ordine);


-- ---------------------------------------------------------------------
-- 9. Pulizia e controlli prima del salvataggio (trigger a_…)
-- ---------------------------------------------------------------------

-- Vero se il preventivo non si può più modificare (accettato o rifiutato).
create or replace function public.preventivo_bloccato(p_preventivo_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select stato in ('accettato', 'rifiutato') from public.preventivi where id = p_preventivo_id),
    false);
$$;

-- Numero del nuovo preventivo. "security definer" per poter aggiornare
-- numeratori (gli utenti non ci arrivano direttamente).
create or replace function public.numera_preventivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.anno        := extract(year from new.data)::smallint;
  new.progressivo := public.prossimo_numero('preventivo', new.anno);
  return new;
end;
$$;

create or replace function public.normalizza_preventivo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo public.tipo_soggetto;
begin
  new.oggetto := btrim(new.oggetto);
  new.cig     := public.pulisci_codice(new.cig);
  new.cup     := public.pulisci_codice(new.cup);
  new.note    := public.pulisci(new.note);

  if tg_op = 'INSERT' or new.soggetto_id is distinct from old.soggetto_id then
    select s.tipo into v_tipo from public.soggetti s where s.id = new.soggetto_id;
    if v_tipo = 'fornitore' then
      raise exception 'Il preventivo va intestato a un cliente, non a un fornitore.';
    end if;
  end if;

  -- validità non indicata: un mese dalla data del preventivo
  if new.valido_fino is null then
    new.valido_fino := (new.data + interval '1 month')::date;
  end if;

  -- codice IVA non indicato: quello abituale del cliente, altrimenti il "22"
  if new.codice_iva_id is null then
    select s.codice_iva_abituale_id into new.codice_iva_id
      from public.soggetti s where s.id = new.soggetto_id;
  end if;
  if new.codice_iva_id is null then
    select c.id into new.codice_iva_id
      from public.codici_iva c where c.codice = '22' and c.attivo limit 1;
  end if;
  return new;
end;
$$;

-- Dopo la creazione: il numero non cambia più. Un preventivo accettato
-- o rifiutato accetta solo il cambio di stato e l'archiviazione.
create or replace function public.proteggi_preventivo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anno        := old.anno;
  new.progressivo := old.progressivo;
  if old.stato in ('accettato', 'rifiutato')
     -- (numero è calcolato dopo i trigger: qui in "new" è ancora vuoto, quindi si esclude)
     and (to_jsonb(new) - 'numero' - 'stato' - 'attivo' - 'aggiornato_il' - 'aggiornato_da')
         is distinct from (to_jsonb(old) - 'numero' - 'stato' - 'attivo' - 'aggiornato_il' - 'aggiornato_da') then
    raise exception 'Il preventivo % è %: non si modifica più. Duplicalo per farne uno nuovo.',
      old.numero, old.stato;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_fase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- una fase non si sposta da un preventivo (o modello) all'altro
    new.preventivo_id := old.preventivo_id;
    new.modello_id    := old.modello_id;
  end if;
  if public.preventivo_bloccato(new.preventivo_id) then
    raise exception 'Il preventivo è accettato o rifiutato: le fasi non si modificano più.';
  end if;
  new.titolo              := btrim(new.titolo);
  new.descrizione_cliente := public.pulisci(new.descrizione_cliente);
  return new;
end;
$$;

-- Controllo comune alle righe di ore e materiali.
create or replace function public.controlla_riga_fase(p_fase_id uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.fasi_preventivo f
     where f.id = p_fase_id and public.preventivo_bloccato(f.preventivo_id)
  ) then
    raise exception 'Il preventivo è accettato o rifiutato: le righe non si modificano più.';
  end if;
end;
$$;

create or replace function public.normalizza_ore_fase()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.fase_id := old.fase_id;
  end if;
  perform public.controlla_riga_fase(new.fase_id);
  -- costo orario non indicato: si copia quello attuale della tariffa
  if new.costo_orario is null then
    select t.costo_orario into new.costo_orario
      from public.tariffe_orarie t where t.id = new.tariffa_id;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_materiale_fase()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articolo public.articoli;
begin
  if tg_op = 'UPDATE' then
    new.fase_id := old.fase_id;
  end if;
  perform public.controlla_riga_fase(new.fase_id);

  -- dati non indicati: si copiano dall'articolo del catalogo
  if new.articolo_id is not null then
    select * into v_articolo from public.articoli a where a.id = new.articolo_id;
    new.descrizione    := coalesce(public.pulisci(new.descrizione), v_articolo.descrizione);
    new.unita_misura   := coalesce(public.pulisci(new.unita_misura), v_articolo.unita_misura);
    new.costo_unitario := coalesce(new.costo_unitario, v_articolo.costo_unitario);
  end if;
  new.descrizione  := btrim(new.descrizione);
  new.unita_misura := btrim(new.unita_misura);

  -- bobina: quantità in m² = larghezza × metri lineari
  if new.larghezza_m is not null and new.metri_lineari is not null then
    new.quantita     := round(new.larghezza_m * new.metri_lineari, 3);
    new.unita_misura := 'm2';
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_tariffa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := btrim(new.nome);
  new.note := public.pulisci(new.note);
  return new;
end;
$$;

create or replace function public.normalizza_modello()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome        := btrim(new.nome);
  new.descrizione := public.pulisci(new.descrizione);
  new.note        := public.pulisci(new.note);
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 10. Trigger (ordine alfabetico: a_… prima, poi b_aggiornamento, z_registro)
-- ---------------------------------------------------------------------
create trigger a_numera before insert on public.preventivi
  for each row execute function public.numera_preventivo();
create trigger a_normalizza before insert or update on public.preventivi
  for each row execute function public.normalizza_preventivo();
create trigger a_proteggi before update on public.preventivi
  for each row execute function public.proteggi_preventivo();
create trigger a_normalizza before insert or update on public.fasi_preventivo
  for each row execute function public.normalizza_fase();
create trigger a_normalizza before insert or update on public.ore_fase
  for each row execute function public.normalizza_ore_fase();
create trigger a_normalizza before insert or update on public.materiali_fase
  for each row execute function public.normalizza_materiale_fase();
create trigger a_normalizza before insert or update on public.tariffe_orarie
  for each row execute function public.normalizza_tariffa();
create trigger a_normalizza before insert or update on public.modelli_lavorazione
  for each row execute function public.normalizza_modello();

do $$
declare
  t text;
begin
  foreach t in array array[
    'tariffe_orarie', 'modelli_lavorazione', 'preventivi',
    'fasi_preventivo', 'ore_fase', 'materiali_fase'
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
-- 11. Sicurezza: Row Level Security
-- ---------------------------------------------------------------------
alter table public.numeratori enable row level security;
revoke all on public.numeratori from anon, authenticated;   -- nessuna regola: nessun accesso diretto

do $$
declare
  t text;
begin
  -- Preventivi e modelli: leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
  foreach t in array array[
    'modelli_lavorazione', 'preventivi', 'fasi_preventivo', 'ore_fase', 'materiali_fase'
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
end;
$$;

-- Tariffe: leggono titolare, ufficio, contabilità; scrive solo il titolare
alter table public.tariffe_orarie enable row level security;
revoke all on public.tariffe_orarie from anon;
create policy "tariffe_orarie: lettura" on public.tariffe_orarie
  for select to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio', 'contabilita')));
create policy "tariffe_orarie: inserimento" on public.tariffe_orarie
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare')));
create policy "tariffe_orarie: modifica" on public.tariffe_orarie
  for update to authenticated
  using ((select public.ha_ruolo('titolare')))
  with check ((select public.ha_ruolo('titolare')));


-- ---------------------------------------------------------------------
-- 12. Viste dei totali (calcolati, mai scritti a mano)
--     "security_invoker": valgono le regole RLS di chi legge.
--     Ogni riga si arrotonda al centesimo, poi si somma: così i conti
--     tornano uguali a quelli che si vedono nella pagina.
-- ---------------------------------------------------------------------
create view public.fasi_riepilogo
with (security_invoker = true)
as
select
  f.id as fase_id,
  f.preventivo_id,
  f.modello_id,
  coalesce(o.ore, 0)               as ore,
  coalesce(o.costo, 0)             as costo_ore,
  coalesce(m.costo, 0)             as costo_materiali,
  coalesce(o.costo, 0) + coalesce(m.costo, 0) as costo
from public.fasi_preventivo f
left join (
  select fase_id, sum(ore) as ore, sum(round(ore * costo_orario, 2)) as costo
    from public.ore_fase where attivo group by fase_id
) o on o.fase_id = f.id
left join (
  select fase_id, sum(round(quantita * costo_unitario, 2)) as costo
    from public.materiali_fase where attivo group by fase_id
) m on m.fase_id = f.id
where f.attivo;

comment on view public.fasi_riepilogo is 'Ore e costo di ogni fase attiva (preventivi e modelli).';

create view public.preventivi_riepilogo
with (security_invoker = true)
as
with costi as (
  select preventivo_id,
         sum(ore) as ore, sum(costo_ore) as costo_ore, sum(costo_materiali) as costo_materiali
    from public.fasi_riepilogo
   where preventivo_id is not null
   group by preventivo_id
),
base as (
  select
    p.id as preventivo_id,
    coalesce(c.ore, 0)              as ore_previste,
    coalesce(c.costo_ore, 0)        as costo_ore,
    coalesce(c.costo_materiali, 0)  as costo_materiali,
    coalesce(c.costo_ore, 0) + coalesce(c.costo_materiali, 0) as costo_totale,
    round((coalesce(c.costo_ore, 0) + coalesce(c.costo_materiali, 0))
          * (1 + p.ricarico_percentuale / 100), 2) as prezzo_calcolato,
    p.prezzo_cliente,
    coalesce(i.aliquota, 0) as aliquota_iva
  from public.preventivi p
  left join costi c on c.preventivo_id = p.id
  left join public.codici_iva i on i.id = p.codice_iva_id
)
select
  b.preventivo_id,
  b.ore_previste,
  b.costo_ore,
  b.costo_materiali,
  b.costo_totale,
  b.prezzo_calcolato,
  coalesce(b.prezzo_cliente, b.prezzo_calcolato) as prezzo,
  coalesce(b.prezzo_cliente, b.prezzo_calcolato) - b.costo_totale as margine,
  -- margine in percentuale sul prezzo al cliente (come nel mockup)
  case when coalesce(b.prezzo_cliente, b.prezzo_calcolato) > 0
       then round((coalesce(b.prezzo_cliente, b.prezzo_calcolato) - b.costo_totale)
                  / coalesce(b.prezzo_cliente, b.prezzo_calcolato) * 100, 1)
  end as margine_percentuale,
  b.aliquota_iva,
  round(coalesce(b.prezzo_cliente, b.prezzo_calcolato) * b.aliquota_iva / 100, 2) as iva,
  coalesce(b.prezzo_cliente, b.prezzo_calcolato)
    + round(coalesce(b.prezzo_cliente, b.prezzo_calcolato) * b.aliquota_iva / 100, 2) as totale
from base b;

comment on view public.preventivi_riepilogo is 'Totali di ogni preventivo: ore, costi, prezzo, margine, IVA e totale.';

revoke all on public.fasi_riepilogo, public.preventivi_riepilogo from anon;


-- ---------------------------------------------------------------------
-- 13. salva_fasi — salva le fasi (con ore e materiali) di un preventivo
--     o di un modello. La usano salva_preventivo e salva_modello.
--
-- p_fasi è un elenco JSON:
--   [{ "id": …(vuoto se nuova), "titolo": "Stampa", "descrizione_cliente": "…",
--      "ore":       [{ "id", "tariffa_id", "ore", "persone", "costo_orario" }],
--      "materiali": [{ "id", "articolo_id", "descrizione", "unita_misura",
--                      "larghezza_m", "metri_lineari", "quantita", "costo_unitario" }] }]
-- L'ordine nell'elenco è l'ordine delle fasi e delle righe.
-- Righe con "id" → aggiornate; senza → nuove; righe attive che non
-- compaiono più → archiviate. costo_orario / costo_unitario vuoti →
-- copiati da tariffa / articolo.
-- ---------------------------------------------------------------------
create or replace function public.salva_fasi(
  p_preventivo_id uuid,
  p_modello_id    uuid,
  p_fasi          jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fase      jsonb;
  v_riga      jsonb;
  v_fase_id   uuid;
  v_riga_id   uuid;
  v_fasi_ok   uuid[] := '{}';
  v_righe_ok  uuid[];
  v_ordine    integer := 0;
  v_ordine_r  integer;
begin
  if (p_preventivo_id is null) = (p_modello_id is null) then
    raise exception 'Indicare un preventivo oppure un modello.';
  end if;

  for v_fase in select * from jsonb_array_elements(coalesce(p_fasi, '[]')) loop
    v_ordine := v_ordine + 1;

    -- la fase
    if coalesce(v_fase ->> 'id', '') = '' then
      insert into public.fasi_preventivo (preventivo_id, modello_id, ordine, titolo, descrizione_cliente)
      values (p_preventivo_id, p_modello_id, v_ordine, v_fase ->> 'titolo', v_fase ->> 'descrizione_cliente')
      returning id into v_fase_id;
    else
      v_fase_id := (v_fase ->> 'id')::uuid;
      update public.fasi_preventivo f
         set ordine = v_ordine,
             titolo = v_fase ->> 'titolo',
             descrizione_cliente = v_fase ->> 'descrizione_cliente',
             attivo = true
       where f.id = v_fase_id
         and f.preventivo_id is not distinct from p_preventivo_id
         and f.modello_id    is not distinct from p_modello_id;
      if not found then
        raise exception 'Fase non trovata.';
      end if;
    end if;
    v_fasi_ok := v_fasi_ok || v_fase_id;

    -- righe di ore
    v_righe_ok := '{}';
    v_ordine_r := 0;
    for v_riga in select * from jsonb_array_elements(coalesce(v_fase -> 'ore', '[]')) loop
      v_ordine_r := v_ordine_r + 1;
      if coalesce(v_riga ->> 'id', '') = '' then
        insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, persone, costo_orario)
        select v_fase_id, v_ordine_r, r.tariffa_id, coalesce(r.ore, 0), r.persone, r.costo_orario
          from jsonb_populate_record(null::public.ore_fase, v_riga - 'id') r
        returning id into v_riga_id;
      else
        v_riga_id := (v_riga ->> 'id')::uuid;
        update public.ore_fase o set (ordine, tariffa_id, ore, persone, costo_orario, attivo) = (
            select v_ordine_r, r.tariffa_id, coalesce(r.ore, 0), r.persone,
                   coalesce(r.costo_orario, o.costo_orario), true
              from jsonb_populate_record(null::public.ore_fase, v_riga) r)
         where o.id = v_riga_id and o.fase_id = v_fase_id;
        if not found then
          raise exception 'Riga di ore non trovata.';
        end if;
      end if;
      v_righe_ok := v_righe_ok || v_riga_id;
    end loop;
    update public.ore_fase set attivo = false
     where fase_id = v_fase_id and attivo and id <> all (v_righe_ok);

    -- righe di materiali
    v_righe_ok := '{}';
    v_ordine_r := 0;
    for v_riga in select * from jsonb_array_elements(coalesce(v_fase -> 'materiali', '[]')) loop
      v_ordine_r := v_ordine_r + 1;
      if coalesce(v_riga ->> 'id', '') = '' then
        insert into public.materiali_fase
          (fase_id, ordine, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario)
        select v_fase_id, v_ordine_r, r.articolo_id, r.descrizione, r.unita_misura,
               r.larghezza_m, r.metri_lineari, coalesce(r.quantita, 0), r.costo_unitario
          from jsonb_populate_record(null::public.materiali_fase, v_riga - 'id') r
        returning id into v_riga_id;
      else
        v_riga_id := (v_riga ->> 'id')::uuid;
        update public.materiali_fase m set
          (ordine, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario, attivo) = (
            select v_ordine_r, r.articolo_id, r.descrizione, r.unita_misura,
                   r.larghezza_m, r.metri_lineari, coalesce(r.quantita, 0),
                   coalesce(r.costo_unitario, m.costo_unitario), true
              from jsonb_populate_record(null::public.materiali_fase, v_riga) r)
         where m.id = v_riga_id and m.fase_id = v_fase_id;
        if not found then
          raise exception 'Riga di materiale non trovata.';
        end if;
      end if;
      v_righe_ok := v_righe_ok || v_riga_id;
    end loop;
    update public.materiali_fase set attivo = false
     where fase_id = v_fase_id and attivo and id <> all (v_righe_ok);
  end loop;

  -- fasi tolte: archiviate insieme alle loro righe
  update public.ore_fase set attivo = false
   where attivo and fase_id in (
     select id from public.fasi_preventivo
      where attivo and id <> all (v_fasi_ok)
        and preventivo_id is not distinct from p_preventivo_id
        and modello_id    is not distinct from p_modello_id);
  update public.materiali_fase set attivo = false
   where attivo and fase_id in (
     select id from public.fasi_preventivo
      where attivo and id <> all (v_fasi_ok)
        and preventivo_id is not distinct from p_preventivo_id
        and modello_id    is not distinct from p_modello_id);
  update public.fasi_preventivo set attivo = false
   where attivo and id <> all (v_fasi_ok)
     and preventivo_id is not distinct from p_preventivo_id
     and modello_id    is not distinct from p_modello_id;
end;
$$;

revoke execute on function public.salva_fasi(uuid, uuid, jsonb) from public, anon;
grant execute on function public.salva_fasi(uuid, uuid, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 14. salva_preventivo — salva il preventivo intero "tutto o niente"
--
-- p_preventivo: { soggetto_id, oggetto, modello_id, data, valido_fino,
--                 ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note }
-- Lo stato NON si cambia da qui (nuovo = bozza): si cambia con un
-- semplice update della colonna stato.
-- Restituisce l'id del preventivo.
-- ---------------------------------------------------------------------
create or replace function public.salva_preventivo(
  p_id          uuid,
  p_preventivo  jsonb,
  p_fasi        jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.preventivi (
      soggetto_id, oggetto, modello_id, data, valido_fino,
      ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note
    )
    select
      r.soggetto_id, r.oggetto, r.modello_id, coalesce(r.data, current_date), r.valido_fino,
      coalesce(r.ricarico_percentuale, 35), r.prezzo_cliente, r.codice_iva_id, r.cig, r.cup, r.note
    from jsonb_populate_record(null::public.preventivi, p_preventivo) r
    returning id into v_id;
  else
    if public.preventivo_bloccato(v_id) then
      raise exception 'Il preventivo è accettato o rifiutato: non si modifica più. Duplicalo per farne uno nuovo.';
    end if;
    update public.preventivi p set (
      soggetto_id, oggetto, modello_id, data, valido_fino,
      ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note
    ) = (
      select
        r.soggetto_id, r.oggetto, r.modello_id, coalesce(r.data, p.data), r.valido_fino,
        coalesce(r.ricarico_percentuale, 35), r.prezzo_cliente, r.codice_iva_id, r.cig, r.cup, r.note
      from jsonb_populate_record(null::public.preventivi, p_preventivo) r
    )
    where p.id = v_id;
    if not found then
      raise exception 'Preventivo non trovato o permessi insufficienti.';
    end if;
  end if;

  perform public.salva_fasi(v_id, null, p_fasi);
  return v_id;
end;
$$;

revoke execute on function public.salva_preventivo(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salva_preventivo(uuid, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 15. salva_modello — come salva_preventivo, per i modelli di lavorazione
--
-- p_modello: { nome, descrizione, ricarico_percentuale, note }
-- Restituisce l'id del modello.
-- ---------------------------------------------------------------------
create or replace function public.salva_modello(
  p_id       uuid,
  p_modello  jsonb,
  p_fasi     jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if v_id is null then
    insert into public.modelli_lavorazione (nome, descrizione, ricarico_percentuale, note)
    select r.nome, r.descrizione, coalesce(r.ricarico_percentuale, 35), r.note
      from jsonb_populate_record(null::public.modelli_lavorazione, p_modello) r
    returning id into v_id;
  else
    update public.modelli_lavorazione m set (nome, descrizione, ricarico_percentuale, note, attivo) = (
      select r.nome, r.descrizione, coalesce(r.ricarico_percentuale, 35), r.note, true
        from jsonb_populate_record(null::public.modelli_lavorazione, p_modello) r)
     where m.id = v_id;
    if not found then
      raise exception 'Modello non trovato o permessi insufficienti.';
    end if;
  end if;

  perform public.salva_fasi(null, v_id, p_fasi);
  return v_id;
end;
$$;

revoke execute on function public.salva_modello(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salva_modello(uuid, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 16. Dati iniziali: le tariffe orarie del mockup, con costi d'esempio.
--     Il titolare li corregge in Impostazioni → Tariffe orarie.
-- ---------------------------------------------------------------------
insert into public.tariffe_orarie (nome, tipo, costo_orario, note) values
  ('Grafica',                   'persona',  45, 'Costo d''esempio: da correggere'),
  ('Laboratorio',               'persona',  38, 'Costo d''esempio: da correggere'),
  ('Stampante UV',              'macchina', 60, 'Costo d''esempio: da correggere'),
  ('Posa (trasferta compresa)', 'posa',     42, 'Costo d''esempio: da correggere');
