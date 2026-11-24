-- =====================================================================
-- 0009_multi_azienda.sql
-- Predisposizione multi-azienda (SCHEMA-DATABASE.md, sezione 0).
--
-- Lo stesso database potrà servire più aziende clienti. Ogni riga con
-- dati aziendali ha "azienda_id" e ogni utente vede e modifica SOLO le
-- righe della propria azienda (profili.azienda_id).
--
-- In breve:
--   1. "azienda" diventa l'elenco delle aziende (via il vincolo "una sola")
--   2. azienda_id in tutte le tabelle, riempito con l'azienda di oggi
--   3. azienda_corrente(): l'azienda dell'utente collegato
--   4. vincoli unici e numeratori per azienda
--   5. trigger a0_azienda: righe figlie e collegamenti della stessa azienda
--   6. utenti: nuovi profili nell'azienda più vecchia, azienda non modificabile
--   7. registro modifiche con azienda
--   8. regole RLS "restrittive": stessa azienda, oltre al ruolo
--   9. vista magazzino filtrata per azienda
--  10. crea_azienda(): nuova azienda con i dati iniziali
--
-- Si esegue UNA volta per database, dopo la 0008.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. azienda: da "una sola riga" a elenco delle aziende
-- ---------------------------------------------------------------------
alter table public.azienda drop constraint azienda_una_sola;
alter table public.azienda drop column unica;

comment on table public.azienda is
  'Aziende che usano il gestionale (dati per l''intestazione dei documenti). Ogni utente appartiene a una sola azienda.';

-- se i dati dell'azienda non sono mai stati compilati, si crea la riga
-- dell'azienda di oggi (il titolare la completa in Impostazioni)
insert into public.azienda (ragione_sociale)
select 'La mia azienda'
 where not exists (select 1 from public.azienda);


-- ---------------------------------------------------------------------
-- 2. azienda_id in tutte le tabelle con dati aziendali
--
-- Trucco: la colonna nasce con un valore predefinito FISSO (l'id
-- dell'azienda di oggi). Postgres lo scrive in tutte le righe esistenti
-- senza "modificarle" una per una, quindi non partono i trigger (registro,
-- protezioni dei preventivi accettati, movimenti non modificabili…).
-- Subito dopo il valore predefinito diventa azienda_corrente().
-- ---------------------------------------------------------------------
do $$
declare
  v_azienda uuid;
  t text;
begin
  select id into v_azienda from public.azienda order by creato_il, id limit 1;

  foreach t in array array[
    'profili', 'dipendenti', 'registro_modifiche',
    'codici_iva', 'condizioni_pagamento', 'banche_aziendali', 'categorie_merceologiche',
    'soggetti', 'contatti_soggetto', 'sedi_soggetto', 'dichiarazioni_intento', 'fornitori_categorie',
    'articoli',
    'numeratori', 'tariffe_orarie', 'modelli_lavorazione',
    'preventivi', 'fasi_preventivo', 'ore_fase', 'materiali_fase',
    'ordini_acquisto', 'righe_ordine_acquisto', 'movimenti_magazzino'
  ] loop
    execute format(
      'alter table public.%I add column azienda_id uuid not null default %L references public.azienda (id)',
      t, v_azienda);
    execute format('create index %I on public.%I (azienda_id)', t || '_azienda_idx', t);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. azienda_corrente() — l'azienda dell'utente collegato
--    "security definer" come ruolo_corrente(): legge profili anche dove
--    le regole RLS non lo permetterebbero. Null se non collegato.
-- ---------------------------------------------------------------------
create or replace function public.azienda_corrente()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select azienda_id from public.profili where id = auth.uid();
$$;

revoke execute on function public.azienda_corrente() from public, anon;
grant execute on function public.azienda_corrente() to authenticated;

-- Il ruolo vale solo se anche l'azienda è attiva: azienda.attivo = false
-- "spegne" tutti i suoi utenti (vedono «account non attivo»).
create or replace function public.ruolo_corrente()
returns public.ruolo_utente
language sql
stable
security definer
set search_path = ''
as $$
  select p.ruolo
    from public.profili p
    join public.azienda a on a.id = p.azienda_id
   where p.id = auth.uid() and p.attivo and a.attivo;
$$;

-- Le righe nuove prendono da sole l'azienda di chi le crea.
-- (profili: la sceglie il trigger al_nuovo_utente; registro: registra_modifica.)
do $$
declare
  t text;
begin
  foreach t in array array[
    'dipendenti',
    'codici_iva', 'condizioni_pagamento', 'banche_aziendali', 'categorie_merceologiche',
    'soggetti', 'contatti_soggetto', 'sedi_soggetto', 'dichiarazioni_intento', 'fornitori_categorie',
    'articoli',
    'tariffe_orarie', 'modelli_lavorazione',
    'preventivi', 'fasi_preventivo', 'ore_fase', 'materiali_fase',
    'ordini_acquisto', 'righe_ordine_acquisto', 'movimenti_magazzino'
  ] loop
    execute format('alter table public.%I alter column azienda_id set default public.azienda_corrente()', t);
  end loop;
end;
$$;

alter table public.profili            alter column azienda_id drop default;
alter table public.registro_modifiche alter column azienda_id drop default;
alter table public.numeratori         alter column azienda_id drop default;


-- ---------------------------------------------------------------------
-- 4. Vincoli unici e numeratori per azienda
--    (due aziende possono avere lo stesso cliente, lo stesso codice
--    articolo e ognuna il suo preventivo 1/26)
-- ---------------------------------------------------------------------
drop index public.codici_iva_codice_unico;
create unique index codici_iva_codice_unico
  on public.codici_iva (azienda_id, lower(btrim(codice))) where attivo;

drop index public.condizioni_pagamento_descrizione_unica;
create unique index condizioni_pagamento_descrizione_unica
  on public.condizioni_pagamento (azienda_id, lower(btrim(descrizione))) where attivo;

drop index public.banche_aziendali_nome_unico;
create unique index banche_aziendali_nome_unico
  on public.banche_aziendali (azienda_id, lower(btrim(nome))) where attivo;

drop index public.categorie_merceologiche_descrizione_unica;
create unique index categorie_merceologiche_descrizione_unica
  on public.categorie_merceologiche (azienda_id, lower(btrim(descrizione))) where attivo;

drop index public.soggetti_partita_iva_unica;
create unique index soggetti_partita_iva_unica
  on public.soggetti (azienda_id, paese_iva, partita_iva) where attivo and partita_iva is not null;

drop index public.dichiarazioni_intento_protocollo_unico;
create unique index dichiarazioni_intento_protocollo_unico
  on public.dichiarazioni_intento (azienda_id, protocollo) where attivo;

drop index public.articoli_codice_unico;
create unique index articoli_codice_unico
  on public.articoli (azienda_id, lower(codice)) where attivo and codice is not null;

drop index public.tariffe_orarie_nome_unico;
create unique index tariffe_orarie_nome_unico
  on public.tariffe_orarie (azienda_id, lower(btrim(nome))) where attivo;

drop index public.modelli_lavorazione_nome_unico;
create unique index modelli_lavorazione_nome_unico
  on public.modelli_lavorazione (azienda_id, lower(btrim(nome))) where attivo;

alter table public.preventivi drop constraint preventivi_numero_unico;
alter table public.preventivi
  add constraint preventivi_numero_unico unique (azienda_id, anno, progressivo);

alter table public.ordini_acquisto drop constraint ordini_acquisto_numero_unico;
alter table public.ordini_acquisto
  add constraint ordini_acquisto_numero_unico unique (azienda_id, anno, progressivo);

alter table public.numeratori drop constraint numeratori_pkey;
alter table public.numeratori add primary key (azienda_id, documento, anno);

comment on table public.numeratori is
  'Ultimo numero usato per azienda, documento e anno (preventivi, ordini d''acquisto, commesse…). Lo aggiorna solo il database.';

-- Prossimo numero dell'azienda indicata.
-- Per partire da un altro numero, una volta dal SQL Editor:
--   insert into numeratori (azienda_id, documento, anno, ultimo)
--   values ('<id azienda>', 'preventivo', 2026, 113)
--   on conflict (azienda_id, documento, anno) do update set ultimo = excluded.ultimo;
drop function public.prossimo_numero(text, smallint);

create or replace function public.prossimo_numero(p_azienda_id uuid, p_documento text, p_anno smallint)
returns integer
language sql
security definer
set search_path = ''
as $$
  insert into public.numeratori as n (azienda_id, documento, anno, ultimo)
  values (p_azienda_id, p_documento, p_anno, 1)
  on conflict (azienda_id, documento, anno) do update set ultimo = n.ultimo + 1
  returning n.ultimo;
$$;

revoke execute on function public.prossimo_numero(uuid, text, smallint) from public, anon, authenticated;

-- (i trigger a_numera partono dopo a0_azienda: azienda_id è già compilato)
create or replace function public.numera_preventivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.anno        := extract(year from new.data)::smallint;
  new.progressivo := public.prossimo_numero(new.azienda_id, 'preventivo', new.anno);
  return new;
end;
$$;

create or replace function public.numera_ordine_acquisto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.anno        := extract(year from new.data)::smallint;
  new.progressivo := public.prossimo_numero(new.azienda_id, 'ordine_acquisto', new.anno);
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. a0_azienda — righe figlie e collegamenti della stessa azienda
--
-- Argomenti del trigger: coppie 'colonna:tabella' (es. 'soggetto_id:soggetti').
-- Per ogni collegamento compilato:
--   - se azienda_id è ancora vuoto (es. riga inserita dal SQL Editor)
--     lo COPIA dalla riga collegata (il padre è il primo della lista);
--   - se è diverso, ERRORE: non si collega un dato di un'altra azienda.
-- Inoltre azienda_id non si cambia dopo la creazione.
-- "security definer": deve leggere l'azienda della riga collegata anche
-- se l'utente non la vede (è proprio il caso da bloccare).
-- Il nome "a0_" lo fa partire prima di tutti i trigger "a_…".
-- ---------------------------------------------------------------------
create or replace function public.allinea_azienda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_riga        jsonb := to_jsonb(new);
  v_collegamento text;
  v_colonna     text;
  v_tabella     text;
  v_id          uuid;
  v_azienda     uuid;
begin
  if tg_op = 'UPDATE' and new.azienda_id is distinct from old.azienda_id then
    raise exception 'Una riga non può passare a un''altra azienda.';
  end if;

  -- (tg_argv è vuoto, cioè null, quando il trigger non ha collegamenti)
  foreach v_collegamento in array coalesce(tg_argv, '{}') loop
    v_colonna := split_part(v_collegamento, ':', 1);
    v_tabella := split_part(v_collegamento, ':', 2);
    v_id      := (v_riga ->> v_colonna)::uuid;
    continue when v_id is null;

    execute format('select azienda_id from public.%I where id = $1', v_tabella)
       into v_azienda using v_id;
    continue when v_azienda is null;   -- riga inesistente: ci pensa la foreign key

    if new.azienda_id is null then
      new.azienda_id := v_azienda;
    elsif new.azienda_id <> v_azienda then
      raise exception 'Collegamento non valido: % appartiene a un''altra azienda.', v_colonna;
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.allinea_azienda() from public, anon, authenticated;

create trigger a0_azienda before insert or update on public.dipendenti
  for each row execute function public.allinea_azienda('profilo_id:profili');

create trigger a0_azienda before insert or update on public.codici_iva
  for each row execute function public.allinea_azienda();
create trigger a0_azienda before insert or update on public.condizioni_pagamento
  for each row execute function public.allinea_azienda();
create trigger a0_azienda before insert or update on public.banche_aziendali
  for each row execute function public.allinea_azienda();
create trigger a0_azienda before insert or update on public.categorie_merceologiche
  for each row execute function public.allinea_azienda();
create trigger a0_azienda before insert or update on public.tariffe_orarie
  for each row execute function public.allinea_azienda();
create trigger a0_azienda before insert or update on public.modelli_lavorazione
  for each row execute function public.allinea_azienda();

create trigger a0_azienda before insert or update on public.soggetti
  for each row execute function public.allinea_azienda(
    'codice_iva_abituale_id:codici_iva', 'banca_aziendale_id:banche_aziendali',
    'condizione_pagamento_id:condizioni_pagamento', 'rc_codice_iva_id:codici_iva');
create trigger a0_azienda before insert or update on public.contatti_soggetto
  for each row execute function public.allinea_azienda('soggetto_id:soggetti');
create trigger a0_azienda before insert or update on public.sedi_soggetto
  for each row execute function public.allinea_azienda('soggetto_id:soggetti');
create trigger a0_azienda before insert or update on public.dichiarazioni_intento
  for each row execute function public.allinea_azienda('soggetto_id:soggetti');
create trigger a0_azienda before insert or update on public.fornitori_categorie
  for each row execute function public.allinea_azienda(
    'soggetto_id:soggetti', 'categoria_id:categorie_merceologiche');
create trigger a0_azienda before insert or update on public.articoli
  for each row execute function public.allinea_azienda(
    'codice_iva_id:codici_iva', 'fornitore_id:soggetti', 'categoria_id:categorie_merceologiche');

create trigger a0_azienda before insert or update on public.preventivi
  for each row execute function public.allinea_azienda(
    'soggetto_id:soggetti', 'modello_id:modelli_lavorazione', 'codice_iva_id:codici_iva');
create trigger a0_azienda before insert or update on public.fasi_preventivo
  for each row execute function public.allinea_azienda(
    'preventivo_id:preventivi', 'modello_id:modelli_lavorazione');
create trigger a0_azienda before insert or update on public.ore_fase
  for each row execute function public.allinea_azienda(
    'fase_id:fasi_preventivo', 'tariffa_id:tariffe_orarie');
create trigger a0_azienda before insert or update on public.materiali_fase
  for each row execute function public.allinea_azienda(
    'fase_id:fasi_preventivo', 'articolo_id:articoli');

create trigger a0_azienda before insert or update on public.ordini_acquisto
  for each row execute function public.allinea_azienda('soggetto_id:soggetti');
create trigger a0_azienda before insert or update on public.righe_ordine_acquisto
  for each row execute function public.allinea_azienda(
    'ordine_id:ordini_acquisto', 'articolo_id:articoli');
create trigger a0_azienda before insert or update on public.movimenti_magazzino
  for each row execute function public.allinea_azienda(
    'articolo_id:articoli', 'riga_ordine_id:righe_ordine_acquisto');

-- Le ricerche "per codice" dentro i trigger cercano nell'azienda della riga
-- (le altre cercano per id, già controllato da a0_azienda).
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
  -- codice IVA non indicato: si propone il "22" della stessa azienda
  if new.codice_iva_id is null then
    select c.id into new.codice_iva_id
      from public.codici_iva c
     where c.codice = '22' and c.attivo and c.azienda_id = new.azienda_id
     limit 1;
  end if;
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
      from public.codici_iva c
     where c.codice = '22' and c.attivo and c.azienda_id = new.azienda_id
     limit 1;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. Utenti
-- ---------------------------------------------------------------------

-- Nuovo utente: per ora va nell'azienda più vecchia (oggi l'unica),
-- disattivato e operaio come prima. Per un'altra azienda: crea_azienda().
create or replace function public.crea_profilo_nuovo_utente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
begin
  select id into v_azienda from public.azienda order by creato_il, id limit 1;

  insert into public.profili (id, email, nome_visualizzato, azienda_id)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    v_azienda
  );
  return new;
end;
$$;

-- Protezioni del profilo: come prima (ruolo e attivazione propri) e in più
-- l'azienda non si cambia dall'app, né la propria né quella degli altri.
-- Solo dal SQL Editor (lì non c'è un utente collegato: auth.uid() è vuoto).
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
  if new.azienda_id <> old.azienda_id and auth.uid() is not null then
    raise exception 'L''azienda di un utente non si può cambiare dall''app.';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 7. registro_modifiche: ogni riga sa di quale azienda è
-- ---------------------------------------------------------------------
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

  insert into public.registro_modifiche (tabella, record_id, azione, autore, prima, dopo, azienda_id)
  values (
    tg_table_name, (v_dopo ->> 'id')::uuid, v_azione, auth.uid(), v_prima, v_dopo,
    -- la tabella "azienda" non ha azienda_id: è l'azienda stessa
    coalesce(v_dopo ->> 'azienda_id', case when tg_table_name = 'azienda' then v_dopo ->> 'id' end)::uuid
  );
  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. Regole RLS: stessa azienda, OLTRE al ruolo
--
-- Una regola "restrictive" si mette in "E" con quelle che esistono già
-- (che restano identiche): per vedere o scrivere una riga servono il
-- ruolo giusto E la stessa azienda.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profili', 'dipendenti', 'registro_modifiche',
    'codici_iva', 'condizioni_pagamento', 'banche_aziendali', 'categorie_merceologiche',
    'soggetti', 'contatti_soggetto', 'sedi_soggetto', 'dichiarazioni_intento', 'fornitori_categorie',
    'articoli',
    'numeratori', 'tariffe_orarie', 'modelli_lavorazione',
    'preventivi', 'fasi_preventivo', 'ore_fase', 'materiali_fase',
    'ordini_acquisto', 'righe_ordine_acquisto', 'movimenti_magazzino'
  ] loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated
         using (azienda_id = (select public.azienda_corrente()))
         with check (azienda_id = (select public.azienda_corrente()))',
      t || ': stessa azienda', t);
  end loop;
end;
$$;

create policy "azienda: stessa azienda" on public.azienda
  as restrictive for all to authenticated
  using (id = (select public.azienda_corrente()))
  with check (id = (select public.azienda_corrente()));

-- le aziende nuove si creano solo con crea_azienda() dal SQL Editor
drop policy "azienda: inserimento" on public.azienda;


-- ---------------------------------------------------------------------
-- 9. Vista magazzino: non usa le regole RLS (gli operai non leggono
--    "articoli"), quindi il filtro per azienda va scritto qui.
-- ---------------------------------------------------------------------
create or replace view public.magazzino
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
where (select public.ruolo_corrente()) is not null
  and a.azienda_id = (select public.azienda_corrente());


-- ---------------------------------------------------------------------
-- 10. crea_azienda() — nuova azienda con i dati iniziali
--
-- Solo dal SQL Editor (gli utenti dell'app non la possono eseguire):
--   select public.crea_azienda('Rossi Insegne srl', 'titolare@rossi.it');
-- Copia codici IVA, condizioni di pagamento e tariffe orarie d'esempio
-- (gli stessi delle migrazioni 0002 e 0003). Se si indica l'email di un
-- utente già creato su Supabase (Authentication → Add user), lo sposta
-- nella nuova azienda come titolare attivo. Restituisce l'id dell'azienda.
-- ---------------------------------------------------------------------
create or replace function public.crea_azienda(p_ragione_sociale text, p_email_titolare text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_azienda uuid;
  v_profilo uuid;
begin
  if p_email_titolare is not null then
    select id into v_profilo from public.profili where lower(email) = lower(btrim(p_email_titolare));
    if v_profilo is null then
      raise exception 'Nessun utente con email %: crealo prima in Authentication → Users.', p_email_titolare;
    end if;
    if exists (select 1 from public.dipendenti where profilo_id = v_profilo) then
      raise exception 'L''utente % è già collegato a un dipendente: non si può spostare.', p_email_titolare;
    end if;
  end if;

  insert into public.azienda (ragione_sociale) values (p_ragione_sociale)
  returning id into v_azienda;

  insert into public.codici_iva (azienda_id, codice, descrizione, aliquota, natura) values
    (v_azienda, '22',   'Aliquota ordinaria',                         22, null),
    (v_azienda, '10',   'Aliquota ridotta 10%',                       10, null),
    (v_azienda, '5',    'Aliquota ridotta 5%',                         5, null),
    (v_azienda, '4',    'Aliquota minima 4%',                          4, null),
    (v_azienda, 'N3.1', 'Non imponibile, esportazione',                0, 'N3.1'),
    (v_azienda, 'N3.5', 'Non imponibile, dichiarazione d''intento',    0, 'N3.5'),
    (v_azienda, 'N6.9', 'Inversione contabile (reverse charge), altri casi', 0, 'N6.9');

  insert into public.condizioni_pagamento (azienda_id, descrizione, giorni) values
    (v_azienda, 'Rimessa diretta', 0),
    (v_azienda, 'Bonifico 30 gg', 30),
    (v_azienda, 'Bonifico 60 gg', 60);

  insert into public.tariffe_orarie (azienda_id, nome, tipo, costo_orario, note) values
    (v_azienda, 'Grafica',                   'persona',  45, 'Costo d''esempio: da correggere'),
    (v_azienda, 'Laboratorio',               'persona',  38, 'Costo d''esempio: da correggere'),
    (v_azienda, 'Stampante UV',              'macchina', 60, 'Costo d''esempio: da correggere'),
    (v_azienda, 'Posa (trasferta compresa)', 'posa',     42, 'Costo d''esempio: da correggere');

  if v_profilo is not null then
    update public.profili
       set azienda_id = v_azienda, ruolo = 'titolare', attivo = true
     where id = v_profilo;
  end if;

  return v_azienda;
end;
$$;

revoke execute on function public.crea_azienda(text, text) from public, anon, authenticated;
