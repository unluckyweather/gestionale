-- =====================================================================
-- 0012_richieste_assenze.sql  (26/11/2026)
-- Richieste di ferie e permessi dall'app: chi lavora chiede, il
-- titolare approva o rifiuta.
--
-- Richiede 0001…0011. Si esegue UNA volta per database.
--
-- Decisioni del 26/11:
--   - ogni assenza ha uno STATO: richiesta → approvata oppure rifiutata;
--   - chiede chiunque sia collegato a un dipendente (operai, ufficio,
--     contabilità), solo per sé, solo ferie o permesso: la MALATTIA la
--     registra il titolare (c'è il certificato);
--   - decide SOLO il titolare; quello che registra lui nasce approvato;
--   - chi ha chiesto può ritirare la richiesta finché non è decisa;
--   - nel programma, negli avvisi e nel calendario di tutti contano
--     SOLO le assenze approvate (una richiesta non toglie ore a nessuno);
--   - niente conteggio dei giorni di ferie rimasti (per ora).
--
-- Le assenze che ci sono già diventano «approvate».
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Stato e decisione
-- ---------------------------------------------------------------------
create type public.stato_assenza as enum ('richiesta', 'approvata', 'rifiutata');

alter table public.assenze
  add column stato      public.stato_assenza not null default 'approvata',
  add column deciso_da  uuid references public.profili (id),
  add column deciso_il  timestamptz,
  add column risposta   text;

comment on column public.assenze.stato     is 'richiesta (in attesa del titolare), approvata, rifiutata. Contano solo le approvate.';
comment on column public.assenze.deciso_da is 'Chi ha approvato o rifiutato (lo scrive il database).';
comment on column public.assenze.deciso_il is 'Quando è stata approvata o rifiutata (lo scrive il database).';
comment on column public.assenze.risposta  is 'Nota del titolare per la persona, es. il motivo del rifiuto.';

-- richieste in attesa, per il riquadro del titolare e il numerino del menu
create index assenze_richieste_idx on public.assenze (azienda_id, dal) where attivo and stato = 'richiesta';


-- ---------------------------------------------------------------------
-- 2. Controlli (trigger a_normalizza, già collegato nella 0010)
-- ---------------------------------------------------------------------
create or replace function public.normalizza_assenza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_titolare boolean := auth.uid() is null or public.ha_ruolo('titolare');
begin
  new.note     := public.pulisci(new.note);
  new.risposta := public.pulisci(new.risposta);

  if tg_op = 'INSERT' then
    if not v_titolare then
      -- chi non è titolare fa solo richieste, per sé, di ferie o permesso
      if new.tipo = 'malattia' then
        raise exception 'La malattia la registra il titolare: avvisalo e porta il certificato.';
      end if;
      new.stato    := 'richiesta';
      new.risposta := null;
      if exists (
        select 1 from public.assenze x
         where x.dipendente_id = new.dipendente_id and x.attivo and x.stato <> 'rifiutata'
           and public.periodo(x.dal, x.al, x.dalle, x.alle) && public.periodo(new.dal, new.al, new.dalle, new.alle)
      ) then
        raise exception 'In quei giorni hai già un''assenza o una richiesta.';
      end if;
    end if;
    if new.stato = 'richiesta' then
      new.deciso_da := null;
      new.deciso_il := null;
    else
      new.deciso_da := auth.uid();
      new.deciso_il := now();
    end if;
    return new;
  end if;

  -- UPDATE
  if not v_titolare then
    -- chi ha chiesto può solo ritirare la richiesta non ancora decisa
    if old.stato <> 'richiesta' then
      raise exception 'La richiesta è già stata decisa: per cambiarla parla con il titolare.';
    end if;
    if (to_jsonb(new) - 'attivo' - 'aggiornato_il' - 'aggiornato_da')
       is distinct from (to_jsonb(old) - 'attivo' - 'aggiornato_il' - 'aggiornato_da')
       or new.attivo then
      raise exception 'Puoi solo ritirare la richiesta.';
    end if;
    return new;
  end if;

  -- titolare: una decisione non torna «richiesta»; chi e quando li scrive il database
  if new.stato is distinct from old.stato then
    if new.stato = 'richiesta' then
      raise exception 'Una richiesta già decisa non torna in attesa.';
    end if;
    new.deciso_da := auth.uid();
    new.deciso_il := now();
  else
    new.deciso_da := old.deciso_da;
    new.deciso_il := old.deciso_il;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. Permessi (RLS): oltre al titolare, ognuno chiede e ritira per sé
--    (la lettura resta quella della 0010: titolare tutto, ognuno le proprie)
-- ---------------------------------------------------------------------
create or replace function public.e_mio_dipendente(p_dipendente uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dipendenti d
     where d.id = p_dipendente and d.attivo
       and d.profilo_id is not null and d.profilo_id = auth.uid()
  );
$$;

comment on function public.e_mio_dipendente(uuid) is 'Vero se il dipendente è quello collegato a chi è collegato.';
revoke all on function public.e_mio_dipendente(uuid) from public, anon;
grant execute on function public.e_mio_dipendente(uuid) to authenticated;

create policy "assenze: richiesta propria" on public.assenze
  for insert to authenticated
  with check (
    (select public.ruolo_corrente()) is not null
    and stato = 'richiesta'
    and tipo <> 'malattia'
    and public.e_mio_dipendente(dipendente_id)
  );

create policy "assenze: ritiro della propria richiesta" on public.assenze
  for update to authenticated
  using (
    (select public.ruolo_corrente()) is not null
    and stato = 'richiesta'
    and public.e_mio_dipendente(dipendente_id)
  )
  with check (
    public.e_mio_dipendente(dipendente_id)
  );


-- ---------------------------------------------------------------------
-- 4. Viste: contano solo le assenze approvate
--    (stesse colonne della 0010, cambia solo il filtro)
-- ---------------------------------------------------------------------
create or replace view public.assenze_elenco
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
  and a.stato = 'approvata'
  and (select public.ruolo_corrente()) is not null
  and a.azienda_id = (select public.azienda_corrente());

comment on view public.assenze_elenco is 'Assenze attive e APPROVATE per il programma e il calendario. Motivo «assente» al posto di «malattia» per chi non è titolare.';

create or replace view public.programma
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
     where x.dipendente_id = a.dipendente_id and x.attivo and x.stato = 'approvata'
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

comment on view public.programma is 'Programma del giorno (assegnazioni attive) con lavoro, commessa, cliente, macchina, persona e avvisi (assenze: solo approvate). Senza prezzi: la leggono tutti gli utenti attivi.';
