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

## In attesa di approvazione
La sezione **Anagrafiche** (`src/app/(app)/anagrafiche/`) e la migrazione `supabase/migrations/0002_anagrafiche.sql` aspettano che il mio datore di lavoro approvi il mockup.
Finché non lo dico io: **non applicare la migrazione al database** e **non modificare le Anagrafiche**.
