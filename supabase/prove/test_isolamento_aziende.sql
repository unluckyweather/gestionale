-- Test isolamento multi-azienda (SOLO gestionale-dev): l'utente titolare@nuova.it (azienda B)
-- contro i dati dell'azienda A. Si incolla nel SQL Editor; crea righe di prova nell'azienda B.
-- (tutto lo script è una sola transazione: niente begin/commit)
create temp table esito (n serial, prova text, risultato text) on commit drop;
create temp table rif on commit drop as
with a as (select id from public.azienda order by creato_il limit 1)
select
  (select id from public.profili where email = 'titolare@nuova.it') as utente_b,
  (select azienda_id from public.profili where email = 'titolare@nuova.it') as azienda_b,
  (select id from a) as azienda_a,
  (select id from public.profili where ruolo = 'titolare' and azienda_id = (select id from a) limit 1) as profilo_a,
  (select id from public.soggetti where tipo in ('cliente','entrambi') and attivo and azienda_id = (select id from a) limit 1) as cliente_a,
  (select partita_iva from public.soggetti where tipo in ('cliente','entrambi') and attivo and partita_iva is not null and azienda_id = (select id from a) limit 1) as piva_a,
  (select id from public.soggetti where tipo in ('fornitore','entrambi') and attivo and azienda_id = (select id from a) limit 1) as fornitore_a,
  (select id from public.articoli where attivo and azienda_id = (select id from a) limit 1) as articolo_a,
  (select id from public.preventivi where stato in ('bozza','inviato') and attivo and azienda_id = (select id from a) limit 1) as preventivo_a,
  (select o.id from public.ordini_acquisto o where o.stato in ('bozza','inviato','ricevuto_parziale') and o.azienda_id = (select id from a)
     and exists (select 1 from public.righe_ordine_acquisto r where r.ordine_id = o.id and r.attivo) limit 1) as ordine_a,
  (select id from public.tariffe_orarie where attivo and azienda_id = (select id from a) limit 1) as tariffa_a;
alter table rif add column riga_a uuid;
update rif set riga_a = (select id from public.righe_ordine_acquisto where ordine_id = rif.ordine_a and attivo limit 1);
grant all on esito, rif to authenticated;
grant usage on sequence esito_n_seq to authenticated;

-- quante righe ci sono in tutto (visto dal SQL Editor, senza regole)
insert into esito (prova, risultato)
select '0. TOTALI nel database', format('aziende %s, soggetti %s, articoli %s, preventivi %s, ordini %s, movimenti %s',
  (select count(*) from public.azienda), (select count(*) from public.soggetti), (select count(*) from public.articoli),
  (select count(*) from public.preventivi), (select count(*) from public.ordini_acquisto),
  (select count(*) from public.movimenti_magazzino));
insert into esito (prova, risultato)
select '0. dati di A usati nelle prove', format('cliente %s, fornitore %s, articolo %s, preventivo %s, ordine %s, riga %s, tariffa %s, piva %s',
  cliente_a is not null, fornitore_a is not null, articolo_a is not null, preventivo_a is not null,
  ordine_a is not null, riga_a is not null, tariffa_a is not null, piva_a is not null) from rif;

-- da qui in poi: come l'utente B collegato all'app
select set_config('request.jwt.claims', json_build_object('sub', utente_b, 'role', 'authenticated')::text, true),
       set_config('request.jwt.claim.sub', utente_b::text, true)
  from rif;
set local role authenticated;

insert into esito (prova, risultato)
select '1. B: chi sono', format('ruolo %s, sono nell''azienda B: %s', public.ruolo_corrente(), public.azienda_corrente() = azienda_b) from rif;

-- 2. cosa vede B (scheda per scheda)
do $$
declare
  t text;
  v bigint;
begin
  foreach t in array array[
    'azienda', 'profili', 'dipendenti', 'registro_modifiche',
    'soggetti', 'contatti_soggetto', 'sedi_soggetto', 'dichiarazioni_intento', 'fornitori_categorie',
    'articoli', 'categorie_merceologiche', 'codici_iva', 'condizioni_pagamento', 'banche_aziendali',
    'tariffe_orarie', 'modelli_lavorazione', 'preventivi', 'fasi_preventivo', 'ore_fase', 'materiali_fase',
    'preventivi_riepilogo', 'fasi_riepilogo',
    'magazzino', 'ordini_acquisto', 'righe_ordine_acquisto', 'movimenti_magazzino',
    'ordini_acquisto_riepilogo', 'righe_ordine_riepilogo', 'numeratori'
  ] loop
    begin
      execute format('select count(*) from public.%I', t) into v;
      insert into pg_temp.esito (prova, risultato) values ('2. B vede ' || t, v || ' righe');
    exception when others then
      insert into pg_temp.esito (prova, risultato) values ('2. B vede ' || t, 'accesso negato (' || sqlerrm || ')');
    end;
  end loop;

  insert into pg_temp.esito (prova, risultato)
  select '2. registro: righe non di B', count(*)::text
    from public.registro_modifiche, pg_temp.rif where registro_modifiche.azienda_id <> rif.azienda_b;
  insert into pg_temp.esito (prova, risultato)
  select '2. azienda visibile', string_agg(ragione_sociale, ', ') from public.azienda;
end;
$$;

-- 3. cosa B NON deve poter fare sui dati di A
do $$
declare
  r pg_temp.rif;
  p record;
  n bigint;
begin
  select * into r from pg_temp.rif;
  for p in
    select * from (values
      ('modifica il cliente di A',            format('update public.soggetti set note_interne = ''prova B'' where id = %L', r.cliente_a)),
      ('modifica i dati dell''azienda A',      format('update public.azienda set telefono = ''000'' where id = %L', r.azienda_a)),
      ('modifica il profilo del titolare A',  format('update public.profili set nome_visualizzato = ''x'' where id = %L', r.profilo_a)),
      ('modifica il preventivo di A',         format('update public.preventivi set oggetto = ''x'' where id = %L', r.preventivo_a)),
      ('archivia l''articolo di A',           format('update public.articoli set attivo = false where id = %L', r.articolo_a)),
      ('modifica le tariffe di A',            format('update public.tariffe_orarie set costo_orario = 1 where id = %L', r.tariffa_a)),
      ('annulla i movimenti di A',            format('update public.movimenti_magazzino set attivo = false where articolo_id = %L', r.articolo_a)),
      ('articolo con azienda_id di A',        format('insert into public.articoli (azienda_id, descrizione) values (%L, ''x'')', r.azienda_a)),
      ('preventivo per il cliente di A',      format('select public.salva_preventivo(null, %L::jsonb, ''[]'')', json_build_object('soggetto_id', r.cliente_a, 'oggetto', 'x'))),
      ('salva_preventivo sul preventivo di A',format('select public.salva_preventivo(%L, %L::jsonb, ''[]'')', r.preventivo_a, json_build_object('soggetto_id', r.cliente_a, 'oggetto', 'x'))),
      ('duplica: fasi nel preventivo di A',   format('insert into public.fasi_preventivo (preventivo_id, ordine, titolo) values (%L, 99, ''x'')', r.preventivo_a)),
      ('salva_modello con l''articolo di A',  format('select public.salva_modello(null, ''{"nome":"x B"}''::jsonb, %L::jsonb)', json_build_array(json_build_object('titolo','x','materiali', json_build_array(json_build_object('articolo_id', r.articolo_a, 'quantita', 1)))))),
      ('salva_modello con la tariffa di A',   format('select public.salva_modello(null, ''{"nome":"y B"}''::jsonb, %L::jsonb)', json_build_array(json_build_object('titolo','x','ore', json_build_array(json_build_object('tariffa_id', r.tariffa_a, 'ore', 1)))))),
      ('contatto sul cliente di A',           format('insert into public.contatti_soggetto (soggetto_id, persona) values (%L, ''x'')', r.cliente_a)),
      ('salva_soggetto sul cliente di A',     format('select public.salva_soggetto(%L, ''{"ragione_sociale":"x"}''::jsonb)', r.cliente_a)),
      ('ordine al fornitore di A',            format('select public.salva_ordine_acquisto(null, %L::jsonb, ''[]'')', json_build_object('soggetto_id', r.fornitore_a))),
      ('registra_arrivo sull''ordine di A',   format('select public.registra_arrivo(%L, %L::jsonb)', r.ordine_a, json_build_array(json_build_object('riga_id', r.riga_a, 'quantita', 1)))),
      ('carico sull''articolo di A',          format('insert into public.movimenti_magazzino (articolo_id, tipo, quantita) values (%L, ''carico'', 1)', r.articolo_a)),
      ('B si sposta nell''azienda A',         format('update public.profili set azienda_id = %L where id = %L', r.azienda_a, r.utente_b)),
      ('dipendente col profilo di A',         format('insert into public.dipendenti (nome, cognome, profilo_id) values (''x'', ''y'', %L)', r.profilo_a)),
      ('crea un''altra azienda dall''app',    'insert into public.azienda (ragione_sociale) values (''x'')'),
      ('usa crea_azienda dall''app',          'select public.crea_azienda(''x'')'),
      ('usa prossimo_numero dall''app',       format('select public.prossimo_numero(%L, ''preventivo'', 2026::smallint)', r.azienda_a))
    ) as t(prova, istruzione)
  loop
    begin
      execute p.istruzione;
      get diagnostics n = row_count;
      insert into pg_temp.esito (prova, risultato)
      values ('3. ' || p.prova, case when n = 0 then 'OK: nessuna riga toccata' else 'ATTENZIONE: riuscito (' || n || ' righe)' end);
    exception when others then
      insert into pg_temp.esito (prova, risultato) values ('3. ' || p.prova, 'OK rifiutato: ' || sqlerrm);
    end;
  end loop;
end;
$$;

-- 4. B lavora per conto suo (righe di prova nell'azienda B)
do $$
declare
  r pg_temp.rif;
  v_cliente uuid;
  v_articolo uuid;
  v_tariffa uuid;
  v_prev uuid;
  v_num text;
  v_iva text;
begin
  select * into r from pg_temp.rif;
  v_cliente := public.salva_soggetto(null, json_build_object('tipo','cliente','ragione_sociale','Cliente di prova B','partita_iva', r.piva_a)::jsonb);
  insert into pg_temp.esito (prova, risultato) values ('4. cliente B con la stessa P.IVA di un cliente A', 'OK');
  insert into public.articoli (descrizione, unita_misura, costo_unitario) values ('Articolo di prova B', 'pz', 1) returning id into v_articolo;
  select id into v_tariffa from public.tariffe_orarie order by nome limit 1;
  v_prev := public.salva_preventivo(null, json_build_object('soggetto_id', v_cliente, 'oggetto', 'Preventivo di prova B')::jsonb,
    json_build_array(json_build_object('titolo','Stampa','ore', json_build_array(json_build_object('tariffa_id', v_tariffa, 'ore', 2)),
                                       'materiali', json_build_array(json_build_object('articolo_id', v_articolo, 'quantita', 3))))::jsonb);
  select p.numero, c.codice into v_num, v_iva from public.preventivi p join public.codici_iva c on c.id = p.codice_iva_id where p.id = v_prev;
  insert into pg_temp.esito (prova, risultato) values ('4. primo preventivo di B', 'numero ' || v_num || ', IVA ' || v_iva);
  insert into pg_temp.esito (prova, risultato)
  select '4. riepilogo preventivo B', format('costo %s, prezzo %s', costo_totale, prezzo) from public.preventivi_riepilogo where preventivo_id = v_prev;
exception when others then
  insert into pg_temp.esito (prova, risultato) values ('4. ERRORE', sqlerrm);
end;
$$;

reset role;
insert into esito (prova, risultato)
select '5. dopo il test: dati di A cambiati?', format('soggetti A %s, articoli A %s, preventivi A %s',
  (select count(*) from public.soggetti where azienda_id = rif.azienda_a),
  (select count(*) from public.articoli where azienda_id = rif.azienda_a),
  (select count(*) from public.preventivi where azienda_id = rif.azienda_a)) from rif;

select prova, risultato from esito order by n;
