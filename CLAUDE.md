# Gestionale aziendale

App web multiutente per gestire **preventivi, produzione, timbrature e anagrafiche**.
Stack: **Next.js** (TypeScript, Tailwind) · **Supabase** (database, login, RLS) · **Vercel** (hosting).

## Fonti delle regole
- `docs/ARCHITETTURA.md`: struttura delle cartelle, ambienti, permessi, convenzioni. Leggilo all'inizio.
- `docs/SCHEMA-DATABASE.md`: fonte di verità sulle tabelle. Va aggiornato a ogni modifica del database.

## Regole di lavoro
1. Sono principiante: spiegami le cose in parole semplici.
2. Prima di modifiche grandi, proponimi un piano e aspetta il mio ok.
3. Ogni nuova tabella deve avere le regole RLS attive.
4. Non usare mai la chiave **secret** di Supabase nel codice che gira nel browser.
5. Le modifiche al database vanno sempre in un nuovo file numerato in `supabase/migrations/` (es. `0003_...sql`), mai a mano dal pannello.
6. Quando una parte funziona, proponimi di fare commit e push.

## Stato delle Anagrafiche
Il mockup è stato confermato il 19/11/2026. La sezione **Anagrafiche** (`src/app/(app)/anagrafiche/`) e la migrazione `supabase/migrations/0002_anagrafiche.sql` sono state riscritte secondo SCHEMA-DATABASE v0.5.
La migrazione 0002 è **applicata su `gestionale-dev`** (19/11/2026, dopo aver tolto la vecchia versione con i listini). Su `gestionale-prod` non va applicata finché non lo dico io.

Categorie merceologiche (23/11/2026): sono tipi di **materiale**, una per articolo e una o più per fornitore; i clienti non ne hanno. Migrazione `0006_categorie_merceologiche.sql` **applicata su `gestionale-dev`** (23/11/2026) e provata nel browser; su `gestionale-prod` non va applicata finché non lo dico io.

Magazzino e ordini d'acquisto (23/11/2026): piano approvato (vedi ARCHITETTURA.md, Stato di avanzamento). Migrazione `0007_magazzino_ordini.sql` **applicata su `gestionale-dev`** (23/11); passo 2 (giacenze negli Articoli e scheda Magazzino) fatto e provato nel browser come titolare (provato anche con un operaio); passi 3 (ordini d'acquisto con stampa PDF), 4 («Registra arrivo») e 5 (avviso di disponibilità nel preventivo) fatti e provati; resta il passo 6 (scarico dalle commesse) con la sezione Produzione; su `gestionale-prod` non va applicata finché non lo dico io.

Inventario per gli operai (23/11/2026): migrazione `0008_inventario_operai.sql` provata in locale e **applicata su `gestionale-dev`** (23/11); provata nel browser con un operaio (23/11); su `gestionale-prod` non va applicata finché non lo dico io.

Multi-azienda (24/11/2026): migrazione `0009_multi_azienda.sql` (SCHEMA-DATABASE sezione 0) provata in locale e **applicata su `gestionale-dev`** (24/11, prima backup nello schema `backup_prima_0009`); test di isolamento con «Azienda di prova B» superato, utente `titolare@nuova.it` e azienda di prova spenti. Su `gestionale-prod` non va applicata finché non lo dico io.

Produzione (25/11/2026): piano approvato (vedi ARCHITETTURA.md, Stato di avanzamento). Commessa = stesso numero del preventivo; gli operai vedono il programma di tutti; orario aziendale unico con eventuale orario personale; postazioni senza macchina; indirizzo solo per la posa. Migrazione `0010_produzione.sql` scritta e provata in locale con PGlite e **applicata su `gestionale-dev`** (25/11); passi 2–6 fatti e provati su `gestionale-dev` (25/11). Su `gestionale-prod` non va applicata finché non lo dico io.

Scarico del magazzino dalle commesse (25/11/2026, Produzione passo 7): migrazione `0011_scarico_commesse.sql` provata in locale con PGlite e **applicata su `gestionale-dev`** (25/11), provata nel browser; su `gestionale-prod` non va applicata finché non lo dico io.

Richieste di ferie e permessi (26/11/2026): chiede chi è collegato a un dipendente (ferie e permessi, non la malattia), decide solo il titolare; migrazione `0012_richieste_assenze.sql` provata in locale con PGlite (34 su 34), **applicata su `gestionale-dev`** (26/11) e provata nel browser come operaio e titolare; su `gestionale-prod` non va applicata finché non lo dico io.

Timbrature (26/11/2026): piano approvato con il controllo «vicino alla ditta» (si segnala, non si blocca; solo esito e distanza, mai le coordinate; spento finché il titolare non lo accende). Migrazione `0013_timbrature.sql` scritta e provata in locale con PGlite (54 su 54), **applicata su `gestionale-dev`** (26/11); passo 2 (scheda «Timbra» e posizione della ditta in Impostazioni) fatto e provato come titolare e operaio (manca la prova della posizione dal telefono, dopo il push); passi 3 (Presenze del giorno), 4 (correzioni) e 5 (Ore del mese ed export CSV) fatti e provati; passo 6 (timbratura senza rete, coda sul telefono) fatto e provato; su `gestionale-prod` non va applicata finché non lo dico io.
