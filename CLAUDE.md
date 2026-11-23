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

Magazzino e ordini d'acquisto (23/11/2026): piano approvato (vedi ARCHITETTURA.md, Stato di avanzamento). Migrazione `0007_magazzino_ordini.sql` **applicata su `gestionale-dev`** (23/11); passo 2 (giacenze negli Articoli e scheda Magazzino) fatto e provato nel browser come titolare (manca la prova con un operaio); passi 3 (ordini d'acquisto con stampa PDF) e 4 («Registra arrivo») fatti e provati; prossimo: passo 5, avviso di disponibilità nel preventivo; su `gestionale-prod` non va applicata finché non lo dico io.
