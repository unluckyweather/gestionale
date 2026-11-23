-- =====================================================================
-- 0008_inventario_operai.sql  (23/11/2026)
-- Anche gli OPERAI registrano l'inventario (movimento di tipo "rettifica"):
-- di solito è un operaio a contare il materiale in magazzino.
--
-- Richiede 0007_magazzino_ordini.sql. Si esegue UNA volta per database.
--
-- Cambia solo la regola di inserimento dei movimenti. Gli operai restano
-- senza: arrivi legati agli ordini, annullamento dei movimenti, costi.
-- =====================================================================

drop policy "movimenti_magazzino: inserimento" on public.movimenti_magazzino;

create policy "movimenti_magazzino: inserimento" on public.movimenti_magazzino
  for insert to authenticated
  with check (
    (select public.ha_ruolo('titolare', 'ufficio'))
    -- gli operai: carichi, scarichi e inventari, non legati a un ordine, a proprio nome
    or ((select public.ha_ruolo('operaio'))
        and tipo in ('carico', 'scarico', 'rettifica')
        and riga_ordine_id is null
        and creato_da = (select auth.uid()))
  );
