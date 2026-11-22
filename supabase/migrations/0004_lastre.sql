-- =====================================================================
-- 0004_lastre.sql  (schema v0.7, 22/11/2026)
-- Materiali su LASTRA (es. Forex 305×205 cm) nel catalogo e nei preventivi.
--
-- Richiede 0001, 0002 e 0003. Si esegue UNA volta per database.
--
-- Come funziona una riga di materiale "a lastra":
--   si scrivono misura della lastra, misura del pezzo, numero di pezzi
--   e margine di taglio (spazio tra un pezzo e l'altro). Il database calcola
--   quanti pezzi stanno in una lastra, tutti dritti oppure tutti ruotati,
--   e tiene il migliore dei due. Poi, a scelta:
--     · lastre_intere → quantità = lastre necessarie (arrotondate in su),
--                       unità "lastra", costo = prezzo della lastra
--     · m2_usati      → quantità = m² dei pezzi + % di scarto, unità "m2",
--                       costo al m² = prezzo della lastra ÷ m² della lastra
--   Esempio: Forex 305×205 a 48 €, 10 pezzi 100×70, margine 0
--     → 8 pezzi per lastra → 2 lastre = 96,00 €
--     → oppure 7,00 m² + 10% = 7,70 m² × 7,6769 €/m² = 59,11 €
--
-- Misure in centimetri con un decimale.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Catalogo: un articolo può essere in bobina OPPURE a lastra
--    (per le lastre il costo_unitario è il prezzo della lastra intera)
-- ---------------------------------------------------------------------
alter table public.articoli
  add column lastra_larghezza_cm numeric(7,1) check (lastra_larghezza_cm > 0),
  add column lastra_altezza_cm   numeric(7,1) check (lastra_altezza_cm > 0),
  add constraint articoli_lastra_misure check ((lastra_larghezza_cm is null) = (lastra_altezza_cm is null)),
  add constraint articoli_bobina_o_lastra check (larghezza_bobina_m is null or lastra_larghezza_cm is null);

comment on column public.articoli.lastra_larghezza_cm is 'Solo materiali a lastra: misure in cm; costo_unitario = prezzo della lastra intera.';


-- ---------------------------------------------------------------------
-- 2. Righe di materiale a lastra
-- ---------------------------------------------------------------------
create type public.addebito_lastra as enum ('lastre_intere', 'm2_usati');

alter table public.materiali_fase
  add column addebito_lastra     public.addebito_lastra,          -- vuoto = non è una lastra
  add column lastra_larghezza_cm numeric(7,1)  check (lastra_larghezza_cm > 0),
  add column lastra_altezza_cm   numeric(7,1)  check (lastra_altezza_cm > 0),
  add column costo_lastra        numeric(12,4) check (costo_lastra >= 0),  -- prezzo della lastra intera
  add column pezzo_larghezza_cm  numeric(7,1)  check (pezzo_larghezza_cm > 0),
  add column pezzo_altezza_cm    numeric(7,1)  check (pezzo_altezza_cm > 0),
  add column pezzi               integer       check (pezzi > 0),
  add column margine_taglio_cm   numeric(5,1)  not null default 0 check (margine_taglio_cm >= 0),
  add column scarto_percentuale  numeric(5,2)  not null default 10 check (scarto_percentuale between 0 and 100),
  -- una lastra ha tutti i suoi dati; una riga normale o in bobina nessuno
  add constraint materiali_fase_lastra check (
    (addebito_lastra is null) = (lastra_larghezza_cm is null)
    and (addebito_lastra is null) = (lastra_altezza_cm is null)
    and (addebito_lastra is null) = (costo_lastra is null)
    and (addebito_lastra is null) = (pezzo_larghezza_cm is null)
    and (addebito_lastra is null) = (pezzo_altezza_cm is null)
    and (addebito_lastra is null) = (pezzi is null)
  ),
  add constraint materiali_fase_bobina_o_lastra check (larghezza_m is null or addebito_lastra is null);


-- Quanti pezzi stanno in una lastra: righe × colonne, tutti dritti oppure
-- tutti ruotati (si tiene il migliore). Il margine sta solo TRA i pezzi.
create or replace function public.pezzi_per_lastra(
  p_lastra_l numeric, p_lastra_h numeric,
  p_pezzo_l  numeric, p_pezzo_h  numeric,
  p_margine  numeric default 0
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(
    floor((p_lastra_l + p_margine) / (p_pezzo_l + p_margine))
      * floor((p_lastra_h + p_margine) / (p_pezzo_h + p_margine)),
    floor((p_lastra_l + p_margine) / (p_pezzo_h + p_margine))
      * floor((p_lastra_h + p_margine) / (p_pezzo_l + p_margine))
  )::integer;
$$;

revoke execute on function public.pezzi_per_lastra(numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.pezzi_per_lastra(numeric, numeric, numeric, numeric, numeric) to authenticated;


-- Pulizia e calcoli della riga di materiale (sostituisce quella della 0003:
-- in più ci sono le lastre).
create or replace function public.normalizza_materiale_fase()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_articolo   public.articoli;
  v_per_lastra integer;
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

  if new.addebito_lastra is null then
    -- non è una lastra: niente dati di lastra
    new.lastra_larghezza_cm := null;
    new.lastra_altezza_cm   := null;
    new.costo_lastra        := null;
    new.pezzo_larghezza_cm  := null;
    new.pezzo_altezza_cm    := null;
    new.pezzi               := null;
  else
    -- lastra: misure e prezzo non indicati → dall'articolo del catalogo
    new.lastra_larghezza_cm := coalesce(new.lastra_larghezza_cm, v_articolo.lastra_larghezza_cm);
    new.lastra_altezza_cm   := coalesce(new.lastra_altezza_cm, v_articolo.lastra_altezza_cm);
    if new.costo_lastra is null and v_articolo.lastra_larghezza_cm is not null then
      new.costo_lastra := v_articolo.costo_unitario;
    end if;

    if new.lastra_larghezza_cm is null or new.lastra_altezza_cm is null or new.costo_lastra is null
       or new.pezzo_larghezza_cm is null or new.pezzo_altezza_cm is null or new.pezzi is null then
      raise exception 'Materiale «%»: per la lastra servono misure della lastra, prezzo, misure del pezzo e numero di pezzi.',
        new.descrizione;
    end if;

    v_per_lastra := public.pezzi_per_lastra(
      new.lastra_larghezza_cm, new.lastra_altezza_cm,
      new.pezzo_larghezza_cm, new.pezzo_altezza_cm, new.margine_taglio_cm);
    if v_per_lastra < 1 then
      -- misure scritte all'italiana: 30.5 → "30,5", 400.0 → "400"
      raise exception 'Materiale «%»: il pezzo %×% cm non entra nella lastra %×% cm.',
        new.descrizione,
        replace(trim_scale(new.pezzo_larghezza_cm)::text, '.', ','),
        replace(trim_scale(new.pezzo_altezza_cm)::text, '.', ','),
        replace(trim_scale(new.lastra_larghezza_cm)::text, '.', ','),
        replace(trim_scale(new.lastra_altezza_cm)::text, '.', ',');
    end if;

    if new.addebito_lastra = 'lastre_intere' then
      new.quantita       := ceil(new.pezzi::numeric / v_per_lastra);
      new.unita_misura   := 'lastra';
      new.costo_unitario := new.costo_lastra;
    else -- m2_usati
      new.quantita       := round(new.pezzo_larghezza_cm * new.pezzo_altezza_cm * new.pezzi / 10000
                                  * (1 + new.scarto_percentuale / 100), 3);
      new.unita_misura   := 'm2';
      new.costo_unitario := round(new.costo_lastra
                                  / (new.lastra_larghezza_cm * new.lastra_altezza_cm / 10000), 4);
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. salva_fasi: come nella 0003, in più salva i campi delle lastre
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

    -- righe di materiali (con i campi delle lastre)
    v_righe_ok := '{}';
    v_ordine_r := 0;
    for v_riga in select * from jsonb_array_elements(coalesce(v_fase -> 'materiali', '[]')) loop
      v_ordine_r := v_ordine_r + 1;
      if coalesce(v_riga ->> 'id', '') = '' then
        insert into public.materiali_fase
          (fase_id, ordine, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario,
           addebito_lastra, lastra_larghezza_cm, lastra_altezza_cm, costo_lastra,
           pezzo_larghezza_cm, pezzo_altezza_cm, pezzi, margine_taglio_cm, scarto_percentuale)
        select v_fase_id, v_ordine_r, r.articolo_id, r.descrizione, r.unita_misura,
               r.larghezza_m, r.metri_lineari, coalesce(r.quantita, 0), r.costo_unitario,
               r.addebito_lastra, r.lastra_larghezza_cm, r.lastra_altezza_cm, r.costo_lastra,
               r.pezzo_larghezza_cm, r.pezzo_altezza_cm, r.pezzi,
               coalesce(r.margine_taglio_cm, 0), coalesce(r.scarto_percentuale, 10)
          from jsonb_populate_record(null::public.materiali_fase, v_riga - 'id') r
        returning id into v_riga_id;
      else
        v_riga_id := (v_riga ->> 'id')::uuid;
        update public.materiali_fase m set
          (ordine, articolo_id, descrizione, unita_misura, larghezza_m, metri_lineari, quantita, costo_unitario,
           addebito_lastra, lastra_larghezza_cm, lastra_altezza_cm, costo_lastra,
           pezzo_larghezza_cm, pezzo_altezza_cm, pezzi, margine_taglio_cm, scarto_percentuale, attivo) = (
            select v_ordine_r, r.articolo_id, r.descrizione, r.unita_misura,
                   r.larghezza_m, r.metri_lineari, coalesce(r.quantita, 0),
                   coalesce(r.costo_unitario, m.costo_unitario),
                   r.addebito_lastra, r.lastra_larghezza_cm, r.lastra_altezza_cm, r.costo_lastra,
                   r.pezzo_larghezza_cm, r.pezzo_altezza_cm, r.pezzi,
                   coalesce(r.margine_taglio_cm, 0), coalesce(r.scarto_percentuale, 10), true
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
