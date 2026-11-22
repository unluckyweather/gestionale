-- =====================================================================
-- 0005_stampa.sql  (schema v0.8, 22/11/2026)
-- Preventivo da stampare / salvare in PDF:
--   · tabella AZIENDA (una sola riga): i dati dell'intestazione e il logo
--   · nei preventivi: note per il cliente e "prezzo di ogni fase nel PDF"
--
-- Richiede 0001–0004. Si esegue UNA volta per database.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. azienda — i dati della nostra azienda (una riga sola)
--    La leggono titolare, ufficio e contabilità (servono per stampare);
--    la modifica solo il titolare, in Impostazioni.
--    Serviranno anche per la fattura elettronica (cedente/prestatore).
-- ---------------------------------------------------------------------
create table public.azienda (
  id                uuid primary key default gen_random_uuid(),
  -- garantisce che la riga sia una sola
  unica             boolean not null default true check (unica),
  ragione_sociale   text not null check (btrim(ragione_sociale) <> ''),
  indirizzo         text,
  civico            text,
  cap               text,
  comune            text,
  provincia         text,
  nazione           text not null default 'IT' check (nazione ~ '^[A-Z]{2}$'),
  partita_iva       text,
  codice_fiscale    text,
  telefono          text,
  email             text check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  pec               text check (pec ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  sito_web          text,
  iban              text check (iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$'),
  banca             text,
  rea               text,   -- es. "PD-123456"
  capitale_sociale  text,   -- es. "€ 10.000,00 i.v."
  piede_documenti   text,   -- testo libero in fondo ai documenti
  -- logo come immagine "incorporata" (data URL), al massimo ~300 KB
  logo              text check (
                      logo is null
                      or (logo ~ '^data:image/(png|jpeg|webp|svg\+xml);base64,' and length(logo) <= 400000)
                    ),
  attivo            boolean not null default true,
  creato_il         timestamptz not null default now(),
  creato_da         uuid default auth.uid() references public.profili (id),
  aggiornato_il     timestamptz not null default now(),
  aggiornato_da     uuid default auth.uid() references public.profili (id),
  constraint azienda_una_sola unique (unica)
);

comment on table public.azienda is 'Dati della nostra azienda per l''intestazione dei documenti (una sola riga).';

create or replace function public.normalizza_azienda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ragione_sociale  := btrim(new.ragione_sociale);
  new.indirizzo        := public.pulisci(new.indirizzo);
  new.civico           := public.pulisci(new.civico);
  new.cap              := public.pulisci(new.cap);
  new.comune           := public.pulisci(new.comune);
  new.provincia        := upper(public.pulisci(new.provincia));
  new.nazione          := upper(coalesce(public.pulisci(new.nazione), 'IT'));
  new.partita_iva      := public.pulisci(replace(new.partita_iva, ' ', ''));
  new.codice_fiscale   := upper(public.pulisci(replace(new.codice_fiscale, ' ', '')));
  new.telefono         := public.pulisci(new.telefono);
  new.email            := lower(public.pulisci(new.email));
  new.pec              := lower(public.pulisci(new.pec));
  new.sito_web         := public.pulisci(new.sito_web);
  new.iban             := upper(public.pulisci(replace(new.iban, ' ', '')));
  new.banca            := public.pulisci(new.banca);
  new.rea              := public.pulisci(new.rea);
  new.capitale_sociale := public.pulisci(new.capitale_sociale);
  new.piede_documenti  := public.pulisci(new.piede_documenti);
  new.logo             := public.pulisci(new.logo);
  return new;
end;
$$;

create trigger a_normalizza before insert or update on public.azienda
  for each row execute function public.normalizza_azienda();
create trigger b_aggiornamento before update on public.azienda
  for each row execute function public.imposta_aggiornamento();
create trigger vieta_cancellazione before delete on public.azienda
  for each row execute function public.vieta_cancellazione();
create trigger z_registro after insert or update on public.azienda
  for each row execute function public.registra_modifica();

alter table public.azienda enable row level security;
revoke all on public.azienda from anon;
create policy "azienda: lettura" on public.azienda
  for select to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio', 'contabilita')));
create policy "azienda: inserimento" on public.azienda
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare')));
create policy "azienda: modifica" on public.azienda
  for update to authenticated
  using ((select public.ha_ruolo('titolare')))
  with check ((select public.ha_ruolo('titolare')));


-- ---------------------------------------------------------------------
-- 2. preventivi: note per il cliente e prezzi delle fasi nel PDF
--    (le note interne restano in "note" e non vanno mai al cliente)
-- ---------------------------------------------------------------------
alter table public.preventivi
  add column note_cliente        text,
  add column prezzi_fasi_nel_pdf boolean not null default false;

comment on column public.preventivi.note_cliente is 'Testo stampato nel PDF per il cliente (consegna, esclusioni, condizioni).';
comment on column public.preventivi.prezzi_fasi_nel_pdf is 'Se vero, il PDF mostra il prezzo di ogni fase; altrimenti solo i totali.';


-- ---------------------------------------------------------------------
-- 3. salva_preventivo: come nella 0003, in più salva i due campi nuovi
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
      ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note,
      note_cliente, prezzi_fasi_nel_pdf
    )
    select
      r.soggetto_id, r.oggetto, r.modello_id, coalesce(r.data, current_date), r.valido_fino,
      coalesce(r.ricarico_percentuale, 35), r.prezzo_cliente, r.codice_iva_id, r.cig, r.cup, r.note,
      public.pulisci(r.note_cliente), coalesce(r.prezzi_fasi_nel_pdf, false)
    from jsonb_populate_record(null::public.preventivi, p_preventivo) r
    returning id into v_id;
  else
    if public.preventivo_bloccato(v_id) then
      raise exception 'Il preventivo è accettato o rifiutato: non si modifica più. Duplicalo per farne uno nuovo.';
    end if;
    update public.preventivi p set (
      soggetto_id, oggetto, modello_id, data, valido_fino,
      ricarico_percentuale, prezzo_cliente, codice_iva_id, cig, cup, note,
      note_cliente, prezzi_fasi_nel_pdf
    ) = (
      select
        r.soggetto_id, r.oggetto, r.modello_id, coalesce(r.data, p.data), r.valido_fino,
        coalesce(r.ricarico_percentuale, 35), r.prezzo_cliente, r.codice_iva_id, r.cig, r.cup, r.note,
        public.pulisci(r.note_cliente), coalesce(r.prezzi_fasi_nel_pdf, false)
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
