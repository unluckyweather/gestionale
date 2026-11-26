-- =====================================================================
-- 0014_timbrature_arrivate_dopo.sql  (26/11/2026)
-- Correzione della vista timbrature_giorno (0013).
--
-- Richiede 0001…0013. Si esegue UNA volta per database.
--
-- Problema: «arrivate_dopo» (segnalata nell'app come «arrivata dopo
-- (senza rete)») confrontava l'ora della timbratura con l'ora in cui è
-- arrivata al server per TUTTE le timbrature. Una timbratura dimenticata
-- aggiunta dall'ufficio ha sempre l'ora nel passato, quindi risultava
-- «arrivata dopo» anche se non c'entra la rete.
-- Correzione: contano solo le timbrature dal telefono (origine
-- 'telefono'). Le correzioni restano segnalate da «corrette».
-- Stesse colonne, stesso ordine: nient'altro cambia.
-- =====================================================================

create or replace view public.timbrature_giorno
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
  bool_or(t.origine = 'telefono' and t.ricevuta_il - t.orario > interval '10 minutes') as arrivate_dopo,
  bool_or(t.origine = 'ufficio') as corrette
from t
group by t.dipendente_id, t.giorno;

comment on view public.timbrature_giorno is 'Presenze per persona e giorno (ora italiana): entrata, uscita, minuti lavorati e di pausa, anomalie (sequenza, uscita mancante, fuori zona senza posa, arrivate dopo, correzioni).';

revoke all on public.timbrature_giorno from anon;
grant select on public.timbrature_giorno to authenticated;
