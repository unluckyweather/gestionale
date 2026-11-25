-- =====================================================================
-- 0011_scarico_commesse.sql  (25/11/2026)
-- Scarico del magazzino dalle commesse (passo 7 della Produzione e
-- passo 6 del Magazzino) + correzione della vista commesse_elenco.
--
-- Richiede 0001…0010. Si esegue UNA volta per database.
--
-- Come funziona (decisione del 23/11):
--   il materiale previsto nel preventivo NON scende da solo dalla giacenza:
--   quando si conferma il materiale usato davvero (quantità proposte dal
--   preventivo, modificabili) si registrano degli SCARICHI legati alla
--   commessa. Il materiale avanzato che torna in magazzino è un CARICO
--   legato alla commessa. Un movimento sbagliato si annulla dal Magazzino
--   come gli altri.
--
-- Permessi: titolare e ufficio registrano i movimenti di una commessa;
-- gli operai continuano a registrare carichi, scarichi e inventari
-- senza commessa (come nella 0008).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. movimenti_magazzino.commessa_id
-- ---------------------------------------------------------------------
alter table public.movimenti_magazzino
  add column commessa_id uuid references public.commesse (id),
  add constraint movimenti_commessa_tipo check (commessa_id is null or tipo in ('scarico', 'carico')),
  add constraint movimenti_commessa_o_ordine check (commessa_id is null or riga_ordine_id is null);

comment on column public.movimenti_magazzino.commessa_id is
  'Commessa per cui si è usato il materiale (scarico) o da cui è tornato il materiale avanzato (carico).';

create index movimenti_magazzino_commessa_idx on public.movimenti_magazzino (commessa_id) where commessa_id is not null;

-- la commessa dev'essere della stessa azienda del movimento
drop trigger a0_azienda on public.movimenti_magazzino;
create trigger a0_azienda before insert or update on public.movimenti_magazzino
  for each row execute function public.allinea_azienda(
    'articolo_id:articoli', 'riga_ordine_id:righe_ordine_acquisto', 'commessa_id:commesse');

-- Come nella 0007, più: la commessa di un movimento non cambia, e una
-- commessa archiviata non riceve movimenti nuovi.
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
    new.commessa_id    := old.commessa_id;
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

  if tg_op = 'INSERT' and new.commessa_id is not null
     and not exists (select 1 from public.commesse c where c.id = new.commessa_id and c.attivo) then
    raise exception 'La commessa è archiviata o non esiste: non si registrano movimenti.';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. Regola di inserimento: i movimenti di una commessa solo titolare e ufficio
--    (gli operai come nella 0008, ma senza commessa)
-- ---------------------------------------------------------------------
drop policy "movimenti_magazzino: inserimento" on public.movimenti_magazzino;

create policy "movimenti_magazzino: inserimento" on public.movimenti_magazzino
  for insert to authenticated
  with check (
    (select public.ha_ruolo('titolare', 'ufficio'))
    -- gli operai: carichi, scarichi e inventari, non legati a un ordine né a una commessa, a proprio nome
    or ((select public.ha_ruolo('operaio'))
        and tipo in ('carico', 'scarico', 'rettifica')
        and riga_ordine_id is null
        and commessa_id is null
        and creato_da = (select auth.uid()))
  );


-- ---------------------------------------------------------------------
-- 3. scarica_materiali — conferma del materiale usato per una commessa
--
-- p_righe: [{ articolo_id, quantita }]  (quantità usate, nell'unità di
--          magazzino; > 0 = scarico, < 0 = materiale avanzato che torna
--          in magazzino (carico); righe a 0 ignorate)
-- Tutto o niente. Restituisce quante righe ha registrato.
-- ---------------------------------------------------------------------
create or replace function public.scarica_materiali(
  p_commessa_id  uuid,
  p_righe        jsonb,
  p_data         date default current_date,
  p_note         text default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_riga    jsonb;
  v_q       numeric;
  v_numero  text;
  v_quante  integer := 0;
begin
  select numero into v_numero from public.commesse where id = p_commessa_id and attivo;
  if v_numero is null then
    raise exception 'Commessa non trovata o archiviata.';
  end if;

  for v_riga in select * from jsonb_array_elements(coalesce(p_righe, '[]')) loop
    v_q := round(coalesce((v_riga ->> 'quantita')::numeric, 0), 3);
    continue when v_q = 0;
    insert into public.movimenti_magazzino (articolo_id, data, tipo, quantita, commessa_id, note)
    values (
      (v_riga ->> 'articolo_id')::uuid,
      coalesce(p_data, current_date),
      case when v_q > 0 then 'scarico' else 'carico' end::public.tipo_movimento,
      -v_q,   -- scarico: quantità negativa; materiale avanzato: positiva
      p_commessa_id,
      coalesce(public.pulisci(p_note), 'commessa ' || v_numero)
    );
    v_quante := v_quante + 1;
  end loop;

  if v_quante = 0 then
    raise exception 'Indica almeno una quantità.';
  end if;
  return v_quante;
end;
$$;

revoke execute on function public.scarica_materiali(uuid, jsonb, date, text) from public, anon;
grant execute on function public.scarica_materiali(uuid, jsonb, date, text) to authenticated;


-- ---------------------------------------------------------------------
-- 4. materiali_commessa — quanto materiale è già stato scaricato per
--    ogni commessa e articolo (security_invoker: regole di chi legge)
-- ---------------------------------------------------------------------
create view public.materiali_commessa
with (security_invoker = true)
as
select
  m.commessa_id,
  m.articolo_id,
  -sum(m.quantita) as usato,          -- scarichi meno il materiale tornato
  count(*)         as movimenti,
  max(m.data)      as ultimo
from public.movimenti_magazzino m
where m.attivo and m.commessa_id is not null
group by m.commessa_id, m.articolo_id;

comment on view public.materiali_commessa is 'Materiale usato per ogni commessa e articolo (scarichi meno rientri), nell''unità di magazzino.';

revoke all on public.materiali_commessa from anon;


-- ---------------------------------------------------------------------
-- 5. commesse_elenco: avanzamento 0 (non vuoto) quando nessun lavoro è
--    finito (difetto della 0010: mancava coalesce su ore_finite)
-- ---------------------------------------------------------------------
create or replace view public.commesse_elenco
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
  case
    when coalesce(l.ore_previste, 0) > 0 then round(100 * coalesce(l.ore_finite, 0) / l.ore_previste)::integer
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
