-- =====================================================================
-- Copia di sicurezza di gestionale-dev PRIMA della 0009 (multi-azienda).
-- NON è una migrazione: si esegue una volta, SOLO su gestionale-dev.
--
-- Copia i dati di tutte le tabelle di "public" nello schema
-- backup_prima_0009 (stesso database). Gli utenti dell'app non lo vedono.
-- Limite: se sparisse l'intero progetto Supabase, sparirebbe anche la copia.
--
-- Per buttarla quando non serve più:
--   drop schema backup_prima_0009 cascade;
-- =====================================================================
create schema backup_prima_0009;
revoke all on schema backup_prima_0009 from public, anon, authenticated;

do $$
declare
  t text;
begin
  for t in
    select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name
  loop
    execute format('create table backup_prima_0009.%I as table public.%I', t, t);
  end loop;
end;
$$;

-- controllo: righe copiate per tabella
select c.relname as tabella, c.reltuples::bigint as righe_stimate,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from backup_prima_0009.%I', c.relname), false, true, '')))[1]::text::int as righe
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'backup_prima_0009' and c.relkind = 'r'
 order by 1;
