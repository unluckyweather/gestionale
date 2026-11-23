-- =====================================================================
-- 0006_categorie_merceologiche.sql
-- Le categorie merceologiche (Bobine, Lastre, Adesivi…) diventano il tipo
-- di MATERIALE, non più una divisione dei clienti:
--   - la tabella categorie_soggetto si chiama ora categorie_merceologiche;
--   - ogni articolo può avere UNA categoria (articoli.categoria_id);
--   - ogni fornitore può avere PIÙ categorie (nuova tabella fornitori_categorie),
--     così si filtrano i fornitori per ciò che vendono;
--   - i clienti non hanno più categoria: soggetti.categoria_id si toglie
--     (le categorie già date ai fornitori si copiano prima nella nuova tabella).
-- Vedi docs/SCHEMA-DATABASE.md.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. La tabella delle categorie cambia nome (trigger e regole RLS la seguono)
-- ---------------------------------------------------------------------
alter table public.categorie_soggetto rename to categorie_merceologiche;
alter index public.categorie_soggetto_descrizione_unica rename to categorie_merceologiche_descrizione_unica;
alter policy "categorie_soggetto: lettura"     on public.categorie_merceologiche rename to "categorie_merceologiche: lettura";
alter policy "categorie_soggetto: inserimento" on public.categorie_merceologiche rename to "categorie_merceologiche: inserimento";
alter policy "categorie_soggetto: modifica"    on public.categorie_merceologiche rename to "categorie_merceologiche: modifica";

comment on table public.categorie_merceologiche is
  'Categorie merceologiche dei materiali (es. Bobine, Lastre, Adesivi): una per articolo, una o più per fornitore.';


-- ---------------------------------------------------------------------
-- 2. Articoli: una categoria facoltativa
-- ---------------------------------------------------------------------
alter table public.articoli
  add column categoria_id uuid references public.categorie_merceologiche (id);

create index articoli_categoria on public.articoli (categoria_id);


-- ---------------------------------------------------------------------
-- 3. fornitori_categorie — quali categorie vende ogni fornitore
--    Una riga per coppia fornitore/categoria. Non si cancella: si archivia
--    (attivo = false) e si riattiva se la categoria torna.
-- ---------------------------------------------------------------------
create table public.fornitori_categorie (
  id             uuid primary key default gen_random_uuid(),
  soggetto_id    uuid not null references public.soggetti (id),
  categoria_id   uuid not null references public.categorie_merceologiche (id),
  attivo         boolean not null default true,
  creato_il      timestamptz not null default now(),
  creato_da      uuid default auth.uid() references public.profili (id),
  aggiornato_il  timestamptz not null default now(),
  aggiornato_da  uuid default auth.uid() references public.profili (id),
  unique (soggetto_id, categoria_id)
);

comment on table public.fornitori_categorie is 'Categorie merceologiche vendute da ogni fornitore (anche più di una).';

create index fornitori_categorie_categoria on public.fornitori_categorie (categoria_id) where attivo;

-- solo fornitori (o "entrambi") possono avere categorie
create or replace function public.controlla_fornitore_categoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attivo and not exists (
    select 1 from public.soggetti s where s.id = new.soggetto_id and s.tipo in ('fornitore', 'entrambi')
  ) then
    raise exception 'Le categorie merceologiche si scelgono solo per i fornitori.';
  end if;
  return new;
end;
$$;

create trigger a_controlla before insert or update on public.fornitori_categorie
  for each row execute function public.controlla_fornitore_categoria();
create trigger b_aggiornamento before update on public.fornitori_categorie
  for each row execute function public.imposta_aggiornamento();
create trigger vieta_cancellazione before delete on public.fornitori_categorie
  for each row execute function public.vieta_cancellazione();
create trigger z_registro after insert or update on public.fornitori_categorie
  for each row execute function public.registra_modifica();

-- Sicurezza: come le altre anagrafiche
alter table public.fornitori_categorie enable row level security;
revoke all on public.fornitori_categorie from anon;
create policy "fornitori_categorie: lettura" on public.fornitori_categorie
  for select to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio', 'contabilita')));
create policy "fornitori_categorie: inserimento" on public.fornitori_categorie
  for insert to authenticated
  with check ((select public.ha_ruolo('titolare', 'ufficio')));
create policy "fornitori_categorie: modifica" on public.fornitori_categorie
  for update to authenticated
  using ((select public.ha_ruolo('titolare', 'ufficio')))
  with check ((select public.ha_ruolo('titolare', 'ufficio')));


-- ---------------------------------------------------------------------
-- 4. Le categorie già date ai fornitori si copiano; poi il campo si toglie
--    (quelle date ai soli clienti si perdono: i clienti non hanno più categoria)
-- ---------------------------------------------------------------------
insert into public.fornitori_categorie (soggetto_id, categoria_id, attivo)
select id, categoria_id, attivo
  from public.soggetti
 where categoria_id is not null and tipo in ('fornitore', 'entrambi');

-- salva_soggetto usa il campo: si toglie prima la funzione, poi il campo
drop function public.salva_soggetto(uuid, jsonb, jsonb, jsonb, jsonb);
alter table public.soggetti drop column categoria_id;


-- ---------------------------------------------------------------------
-- 5. salva_soggetto — come in 0002, senza categoria_id e con un elenco
--    in più: p_categorie (id delle categorie del fornitore)
-- ---------------------------------------------------------------------
create or replace function public.salva_soggetto(
  p_id            uuid,
  p_soggetto      jsonb,
  p_contatti      jsonb default '[]',
  p_sedi          jsonb default '[]',
  p_dichiarazioni jsonb default '[]',
  p_categorie     jsonb default '[]'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id    uuid := p_id;
  v_riga  jsonb;
  v_tenuti uuid[];
  v_tipo  public.tipo_soggetto;
begin
  -- 1. il soggetto
  if v_id is null then
    insert into public.soggetti (
      tipo, forma, ragione_sociale, cognome, nome, nome_breve, sito_web,
      paese_iva, partita_iva, codice_fiscale, codice_sdi, codice_ufficio_pa, split_payment, pec,
      codice_iva_abituale_id, indirizzo, civico, cap, comune, provincia, nazione,
      iban, abi, cab, banca_agenzia, banca_aziendale_id, note_riba,
      condizione_pagamento_id, mese_escluso_1, mese_escluso_2, giorno_fisso,
      reverse_charge, rc_tipo_documento, rc_natura, rc_codice_iva_id,
      note_interne, note_documenti, privacy_inviata_il, privacy_firmata_il
    )
    select
      coalesce(r.tipo, 'cliente'), coalesce(r.forma, 'azienda'), r.ragione_sociale, r.cognome, r.nome, r.nome_breve, r.sito_web,
      r.paese_iva, r.partita_iva, r.codice_fiscale, r.codice_sdi, r.codice_ufficio_pa,
      coalesce(r.split_payment, false), r.pec,
      r.codice_iva_abituale_id, r.indirizzo, r.civico, r.cap, r.comune, r.provincia, r.nazione,
      r.iban, r.abi, r.cab, r.banca_agenzia, r.banca_aziendale_id, r.note_riba,
      r.condizione_pagamento_id, r.mese_escluso_1, r.mese_escluso_2, r.giorno_fisso,
      coalesce(r.reverse_charge, false), r.rc_tipo_documento, r.rc_natura, r.rc_codice_iva_id,
      r.note_interne, r.note_documenti, r.privacy_inviata_il, r.privacy_firmata_il
    from jsonb_populate_record(null::public.soggetti, p_soggetto) r
    returning id into v_id;
  else
    update public.soggetti s set (
      tipo, forma, ragione_sociale, cognome, nome, nome_breve, sito_web,
      paese_iva, partita_iva, codice_fiscale, codice_sdi, codice_ufficio_pa, split_payment, pec,
      codice_iva_abituale_id, indirizzo, civico, cap, comune, provincia, nazione,
      iban, abi, cab, banca_agenzia, banca_aziendale_id, note_riba,
      condizione_pagamento_id, mese_escluso_1, mese_escluso_2, giorno_fisso,
      reverse_charge, rc_tipo_documento, rc_natura, rc_codice_iva_id,
      note_interne, note_documenti, privacy_inviata_il, privacy_firmata_il, attivo
    ) = (
      select
        coalesce(r.tipo, 'cliente'), coalesce(r.forma, 'azienda'), r.ragione_sociale, r.cognome, r.nome, r.nome_breve, r.sito_web,
        r.paese_iva, r.partita_iva, r.codice_fiscale, r.codice_sdi, r.codice_ufficio_pa,
        coalesce(r.split_payment, false), r.pec,
        r.codice_iva_abituale_id, r.indirizzo, r.civico, r.cap, r.comune, r.provincia, r.nazione,
        r.iban, r.abi, r.cab, r.banca_agenzia, r.banca_aziendale_id, r.note_riba,
        r.condizione_pagamento_id, r.mese_escluso_1, r.mese_escluso_2, r.giorno_fisso,
        coalesce(r.reverse_charge, false), r.rc_tipo_documento, r.rc_natura, r.rc_codice_iva_id,
        r.note_interne, r.note_documenti, r.privacy_inviata_il, r.privacy_firmata_il,
        coalesce(r.attivo, true)
      from jsonb_populate_record(null::public.soggetti, p_soggetto) r
    )
    where s.id = v_id;
    if not found then
      raise exception 'Scheda non trovata o permessi insufficienti.';
    end if;
  end if;

  select tipo into v_tipo from public.soggetti where id = v_id;

  -- 2. contatti
  v_tenuti := '{}';
  for v_riga in select * from jsonb_array_elements(coalesce(p_contatti, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.contatti_soggetto
        (soggetto_id, riferimento, persona, email, telefono, cellulare, riceve_preventivi, riceve_fatture)
      select v_id, r.riferimento, r.persona, r.email, r.telefono, r.cellulare,
             coalesce(r.riceve_preventivi, false), coalesce(r.riceve_fatture, false)
        from jsonb_populate_record(null::public.contatti_soggetto, v_riga - 'id') r
      returning jsonb_build_object('id', id) into v_riga;  -- serve l'id nuovo, per non archiviarlo sotto
    else
      update public.contatti_soggetto c set
        (riferimento, persona, email, telefono, cellulare, riceve_preventivi, riceve_fatture, attivo) = (
          select r.riferimento, r.persona, r.email, r.telefono, r.cellulare,
                 coalesce(r.riceve_preventivi, false), coalesce(r.riceve_fatture, false), true
            from jsonb_populate_record(null::public.contatti_soggetto, v_riga) r)
       where c.id = (v_riga ->> 'id')::uuid and c.soggetto_id = v_id;
      if not found then
        raise exception 'Contatto non trovato.';
      end if;
    end if;
    v_tenuti := v_tenuti || (v_riga ->> 'id')::uuid;
  end loop;
  update public.contatti_soggetto set attivo = false
   where soggetto_id = v_id and attivo and id <> all (v_tenuti);

  -- 3. sedi (operativa e altre)
  v_tenuti := '{}';
  -- prima si archiviano le sedi tolte, così una nuova sede operativa non urta la vecchia
  update public.sedi_soggetto set attivo = false
   where soggetto_id = v_id and attivo
     and id::text not in (
       select coalesce(e ->> 'id', '') from jsonb_array_elements(coalesce(p_sedi, '[]')) e);
  for v_riga in select * from jsonb_array_elements(coalesce(p_sedi, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.sedi_soggetto
        (soggetto_id, tipo, nome, indirizzo, civico, cap, comune, provincia, nazione, telefono, annotazioni, consegna)
      select v_id, coalesce(r.tipo, 'altra'), r.nome, r.indirizzo, r.civico, r.cap, r.comune, r.provincia,
             r.nazione, r.telefono, r.annotazioni, coalesce(r.consegna, false)
        from jsonb_populate_record(null::public.sedi_soggetto, v_riga - 'id') r;
    else
      update public.sedi_soggetto x set
        (tipo, nome, indirizzo, civico, cap, comune, provincia, nazione, telefono, annotazioni, consegna, attivo) = (
          select coalesce(r.tipo, 'altra'), r.nome, r.indirizzo, r.civico, r.cap, r.comune, r.provincia,
                 r.nazione, r.telefono, r.annotazioni, coalesce(r.consegna, false), true
            from jsonb_populate_record(null::public.sedi_soggetto, v_riga) r)
       where x.id = (v_riga ->> 'id')::uuid and x.soggetto_id = v_id;
      if not found then
        raise exception 'Sede non trovata.';
      end if;
    end if;
  end loop;

  -- 4. dichiarazioni d'intento (solo clienti)
  if v_tipo = 'fornitore' and jsonb_array_length(coalesce(p_dichiarazioni, '[]')) > 0 then
    raise exception 'Le dichiarazioni d''intento si registrano solo per i clienti.';
  end if;
  v_tenuti := '{}';
  for v_riga in select * from jsonb_array_elements(coalesce(p_dichiarazioni, '[]')) loop
    if coalesce(v_riga ->> 'id', '') = '' then
      insert into public.dichiarazioni_intento (soggetto_id, protocollo, data, anno, importo)
      select v_id, r.protocollo, r.data, r.anno, r.importo
        from jsonb_populate_record(null::public.dichiarazioni_intento, v_riga - 'id') r
      returning jsonb_build_object('id', id) into v_riga;
    else
      update public.dichiarazioni_intento d set (protocollo, data, anno, importo, attivo) = (
          select r.protocollo, r.data, r.anno, r.importo, true
            from jsonb_populate_record(null::public.dichiarazioni_intento, v_riga) r)
       where d.id = (v_riga ->> 'id')::uuid and d.soggetto_id = v_id;
      if not found then
        raise exception 'Dichiarazione d''intento non trovata.';
      end if;
    end if;
    v_tenuti := v_tenuti || (v_riga ->> 'id')::uuid;
  end loop;
  update public.dichiarazioni_intento set attivo = false
   where soggetto_id = v_id and attivo and id <> all (v_tenuti);

  -- 5. categorie merceologiche (solo fornitori): elenco di id di categorie.
  --    Le categorie tolte si archiviano; una tolta e poi rimessa si riattiva.
  if v_tipo = 'cliente' and jsonb_array_length(coalesce(p_categorie, '[]')) > 0 then
    raise exception 'Le categorie merceologiche si scelgono solo per i fornitori.';
  end if;
  insert into public.fornitori_categorie (soggetto_id, categoria_id)
  select distinct v_id, c::uuid
    from jsonb_array_elements_text(coalesce(p_categorie, '[]')) c
  on conflict (soggetto_id, categoria_id) do update set attivo = true
   where not public.fornitori_categorie.attivo;
  update public.fornitori_categorie set attivo = false
   where soggetto_id = v_id and attivo
     and categoria_id::text not in (select jsonb_array_elements_text(coalesce(p_categorie, '[]')));

  return v_id;
end;
$$;

revoke execute on function public.salva_soggetto(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.salva_soggetto(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
