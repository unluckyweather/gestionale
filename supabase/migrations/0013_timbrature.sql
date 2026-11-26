-- =====================================================================
-- 0013_timbrature.sql  (26/11/2026)
-- Timbrature: entrata, pausa e uscita dal telefono, correzioni
-- dell'ufficio, presenze calcolate e controllo «vicino alla ditta».
--
-- Richiede 0001…0012. Si esegue UNA volta per database.
--
-- Decisioni del 26/11:
--   - ogni clic è una riga di «timbrature» (entrata, inizio pausa,
--     fine pausa, uscita); ore lavorate e stati si CALCOLANO (vista
--     timbrature_giorno), non si salvano;
--   - timbra chi è collegato a un dipendente, solo per sé, SOLO con la
--     funzione timbra(): l'ora la decide il SERVER. Eccezione: una
--     timbratura fatta senza rete arriva dopo con l'ora del telefono e
--     resta segnata «arrivata dopo» (id_locale evita i doppioni);
--   - titolare e ufficio correggono: aggiungono una timbratura
--     dimenticata (motivo obbligatorio) o annullano una sbagliata
--     (motivo obbligatorio). Una timbratura non si modifica mai: si
--     annulla e se ne registra una nuova. Tutto va nel registro;
--   - la contabilità legge (export per il consulente), ognuno legge le
--     proprie;
--   - VICINO ALLA DITTA: il titolare salva una volta le coordinate della
--     ditta e un raggio, e accende il controllo. Al momento del clic il
--     telefono manda la posizione, il database calcola la distanza e
--     salva SOLO l'esito (in zona / fuori zona / posizione non data) e
--     la distanza arrotondata: MAI le coordinate. Fuori zona la
--     timbratura si accetta ma si segnala, tranne se quel giorno la
--     persona ha una posa nel programma (postazione fuori sede).
--     Spento finché il titolare non lo accende (prima: consulente del
--     lavoro e informativa ai dipendenti, Statuto dei lavoratori art. 4).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Tipi
-- ---------------------------------------------------------------------
create type public.tipo_timbratura    as enum ('entrata', 'inizio_pausa', 'fine_pausa', 'uscita');
create type public.origine_timbratura as enum ('telefono', 'ufficio');
create type public.esito_posizione    as enum ('in_zona', 'fuori_zona', 'non_disponibile');


-- ---------------------------------------------------------------------
-- 2. Posizione della ditta (nei dati dell'azienda, li scrive il titolare)
-- ---------------------------------------------------------------------
alter table public.azienda
  add column posizione_controllo boolean not null default false,
  add column posizione_lat       numeric(9,6) check (posizione_lat between -90 and 90),
  add column posizione_lon       numeric(9,6) check (posizione_lon between -180 and 180),
  add column posizione_raggio_m  integer not null default 200 check (posizione_raggio_m between 50 and 5000),
  add constraint azienda_posizione_completa
    check (not posizione_controllo or (posizione_lat is not null and posizione_lon is not null));

comment on column public.azienda.posizione_controllo is 'Acceso: alla timbratura si controlla se la persona è vicino alla ditta (solo segnalazione).';
comment on column public.azienda.posizione_lat       is 'Latitudine della ditta (gradi decimali).';
comment on column public.azienda.posizione_lon       is 'Longitudine della ditta (gradi decimali).';
comment on column public.azienda.posizione_raggio_m  is 'Raggio della zona in metri (consigliato 200: dentro i capannoni il GPS sbaglia).';


-- ---------------------------------------------------------------------
-- 3. timbrature — ogni clic è una riga
-- ---------------------------------------------------------------------
create table public.timbrature (
  id                uuid primary key default gen_random_uuid(),
  azienda_id        uuid not null default public.azienda_corrente() references public.azienda (id),
  dipendente_id     uuid not null references public.dipendenti (id),
  tipo              public.tipo_timbratura not null,
  orario            timestamptz not null default now(),
  commessa_id       uuid references public.commesse (id),
  origine           public.origine_timbratura not null default 'ufficio',
  id_locale         uuid,
  ricevuta_il       timestamptz not null default now(),
  posizione         public.esito_posizione,
  distanza_m        integer check (distanza_m >= 0),
  motivo            text,
  annullata_motivo  text,
  note              text,
  attivo            boolean not null default true,
  creato_il         timestamptz not null default now(),
  creato_da         uuid default auth.uid() references public.profili (id),
  aggiornato_il     timestamptz not null default now(),
  aggiornato_da     uuid default auth.uid() references public.profili (id),
  constraint timbrature_id_locale_unico unique (dipendente_id, id_locale)
);

comment on table  public.timbrature is 'Timbrature (un clic = una riga). Le ore si calcolano nella vista timbrature_giorno. Non si modificano: si annullano.';
comment on column public.timbrature.orario      is 'Ora della timbratura: quella del server; per le timbrature fatte senza rete quella del telefono.';
comment on column public.timbrature.origine     is 'telefono (funzione timbra) oppure ufficio (correzione di titolare o ufficio).';
comment on column public.timbrature.id_locale   is 'Codice creato dal telefono: la stessa timbratura mandata due volte si salva una volta sola.';
comment on column public.timbrature.ricevuta_il is 'Quando è arrivata al server (diversa da orario se fatta senza rete).';
comment on column public.timbrature.posizione   is 'Esito del controllo vicino alla ditta; vuoto se il controllo è spento. Le coordinate NON si salvano.';
comment on column public.timbrature.distanza_m  is 'Distanza dalla ditta, arrotondata a 10 m (solo se la posizione è stata data).';
comment on column public.timbrature.motivo      is 'Motivo della correzione (obbligatorio per le timbrature dell''ufficio).';
comment on column public.timbrature.annullata_motivo is 'Motivo dell''annullamento (obbligatorio quando si annulla).';

create index timbrature_azienda_idx    on public.timbrature (azienda_id);
create index timbrature_dipendente_idx on public.timbrature (dipendente_id, orario) where attivo;
create index timbrature_orario_idx     on public.timbrature (azienda_id, orario) where attivo;


-- ---------------------------------------------------------------------
-- 4. Controlli (trigger a_normalizza)
--    - dalla funzione timbra(): i valori li ha già decisi lei;
--    - inserimento diretto (titolare, ufficio): è una CORREZIONE;
--    - modifica: solo l'annullamento, con il motivo.
-- ---------------------------------------------------------------------
create or replace function public.normalizza_timbratura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.motivo           := public.pulisci(new.motivo);
  new.annullata_motivo := public.pulisci(new.annullata_motivo);
  new.note             := public.pulisci(new.note);

  if tg_op = 'INSERT' then
    if not exists (select 1 from public.dipendenti d where d.id = new.dipendente_id and d.attivo) then
      raise exception 'Dipendente non trovato o non attivo.';
    end if;
    if not new.attivo then
      raise exception 'Una timbratura nuova non può nascere annullata.';
    end if;
    new.annullata_motivo := null;

    if coalesce(current_setting('gestionale.da_timbra', true), '') = 'si' then
      new.origine := 'telefono';
      return new;
    end if;

    -- correzione dell'ufficio
    new.origine     := 'ufficio';
    new.ricevuta_il := now();
    new.posizione   := null;
    new.distanza_m  := null;
    if new.motivo is null then
      raise exception 'Scrivi il motivo della correzione (es. «dimenticata l''uscita»).';
    end if;
    if new.orario > now() + interval '5 minutes' then
      raise exception 'Non si registra una timbratura nel futuro.';
    end if;
    return new;
  end if;

  -- UPDATE: solo annullare, con il motivo
  if (to_jsonb(new) - 'attivo' - 'annullata_motivo' - 'aggiornato_il' - 'aggiornato_da')
     is distinct from (to_jsonb(old) - 'attivo' - 'annullata_motivo' - 'aggiornato_il' - 'aggiornato_da') then
    raise exception 'Una timbratura non si modifica: annullala e registrane una nuova.';
  end if;
  if not old.attivo then
    raise exception 'La timbratura è già annullata.';
  end if;
  if new.attivo then
    raise exception 'Si può solo annullare la timbratura.';
  end if;
  if new.annullata_motivo is null then
    raise exception 'Scrivi il motivo dell''annullamento.';
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. Trigger
-- ---------------------------------------------------------------------
create trigger a0_azienda before insert or update on public.timbrature
  for each row execute function public.allinea_azienda('dipendente_id:dipendenti', 'commessa_id:commesse');
create trigger a_normalizza before insert or update on public.timbrature
  for each row execute function public.normalizza_timbratura();
create trigger b_aggiornamento before update on public.timbrature
  for each row execute function public.imposta_aggiornamento();
create trigger vieta_cancellazione before delete on public.timbrature
  for each row execute function public.vieta_cancellazione();
create trigger z_registro after insert or update on public.timbrature
  for each row execute function public.registra_modifica();


-- ---------------------------------------------------------------------
-- 6. Permessi (RLS)
--    Lettura: titolare, ufficio, contabilità tutto; gli altri le proprie.
--    Scrittura diretta: solo titolare e ufficio (correzioni). Chi timbra
--    dal telefono passa SOLO dalla funzione timbra().
-- ---------------------------------------------------------------------
alter table public.timbrature enable row level security;
revoke all on public.timbrature from anon;

create policy "timbrature: stessa azienda" on public.timbrature
  as restrictive for all to authenticated
  using (azienda_id = (select public.azienda_corrente()))
  with check (azienda_id = (select public.azienda_corrente()));

create policy "timbrature: lettura" on public.timbrature
  for select to authenticated
  using (
    (select public.ha_ruolo('titolare', 'ufficio', 'contabilita'))
    or ((select public.ruolo_corrente()) is not null and public.e_mio_dipendente(dipendente_id))
  );
create policy "timbrature: correzione (inserimento)" on public.timbrature
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare', 'ufficio')));
create policy "timbrature: correzione (annullamento)" on public.timbrature
  for update to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio')))
  with check ((select public.ha_ruolo('titolare', 'ufficio')));


-- ---------------------------------------------------------------------
-- 7. Distanza tra due punti in metri (formula dell'emisenoverso)
-- ---------------------------------------------------------------------
create or replace function public.distanza_metri(
  p_lat1 double precision, p_lon1 double precision,
  p_lat2 double precision, p_lon2 double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(sqrt(
           power(sin(radians(p_lat2 - p_lat1) / 2), 2)
           + cos(radians(p_lat1)) * cos(radians(p_lat2)) * power(sin(radians(p_lon2 - p_lon1) / 2), 2)
         ));
$$;


-- ---------------------------------------------------------------------
-- 8. timbra() — la timbratura dal telefono
--    p_lat, p_lon, p_precisione: posizione del telefono (facoltative;
--      servono solo se il controllo è acceso, e non si salvano);
--    p_id_locale: codice creato dal telefono (contro i doppioni);
--    p_orario: SOLO per le timbrature fatte senza rete (ora del
--      telefono); altrimenti vuoto = ora del server.
--    Restituisce l'id della timbratura (anche se era già arrivata).
-- ---------------------------------------------------------------------
create or replace function public.timbra(
  p_tipo        public.tipo_timbratura,
  p_lat         double precision default null,
  p_lon         double precision default null,
  p_precisione  double precision default null,
  p_id_locale   uuid default null,
  p_orario      timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dipendente  uuid;
  v_azienda     public.azienda%rowtype;
  v_orario      timestamptz := now();
  v_senza_rete  boolean := false;
  v_ultima      public.timbrature%rowtype;
  v_posizione   public.esito_posizione;
  v_distanza    double precision;
  v_id          uuid;
begin
  if (select public.ruolo_corrente()) is null then
    raise exception 'Account non attivo.';
  end if;

  select d.id into v_dipendente
    from public.dipendenti d
   where d.profilo_id = auth.uid() and d.attivo
     and d.azienda_id = public.azienda_corrente();
  if v_dipendente is null then
    raise exception 'Il tuo account non è collegato a un dipendente: chiedi al titolare.';
  end if;

  -- già arrivata (il telefono l'ha mandata due volte)
  if p_id_locale is not null then
    select t.id into v_id from public.timbrature t
     where t.dipendente_id = v_dipendente and t.id_locale = p_id_locale;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  -- ora del telefono solo per le timbrature fatte senza rete
  if p_orario is not null and p_orario < now() - interval '2 minutes' then
    if p_orario < now() - interval '72 hours' then
      raise exception 'Timbratura troppo vecchia per essere inviata: chiedi all''ufficio di registrarla.';
    end if;
    v_orario     := p_orario;
    v_senza_rete := true;
  elsif p_orario is not null and p_orario > now() + interval '2 minutes' then
    raise exception 'L''ora del telefono è sbagliata (nel futuro): controlla data e ora.';
  end if;

  -- controllo della sequenza (solo dal vivo: quelle arrivate dopo si
  -- accettano e le eventuali anomalie le mostra timbrature_giorno)
  if not v_senza_rete then
    select t.* into v_ultima from public.timbrature t
     where t.dipendente_id = v_dipendente and t.attivo
       and (t.orario at time zone 'Europe/Rome')::date = (v_orario at time zone 'Europe/Rome')::date
     order by t.orario desc, t.ricevuta_il desc
     limit 1;

    -- doppio clic: la stessa timbratura entro 2 minuti vale una volta
    if v_ultima.id is not null and v_ultima.tipo = p_tipo and v_ultima.orario > v_orario - interval '2 minutes' then
      return v_ultima.id;
    end if;

    if p_tipo = 'entrata' and v_ultima.tipo is not null and v_ultima.tipo <> 'uscita' then
      raise exception 'Hai già timbrato l''entrata.';
    elsif p_tipo = 'inizio_pausa' and v_ultima.tipo is distinct from 'entrata' and v_ultima.tipo is distinct from 'fine_pausa' then
      raise exception 'Per iniziare la pausa devi essere entrato (e non già in pausa).';
    elsif p_tipo = 'fine_pausa' and v_ultima.tipo is distinct from 'inizio_pausa' then
      raise exception 'Non sei in pausa.';
    elsif p_tipo = 'uscita' and (v_ultima.tipo is null or v_ultima.tipo = 'uscita') then
      raise exception 'Non hai timbrato l''entrata.';
    end if;
  end if;

  -- vicino alla ditta? (si salva solo l'esito, mai le coordinate)
  select a.* into v_azienda from public.azienda a where a.id = public.azienda_corrente();
  if v_azienda.posizione_controllo then
    if p_lat is null or p_lon is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
      v_posizione := 'non_disponibile';
    else
      v_distanza := public.distanza_metri(v_azienda.posizione_lat, v_azienda.posizione_lon, p_lat, p_lon);
      -- l'imprecisione del GPS conta fino a 100 m in più
      if v_distanza - least(greatest(coalesce(p_precisione, 0), 0), 100) <= v_azienda.posizione_raggio_m then
        v_posizione := 'in_zona';
      else
        v_posizione := 'fuori_zona';
      end if;
    end if;
  end if;

  perform set_config('gestionale.da_timbra', 'si', true);
  insert into public.timbrature (dipendente_id, tipo, orario, origine, id_locale, posizione, distanza_m)
  values (
    v_dipendente, p_tipo, v_orario, 'telefono', p_id_locale, v_posizione,
    case when v_distanza is not null then (round(v_distanza / 10) * 10)::integer end
  )
  returning id into v_id;
  perform set_config('gestionale.da_timbra', 'no', true);

  return v_id;
end;
$$;

comment on function public.timbra(public.tipo_timbratura, double precision, double precision, double precision, uuid, timestamptz)
  is 'Timbratura dal telefono per il dipendente collegato a chi chiama. Ora del server (o del telefono se fatta senza rete), controllo della sequenza e della posizione.';
revoke all on function public.timbra(public.tipo_timbratura, double precision, double precision, double precision, uuid, timestamptz) from public, anon;
grant execute on function public.timbra(public.tipo_timbratura, double precision, double precision, double precision, uuid, timestamptz) to authenticated;

-- Il telefono deve sapere se chiedere la posizione (gli operai non leggono «azienda»)
create or replace function public.controllo_posizione_attivo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.posizione_controllo from public.azienda a
     where a.id = public.azienda_corrente() and public.ruolo_corrente() is not null
  ), false);
$$;

comment on function public.controllo_posizione_attivo() is 'Vero se nella propria azienda il controllo «vicino alla ditta» è acceso.';
revoke all on function public.controllo_posizione_attivo() from public, anon;
grant execute on function public.controllo_posizione_attivo() to authenticated;

-- la funzione per la distanza non serve dall'app
revoke all on function public.distanza_metri(double precision, double precision, double precision, double precision) from public, anon;


-- ---------------------------------------------------------------------
-- 9. timbrature_giorno — una riga per persona e giorno (ora italiana)
--    security_invoker: ognuno vede quello che vede nella tabella.
--    minuti_lavorati: da entrata/fine pausa alla timbratura dopo; oggi,
--      se si è ancora dentro, fino ad adesso. Un giorno passato senza
--      uscita conta solo i tratti chiusi (e segna uscita_mancante).
-- ---------------------------------------------------------------------
create view public.timbrature_giorno
with (security_invoker = true)
as
with t as (
  select
    x.id,
    x.dipendente_id,
    x.tipo,
    x.orario,
    x.origine,
    x.ricevuta_il,
    x.posizione,
    x.distanza_m,
    (x.orario at time zone 'Europe/Rome')::date as giorno,
    lag(x.tipo)    over w as tipo_prima,
    lead(x.tipo)   over w as tipo_dopo,
    lead(x.orario) over w as orario_dopo
  from public.timbrature x
  where x.attivo
  window w as (partition by x.dipendente_id, (x.orario at time zone 'Europe/Rome')::date
               order by x.orario, x.ricevuta_il)
),
oggi as (
  select (now() at time zone 'Europe/Rome')::date as giorno
)
select
  t.dipendente_id,
  t.giorno,
  min(t.orario) filter (where t.tipo = 'entrata') as entrata,
  max(t.orario) filter (where t.tipo = 'uscita')  as uscita,
  (array_agg(t.tipo order by t.orario desc, t.ricevuta_il desc))[1] as ultima,
  max(t.orario) as ultima_il,
  count(*)::integer as timbrature,

  round(coalesce(sum(extract(epoch from (
      coalesce(t.orario_dopo, case when t.giorno = (select giorno from oggi) then greatest(now(), t.orario) end)
      - t.orario)) / 60)
    filter (where t.tipo in ('entrata', 'fine_pausa')
              and (t.tipo_dopo is null or t.tipo_dopo in ('inizio_pausa', 'uscita'))), 0))::integer
    as minuti_lavorati,

  round(coalesce(sum(extract(epoch from (
      coalesce(t.orario_dopo, case when t.giorno = (select giorno from oggi) then greatest(now(), t.orario) end)
      - t.orario)) / 60)
    filter (where t.tipo = 'inizio_pausa'), 0))::integer
    as minuti_pausa,

  -- anomalie da controllare
  bool_or(
    (t.tipo = 'entrata'      and t.tipo_prima is not null and t.tipo_prima <> 'uscita')
    or (t.tipo = 'inizio_pausa' and t.tipo_prima is distinct from 'entrata' and t.tipo_prima is distinct from 'fine_pausa')
    or (t.tipo = 'fine_pausa'   and t.tipo_prima is distinct from 'inizio_pausa')
    or (t.tipo = 'uscita'       and (t.tipo_prima is null or t.tipo_prima = 'uscita'))
  ) as sequenza_errata,
  (t.giorno < (select giorno from oggi)
   and (array_agg(t.tipo order by t.orario desc, t.ricevuta_il desc))[1] <> 'uscita') as uscita_mancante,
  (bool_or(t.posizione = 'fuori_zona') and not exists (
     select 1 from public.assegnazioni a
       join public.macchine m on m.id = a.macchina_id
      where a.dipendente_id = t.dipendente_id and a.giorno = t.giorno and a.attivo and m.fuori_sede
  )) as fuori_zona,
  max(t.distanza_m) filter (where t.posizione = 'fuori_zona') as distanza_max_m,
  bool_or(t.posizione = 'non_disponibile') as posizione_mancante,
  bool_or(t.ricevuta_il - t.orario > interval '10 minutes') as arrivate_dopo,
  bool_or(t.origine = 'ufficio') as corrette
from t
group by t.dipendente_id, t.giorno;

comment on view public.timbrature_giorno is 'Presenze per persona e giorno (ora italiana): entrata, uscita, minuti lavorati e di pausa, anomalie (sequenza, uscita mancante, fuori zona senza posa, arrivate dopo, correzioni).';

revoke all on public.timbrature_giorno from anon;
grant select on public.timbrature_giorno to authenticated;
