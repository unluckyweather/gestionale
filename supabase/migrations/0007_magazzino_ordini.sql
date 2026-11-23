-- =====================================================================
-- 0007_magazzino_ordini.sql  (schema v1.0, 23/11/2026)
-- Magazzino e ordini d'acquisto ai fornitori.
--
-- Richiede 0001…0006. Si esegue UNA volta per database.
--
-- Come funziona il magazzino:
--   non si scrive "giacenza = 30" a mano: si registrano i MOVIMENTI
--     +30  carico    (arrivo della merce, anche da un ordine)
--     −20  scarico   (materiale usato; dalle commesse quando esisteranno)
--      +2  rettifica (inventario, quantità iniziale, correzioni)
--   e la giacenza è la loro somma (vista "magazzino").
--   Un movimento sbagliato non si modifica: si archivia e se ne fa uno nuovo.
--
-- Unità di magazzino (decisione 23/11):
--   articolo a lastra → lastre intere; articolo in bobina → bobine intere;
--   tutti gli altri → la sua unità di misura (pz, m2, ml…).
--   Per le bobine si può indicare la lunghezza della bobina intera:
--   serve a calcolare il costo di una bobina (costo al m² × larghezza × lunghezza).
--
-- Ordini d'acquisto: numerati come i preventivi ("3/26"), intestati a un
-- fornitore, con righe di articoli del catalogo. «Registra arrivo» crea i
-- movimenti di carico e aggiorna lo stato dell'ordine da solo.
-- Sotto zero si può andare: è un avviso, non un blocco (decisione 23/11).
--
-- Permessi:
--   ordini_acquisto, righe_ordine_acquisto
--       → leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
--   movimenti_magazzino
--       → leggono tutti gli utenti attivi;
--         titolare e ufficio registrano tutto e archiviano;
--         gli operai registrano solo carichi e scarichi (non legati a un ordine)
--   vista magazzino (giacenze, senza costi) → tutti gli utenti attivi
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Elenchi fissi (enum)
-- ---------------------------------------------------------------------
create type public.stato_ordine_acquisto as enum ('bozza', 'inviato', 'ricevuto_parziale', 'ricevuto', 'annullato');
create type public.tipo_movimento        as enum ('carico', 'scarico', 'rettifica');


-- ---------------------------------------------------------------------
-- 2. Articoli: scorta minima e lunghezza della bobina intera
-- ---------------------------------------------------------------------
alter table public.articoli
  add column scorta_minima       numeric(12,3) check (scorta_minima >= 0),
  add column bobina_lunghezza_m  numeric(8,2)  check (bobina_lunghezza_m > 0),
  add constraint articoli_bobina_lunghezza check (bobina_lunghezza_m is null or larghezza_bobina_m is not null);

comment on column public.articoli.scorta_minima is 'Sotto questa giacenza (in unità di magazzino) l''app mostra un avviso. Vuota = nessun avviso.';
comment on column public.articoli.bobina_lunghezza_m is 'Solo bobine: metri lineari di una bobina intera (per il costo della bobina negli ordini).';

-- Unità in cui si conta l'articolo in magazzino.
create or replace function public.unita_magazzino(a public.articoli)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when a.lastra_larghezza_cm is not null then 'lastra'
    when a.larghezza_bobina_m  is not null then 'bobina'
    else a.unita_misura
  end;
$$;

-- Costo di un'unità di magazzino: lastra → prezzo della lastra;
-- bobina → costo al m² × larghezza × lunghezza (vuoto se manca la lunghezza);
-- altrimenti il costo unitario.
create or replace function public.costo_unita_magazzino(a public.articoli)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when a.larghezza_bobina_m is not null then
      case when a.bobina_lunghezza_m is not null
           then round(a.costo_unitario * a.larghezza_bobina_m * a.bobina_lunghezza_m, 4) end
    else a.costo_unitario
  end;
$$;


-- ---------------------------------------------------------------------
-- 3. ordini_acquisto
-- ---------------------------------------------------------------------
create table public.ordini_acquisto (
  id                    uuid primary key default gen_random_uuid(),
  anno                  smallint not null,
  progressivo           integer not null,
  numero                text generated always as (
                          progressivo::text || '/' || lpad((anno % 100)::text, 2, '0')
                        ) stored,
  soggetto_id           uuid not null references public.soggetti (id),   -- fornitore
  data                  date not null default current_date,
  consegna_prevista     date,
  stato                 public.stato_ordine_acquisto not null default 'bozza',
  riferimento_fornitore text,   -- es. numero della loro offerta
  note_fornitore        text,   -- stampate nell'ordine
  note                  text,   -- interne, mai nel PDF
  attivo                boolean not null default true,
  creato_il             timestamptz not null default now(),
  creato_da             uuid default auth.uid() references public.profili (id),
  aggiornato_il         timestamptz not null default now(),
  aggiornato_da         uuid default auth.uid() references public.profili (id),
  constraint ordini_acquisto_numero_unico unique (anno, progressivo),
  constraint ordini_acquisto_consegna check (consegna_prevista is null or consegna_prevista >= data)
);

comment on table public.ordini_acquisto is 'Ordini d''acquisto ai fornitori. Le quantità arrivate si calcolano dai movimenti di magazzino.';

create index ordini_acquisto_soggetto_idx on public.ordini_acquisto (soggetto_id);
create index ordini_acquisto_ordine_idx   on public.ordini_acquisto (anno desc, progressivo desc);


-- ---------------------------------------------------------------------
-- 4. righe_ordine_acquisto — solo articoli del catalogo
--    (così ogni arrivo finisce nella giacenza giusta)
-- ---------------------------------------------------------------------
create table public.righe_ordine_acquisto (
  id              uuid primary key default gen_random_uuid(),
  ordine_id       uuid not null references public.ordini_acquisto (id),
  ordine          integer not null default 0,   -- posizione
  articolo_id     uuid not null references public.articoli (id),
  descrizione     text not null check (btrim(descrizione) <> ''),
  unita_misura    text not null check (btrim(unita_misura) <> ''),   -- unità di magazzino
  quantita        numeric(12,3) not null check (quantita > 0),
  -- copiato dall'articolo quando si crea la riga (modificabile)
  costo_unitario  numeric(12,4) not null check (costo_unitario >= 0),
  attivo          boolean not null default true,
  creato_il       timestamptz not null default now(),
  creato_da       uuid default auth.uid() references public.profili (id),
  aggiornato_il   timestamptz not null default now(),
  aggiornato_da   uuid default auth.uid() references public.profili (id)
);

comment on table public.righe_ordine_acquisto is 'Righe di un ordine d''acquisto: quantità in unità di magazzino (lastre, bobine, pz…).';

create index righe_ordine_acquisto_ordine_idx   on public.righe_ordine_acquisto (ordine_id, ordine);
create index righe_ordine_acquisto_articolo_idx on public.righe_ordine_acquisto (articolo_id);


-- ---------------------------------------------------------------------
-- 5. movimenti_magazzino — ogni carico, scarico o rettifica è una riga
--    Quantità con il segno: carico > 0, scarico < 0, rettifica ≠ 0.
--    (commessa_id si aggiungerà con la sezione Produzione)
-- ---------------------------------------------------------------------
create table public.movimenti_magazzino (
  id              uuid primary key default gen_random_uuid(),
  articolo_id     uuid not null references public.articoli (id),
  data            date not null default current_date,
  tipo            public.tipo_movimento not null,
  quantita        numeric(12,3) not null,
  riga_ordine_id  uuid references public.righe_ordine_acquisto (id),   -- solo carichi da un ordine
  note            text,
  attivo          boolean not null default true,   -- false = movimento annullato
  creato_il       timestamptz not null default now(),
  creato_da       uuid default auth.uid() references public.profili (id),
  aggiornato_il   timestamptz not null default now(),
  aggiornato_da   uuid default auth.uid() references public.profili (id),
  constraint movimenti_segno check (
    case tipo
      when 'carico'  then quantita > 0
      when 'scarico' then quantita < 0
      else quantita <> 0
    end
  ),
  constraint movimenti_ordine_solo_carico check (riga_ordine_id is null or tipo = 'carico')
);

comment on table public.movimenti_magazzino is 'Movimenti di magazzino (quantità con segno, in unità di magazzino). La giacenza è la somma dei movimenti attivi.';

create index movimenti_magazzino_articolo_idx on public.movimenti_magazzino (articolo_id, data desc) where attivo;
create index movimenti_magazzino_riga_idx     on public.movimenti_magazzino (riga_ordine_id) where riga_ordine_id is not null;


-- ---------------------------------------------------------------------
-- 6. Pulizia e controlli (trigger a_…)
-- ---------------------------------------------------------------------

-- Vero se le righe dell'ordine non si possono più modificare:
-- ordine non più in bozza o inviato (arrivato, anche in parte, o annullato).
create or replace function public.ordine_acquisto_bloccato(p_ordine_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select stato not in ('bozza', 'inviato') from public.ordini_acquisto where id = p_ordine_id),
    false);
$$;

create or replace function public.numera_ordine_acquisto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.anno        := extract(year from new.data)::smallint;
  new.progressivo := public.prossimo_numero('ordine_acquisto', new.anno);
  return new;
end;
$$;

create or replace function public.normalizza_ordine_acquisto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.riferimento_fornitore := public.pulisci(new.riferimento_fornitore);
  new.note_fornitore        := public.pulisci(new.note_fornitore);
  new.note                  := public.pulisci(new.note);

  if tg_op = 'INSERT' or new.soggetto_id is distinct from old.soggetto_id then
    if not exists (
      select 1 from public.soggetti s
       where s.id = new.soggetto_id and s.tipo in ('fornitore', 'entrambi')
    ) then
      raise exception 'L''ordine d''acquisto va intestato a un fornitore.';
    end if;
  end if;
  return new;
end;
$$;

-- Il numero non cambia più. Un ordine arrivato (anche in parte) o annullato
-- accetta solo il cambio di stato, le note interne e l'archiviazione.
create or replace function public.proteggi_ordine_acquisto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.anno        := old.anno;
  new.progressivo := old.progressivo;
  if old.stato not in ('bozza', 'inviato')
     and (to_jsonb(new) - 'numero' - 'stato' - 'note' - 'attivo' - 'aggiornato_il' - 'aggiornato_da')
         is distinct from (to_jsonb(old) - 'numero' - 'stato' - 'note' - 'attivo' - 'aggiornato_il' - 'aggiornato_da') then
    raise exception 'L''ordine % è già arrivato o annullato: si può cambiare solo lo stato.', old.numero;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_riga_ordine()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articolo public.articoli;
begin
  if tg_op = 'UPDATE' then
    new.ordine_id := old.ordine_id;
  end if;
  if public.ordine_acquisto_bloccato(new.ordine_id) then
    raise exception 'L''ordine è già arrivato o annullato: le righe non si modificano più.';
  end if;

  select * into v_articolo from public.articoli a where a.id = new.articolo_id;
  -- l'unità è sempre quella di magazzino dell'articolo
  new.unita_misura := public.unita_magazzino(v_articolo);
  new.descrizione  := coalesce(public.pulisci(new.descrizione), v_articolo.descrizione);
  new.costo_unitario := coalesce(new.costo_unitario, public.costo_unita_magazzino(v_articolo));
  if new.costo_unitario is null then
    raise exception 'Indica il costo della bobina «%» (oppure la lunghezza della bobina nella scheda dell''articolo).',
      v_articolo.descrizione;
  end if;
  return new;
end;
$$;

create or replace function public.normalizza_movimento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_stato    public.stato_ordine_acquisto;
  v_articolo uuid;
begin
  if tg_op = 'UPDATE' then
    -- un movimento non si cambia: si archivia (attivo = false) e se ne fa uno nuovo.
    -- Si possono cambiare solo le note e "attivo".
    new.articolo_id    := old.articolo_id;
    new.data           := old.data;
    new.tipo           := old.tipo;
    new.quantita       := old.quantita;
    new.riga_ordine_id := old.riga_ordine_id;
  end if;
  new.note := public.pulisci(new.note);

  if tg_op = 'INSERT' and new.riga_ordine_id is not null then
    select r.articolo_id, o.stato into v_articolo, v_stato
      from public.righe_ordine_acquisto r
      join public.ordini_acquisto o on o.id = r.ordine_id
     where r.id = new.riga_ordine_id and r.attivo and o.attivo;
    if not found then
      raise exception 'Riga dell''ordine non trovata.';
    end if;
    if v_stato = 'annullato' then
      raise exception 'L''ordine è annullato: non si registrano arrivi.';
    end if;
    new.articolo_id := v_articolo;
  end if;
  return new;
end;
$$;

-- Dopo un arrivo (o l'annullamento di un arrivo) ricalcola lo stato
-- dell'ordine: tutto arrivato → ricevuto; qualcosa → ricevuto_parziale;
-- niente → inviato. Un ordine annullato non cambia.
create or replace function public.aggiorna_stato_ordine(p_ordine_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_righe     integer;
  v_complete  integer;
  v_qualcosa  boolean;
  v_stato     public.stato_ordine_acquisto;
begin
  select count(*),
         count(*) filter (where coalesce(m.arrivato, 0) >= r.quantita),
         coalesce(bool_or(coalesce(m.arrivato, 0) > 0), false)
    into v_righe, v_complete, v_qualcosa
    from public.righe_ordine_acquisto r
    left join (
      select riga_ordine_id, sum(quantita) as arrivato
        from public.movimenti_magazzino where attivo and riga_ordine_id is not null
       group by riga_ordine_id
    ) m on m.riga_ordine_id = r.id
   where r.ordine_id = p_ordine_id and r.attivo;

  v_stato := case
    when v_righe > 0 and v_complete = v_righe then 'ricevuto'
    when v_qualcosa then 'ricevuto_parziale'
    else 'inviato'
  end;

  update public.ordini_acquisto
     set stato = v_stato
   where id = p_ordine_id and stato <> 'annullato' and stato is distinct from v_stato;
end;
$$;

create or replace function public.dopo_movimento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.riga_ordine_id is not null then
    perform public.aggiorna_stato_ordine(
      (select ordine_id from public.righe_ordine_acquisto where id = new.riga_ordine_id));
  end if;
  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. Trigger (ordine alfabetico: a_… prima, poi b_aggiornamento, z_registro)
-- ---------------------------------------------------------------------
create trigger a_numera before insert on public.ordini_acquisto
  for each row execute function public.numera_ordine_acquisto();
create trigger a_normalizza before insert or update on public.ordini_acquisto
  for each row execute function public.normalizza_ordine_acquisto();
create trigger a_proteggi before update on public.ordini_acquisto
  for each row execute function public.proteggi_ordine_acquisto();
create trigger a_normalizza before insert or update on public.righe_ordine_acquisto
  for each row execute function public.normalizza_riga_ordine();
create trigger a_normalizza before insert or update on public.movimenti_magazzino
  for each row execute function public.normalizza_movimento();
create trigger y_stato_ordine after insert or update on public.movimenti_magazzino
  for each row execute function public.dopo_movimento();

do $$
declare
  t text;
begin
  foreach t in array array['ordini_acquisto', 'righe_ordine_acquisto', 'movimenti_magazzino']
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
  -- Ordini: leggono titolare, ufficio, contabilità; scrivono titolare e ufficio
  foreach t in array array['ordini_acquisto', 'righe_ordine_acquisto']
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

-- Movimenti: li leggono tutti gli utenti attivi (non contengono costi)
alter table public.movimenti_magazzino enable row level security;
revoke all on public.movimenti_magazzino from anon;
create policy "movimenti_magazzino: lettura" on public.movimenti_magazzino
  for select to authenticated
  using ((select public.ruolo_corrente()) is not null);
create policy "movimenti_magazzino: inserimento" on public.movimenti_magazzino
  for insert to authenticated
  with check (
    (select public.ha_ruolo('titolare', 'ufficio'))
    -- gli operai: solo carichi e scarichi, non legati a un ordine, a proprio nome
    or ((select public.ha_ruolo('operaio'))
        and tipo in ('carico', 'scarico')
        and riga_ordine_id is null
        and creato_da = (select auth.uid()))
  );
create policy "movimenti_magazzino: modifica" on public.movimenti_magazzino
  for update to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio')))
  with check ((select public.ha_ruolo('titolare', 'ufficio')));


-- ---------------------------------------------------------------------
-- 9. Viste
-- ---------------------------------------------------------------------

-- Quanto è arrivato di ogni riga d'ordine (security_invoker: regole di chi legge)
create view public.righe_ordine_riepilogo
with (security_invoker = true)
as
select
  r.id as riga_id,
  r.ordine_id,
  r.articolo_id,
  r.quantita,
  coalesce(m.arrivato, 0) as arrivato,
  greatest(r.quantita - coalesce(m.arrivato, 0), 0) as da_ricevere,
  round(r.quantita * r.costo_unitario, 2) as importo
from public.righe_ordine_acquisto r
left join (
  select riga_ordine_id, sum(quantita) as arrivato
    from public.movimenti_magazzino where attivo and riga_ordine_id is not null
   group by riga_ordine_id
) m on m.riga_ordine_id = r.id
where r.attivo;

comment on view public.righe_ordine_riepilogo is 'Per ogni riga d''ordine attiva: quantità arrivata, da ricevere e importo.';

-- Totale di ogni ordine (imponibile, IVA esclusa)
create view public.ordini_acquisto_riepilogo
with (security_invoker = true)
as
select
  o.id as ordine_id,
  count(r.riga_id)                  as righe,
  coalesce(sum(r.importo), 0)       as imponibile,
  coalesce(sum(r.da_ricevere), 0)   as da_ricevere
from public.ordini_acquisto o
left join public.righe_ordine_riepilogo r on r.ordine_id = o.id
group by o.id;

comment on view public.ordini_acquisto_riepilogo is 'Totale (IVA esclusa) e quantità ancora da ricevere di ogni ordine d''acquisto.';

-- Giacenze. Gli operai non leggono il catalogo (che ha i costi), quindi
-- questa vista NON usa security_invoker: legge le tabelle con i permessi
-- del database e mostra solo dati senza prezzi, e solo a chi ha un
-- account attivo (il filtro "where" qui sotto).
create view public.magazzino
as
select
  a.id as articolo_id,
  a.codice,
  a.descrizione,
  c.descrizione as categoria,
  a.categoria_id,
  public.unita_magazzino(a) as unita,
  coalesce(m.giacenza, 0) as giacenza,
  coalesce(o.in_arrivo, 0) as in_arrivo,
  a.scorta_minima,
  (a.scorta_minima is not null and coalesce(m.giacenza, 0) < a.scorta_minima) as sotto_scorta,
  m.ultimo_movimento,
  a.attivo
from public.articoli a
left join public.categorie_merceologiche c on c.id = a.categoria_id
left join (
  select articolo_id, sum(quantita) as giacenza, max(data) as ultimo_movimento
    from public.movimenti_magazzino where attivo
   group by articolo_id
) m on m.articolo_id = a.id
left join (
  select r.articolo_id, sum(greatest(r.quantita - coalesce(x.arrivato, 0), 0)) as in_arrivo
    from public.righe_ordine_acquisto r
    join public.ordini_acquisto oa on oa.id = r.ordine_id
    left join (
      select riga_ordine_id, sum(quantita) as arrivato
        from public.movimenti_magazzino where attivo and riga_ordine_id is not null
       group by riga_ordine_id
    ) x on x.riga_ordine_id = r.id
   where r.attivo and oa.attivo and oa.stato in ('inviato', 'ricevuto_parziale')
   group by r.articolo_id
) o on o.articolo_id = a.id
where (select public.ruolo_corrente()) is not null;

comment on view public.magazzino is 'Giacenza di ogni articolo (somma dei movimenti), quantità in arrivo dagli ordini e avviso sotto scorta. Senza costi: la leggono tutti gli utenti attivi.';

revoke all on public.righe_ordine_riepilogo, public.ordini_acquisto_riepilogo, public.magazzino from anon;
grant select on public.magazzino to authenticated;


-- ---------------------------------------------------------------------
-- 10. salva_ordine_acquisto — salva l'ordine intero "tutto o niente"
--
-- p_ordine: { soggetto_id, data, consegna_prevista, riferimento_fornitore,
--             note_fornitore, note }
-- p_righe:  [{ id (vuoto se nuova), articolo_id, descrizione, quantita, costo_unitario }]
-- L'ordine nell'elenco è l'ordine delle righe. Righe con "id" aggiornate,
-- senza "id" nuove, righe attive non più presenti archiviate.
-- Lo stato NON si cambia da qui (nuovo = bozza).
-- Restituisce l'id dell'ordine.
-- ---------------------------------------------------------------------
create or replace function public.salva_ordine_acquisto(
  p_id      uuid,
  p_ordine  jsonb,
  p_righe   jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id      uuid := p_id;
  v_riga    jsonb;
  v_riga_id uuid;
  v_tenute  uuid[] := '{}';
  v_ordine  integer := 0;
begin
  if v_id is null then
    insert into public.ordini_acquisto (
      soggetto_id, data, consegna_prevista, riferimento_fornitore, note_fornitore, note)
    select r.soggetto_id, coalesce(r.data, current_date), r.consegna_prevista,
           r.riferimento_fornitore, r.note_fornitore, r.note
      from jsonb_populate_record(null::public.ordini_acquisto, p_ordine) r
    returning id into v_id;
  else
    if public.ordine_acquisto_bloccato(v_id) then
      raise exception 'L''ordine è già arrivato o annullato: non si modifica più.';
    end if;
    update public.ordini_acquisto o set (
      soggetto_id, data, consegna_prevista, riferimento_fornitore, note_fornitore, note
    ) = (
      select r.soggetto_id, coalesce(r.data, o.data), r.consegna_prevista,
             r.riferimento_fornitore, r.note_fornitore, r.note
        from jsonb_populate_record(null::public.ordini_acquisto, p_ordine) r
    )
    where o.id = v_id;
    if not found then
      raise exception 'Ordine non trovato o permessi insufficienti.';
    end if;
  end if;

  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]')) loop
    v_ordine := v_ordine + 1;
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.righe_ordine_acquisto (ordine_id, ordine, articolo_id, descrizione, unita_misura, quantita, costo_unitario)
      select v_id, v_ordine, r.articolo_id, r.descrizione, '-', r.quantita, r.costo_unitario
        from jsonb_populate_record(null::public.righe_ordine_acquisto, v_riga - 'id') r
      returning id into v_riga_id;
    else
      v_riga_id := (v_riga ->> 'id')::uuid;
      update public.righe_ordine_acquisto x set
        (ordine, articolo_id, descrizione, quantita, costo_unitario, attivo) = (
          select v_ordine, r.articolo_id, r.descrizione, r.quantita,
                 coalesce(r.costo_unitario, x.costo_unitario), true
            from jsonb_populate_record(null::public.righe_ordine_acquisto, v_riga) r)
       where x.id = v_riga_id and x.ordine_id = v_id;
      if not found then
        raise exception 'Riga dell''ordine non trovata.';
      end if;
    end if;
    v_tenute := v_tenute || v_riga_id;
  end loop;

  update public.righe_ordine_acquisto set attivo = false
   where ordine_id = v_id and attivo and id <> all (v_tenute);

  return v_id;
end;
$$;

revoke execute on function public.salva_ordine_acquisto(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.salva_ordine_acquisto(uuid, jsonb, jsonb) to authenticated;


-- ---------------------------------------------------------------------
-- 11. registra_arrivo — merce arrivata per un ordine
--
-- p_righe: [{ riga_id, quantita }]  (quantità arrivate, > 0; righe a 0 ignorate)
-- Crea un movimento di carico per ogni riga; lo stato dell'ordine si
-- aggiorna da solo (ricevuto / ricevuto_parziale). Si può ricevere anche
-- più di quanto ordinato.
-- ---------------------------------------------------------------------
create or replace function public.registra_arrivo(
  p_ordine_id  uuid,
  p_righe      jsonb,
  p_data       date default current_date,
  p_note       text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_riga   jsonb;
  v_q      numeric;
  v_quante integer := 0;
begin
  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]')) loop
    v_q := coalesce((v_riga ->> 'quantita')::numeric, 0);
    continue when v_q = 0;
    if v_q < 0 then
      raise exception 'Le quantità arrivate non possono essere negative.';
    end if;
    if not exists (
      select 1 from public.righe_ordine_acquisto
       where id = (v_riga ->> 'riga_id')::uuid and ordine_id = p_ordine_id and attivo
    ) then
      raise exception 'Riga dell''ordine non trovata.';
    end if;
    -- articolo_id lo copia il trigger dalla riga dell'ordine
    insert into public.movimenti_magazzino (articolo_id, data, tipo, quantita, riga_ordine_id, note)
    select r.articolo_id, coalesce(p_data, current_date), 'carico', v_q, r.id, p_note
      from public.righe_ordine_acquisto r where r.id = (v_riga ->> 'riga_id')::uuid;
    v_quante := v_quante + 1;
  end loop;

  if v_quante = 0 then
    raise exception 'Indica almeno una quantità arrivata.';
  end if;
  return v_quante;
end;
$$;

revoke execute on function public.registra_arrivo(uuid, jsonb, date, text) from public, anon;
grant execute on function public.registra_arrivo(uuid, jsonb, date, text) to authenticated;
