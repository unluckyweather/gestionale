-- =====================================================================
-- DATI DI PROVA per la sezione Preventivi — SOLO su gestionale-dev.
-- NON è una migrazione: non va mai eseguito su gestionale-prod.
--
-- Crea un cliente "Delta Shop (prova)" e 3 preventivi:
--   1) Insegna luminosa negozio — l'esempio del mockup, in bozza.
--      Risultato atteso: costo 981,58 € · calcolato 1.325,13 € ·
--      prezzo 1.330 € · margine 348,42 € (26,2%) · IVA 292,60 € · totale 1.622,60 €
--   2) Vetrofanie — inviato
--   3) Bandiere a goccia (10 pz) — accettato (non più modificabile)
--
-- Richiede la 0003 già applicata. Si può eseguire più volte: ogni volta
-- crea 3 preventivi nuovi (con numeri nuovi), il cliente lo riusa.
-- =====================================================================
do $$
declare
  v_cliente  uuid;
  v_prev     uuid;
  v_fase     uuid;
  t_grafica  uuid := (select id from public.tariffe_orarie where nome = 'Grafica' and attivo);
  t_lab      uuid := (select id from public.tariffe_orarie where nome = 'Laboratorio' and attivo);
  t_uv       uuid := (select id from public.tariffe_orarie where nome = 'Stampante UV' and attivo);
  t_posa     uuid := (select id from public.tariffe_orarie where nome = 'Posa (trasferta compresa)' and attivo);
begin
  if t_grafica is null or t_lab is null or t_uv is null or t_posa is null then
    raise exception 'Mancano le tariffe iniziali della 0003 (Grafica, Laboratorio, Stampante UV, Posa).';
  end if;

  -- cliente di prova
  select id into v_cliente from public.soggetti where ragione_sociale = 'Delta Shop (prova)' and attivo limit 1;
  if v_cliente is null then
    insert into public.soggetti (tipo, forma, ragione_sociale, nome_breve, comune, provincia)
    values ('cliente', 'azienda', 'Delta Shop (prova)', 'DELTA', 'Padova', 'PD')
    returning id into v_cliente;
  end if;

  -- ---------- 1) Insegna luminosa negozio (esempio del mockup) ----------
  -- I costi sono scritti nelle righe, così il risultato non dipende dalle tariffe attuali.
  insert into public.preventivi (soggetto_id, oggetto, ricarico_percentuale, prezzo_cliente)
  values (v_cliente, 'Insegna luminosa negozio', 35, 1330)
  returning id into v_prev;

  insert into public.fasi_preventivo (preventivo_id, ordine, titolo, descrizione_cliente)
  values (v_prev, 1, 'Grafica e impaginazione', 'Progetto grafico e impaginazione dell''insegna')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, costo_orario) values (v_fase, 1, t_grafica, 2, 45);

  insert into public.fasi_preventivo (preventivo_id, ordine, titolo, descrizione_cliente)
  values (v_prev, 2, 'Stampa', 'Stampa UV su vinile')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, costo_orario) values (v_fase, 1, t_uv, 1.5, 60);
  -- bobina: 1,37 m × 2 ml = 2,74 m² × 17 € = 46,58 €
  insert into public.materiali_fase (fase_id, ordine, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario)
  values (v_fase, 1, 'Vinile adesivo (prova)', 'm2', 1.37, 2, 0, 17);

  insert into public.fasi_preventivo (preventivo_id, ordine, titolo, descrizione_cliente)
  values (v_prev, 3, 'Taglio e montaggio', 'Taglio, assemblaggio e cablaggio LED')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, persone, costo_orario) values (v_fase, 1, t_lab, 4, 1, 38);
  insert into public.materiali_fase (fase_id, ordine, descrizione, unita_misura, quantita, costo_unitario) values
    (v_fase, 2, 'Lastra plexiglass (prova)', 'lastra', 1, 187),
    (v_fase, 3, 'Kit LED (prova)', 'pz', 1, 80);

  insert into public.fasi_preventivo (preventivo_id, ordine, titolo, descrizione_cliente)
  values (v_prev, 4, 'Posa in loco', 'Installazione presso il negozio')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, persone, costo_orario) values (v_fase, 1, t_posa, 8, 2, 42);

  -- ---------- 2) Vetrofanie — inviato ----------
  insert into public.preventivi (soggetto_id, oggetto) values (v_cliente, 'Vetrofanie')
  returning id into v_prev;
  insert into public.fasi_preventivo (preventivo_id, ordine, titolo) values (v_prev, 1, 'Stampa e taglio')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, costo_orario) values (v_fase, 1, t_uv, 3, 60);
  update public.preventivi set stato = 'inviato' where id = v_prev;

  -- ---------- 3) Bandiere a goccia — accettato ----------
  insert into public.preventivi (soggetto_id, oggetto, ricarico_percentuale) values (v_cliente, 'Bandiere a goccia (10 pz)', 40)
  returning id into v_prev;
  insert into public.fasi_preventivo (preventivo_id, ordine, titolo) values (v_prev, 1, 'Stampa')
  returning id into v_fase;
  insert into public.ore_fase (fase_id, ordine, tariffa_id, ore, costo_orario) values (v_fase, 1, t_uv, 2, 60);
  insert into public.materiali_fase (fase_id, ordine, descrizione, unita_misura, quantita, costo_unitario)
  values (v_fase, 2, 'Bandiera a goccia con asta (prova)', 'pz', 10, 28);
  update public.preventivi set stato = 'accettato' where id = v_prev;
end;
$$;

-- Controllo: deve mostrare 981.58 · 1325.13 · 1330.00 · 348.42 · 26.2 · 292.60 · 1622.60
select p.numero, p.oggetto, p.stato,
       r.costo_totale, r.prezzo_calcolato, r.prezzo, r.margine, r.margine_percentuale, r.iva, r.totale
  from public.preventivi p
  join public.preventivi_riepilogo r on r.preventivo_id = p.id
 order by p.anno desc, p.progressivo desc
 limit 3;
