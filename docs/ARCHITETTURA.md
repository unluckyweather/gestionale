# Architettura e regole del progetto – Gestionale

> **Da leggere all'inizio di ogni chat del progetto.**

## Tecnologie
- **Next.js 16 + TypeScript** (App Router, cartella `src/app`), stile con **Tailwind CSS**
- **Supabase**: database PostgreSQL, login, tempo reale (server in UE, Francoforte)
- **Vercel**: hosting (regione Francoforte)
- **GitHub**: repository privato `gestionale`
- Codice sul Mac in `Documenti/Sviluppo/gestionale`

## Ambienti
| | Supabase | Uso |
|---|---|---|
| Sviluppo | `gestionale-dev` (piano Free) | prove, dati inventati |
| Produzione | `gestionale-prod` (dopo l'approvazione) | dati reali |

## Struttura delle cartelle
```
src/
  proxy.ts               eseguito prima di ogni pagina: rinnova il login, manda a /login chi non è collegato
  app/
    login/               pagina di accesso (pubblica)
    account-non-attivo/  avviso per account non ancora attivati
    (app)/               tutte le pagine riservate (le parentesi non compaiono nell'indirizzo)
      layout.tsx         barra laterale + controllo utente attivo
      page.tsx           Dashboard
      preventivi/ produzione/ timbrature/ anagrafiche/ impostazioni/
  components/            pezzi di interfaccia riutilizzabili (BarraLaterale, ElencoDipendenti…)
  lib/
    validazioni.ts       controlli P.IVA / codice fiscale (cifra di controllo), lettura numeri "12,50", formato euro
    ruoli.ts             ruoli e SEZIONI: chi vede quale scheda (unico punto da modificare)
    utente.ts            leggiUtente(), richiediUtente(), richiediRuolo(), richiediSezione()
    azioni-accesso.ts    login e logout
    supabase/            collegamento al database (browser, server, proxy)
supabase/migrations/     file SQL che creano e modificano le tabelle (numerati)
docs/                    questi documenti
```

### Com'è fatta una scheda (esempio: `anagrafiche/`)
- `page.tsx` legge l'indirizzo (`?scheda=clienti&id=…&q=…`) e mostra la parte giusta: la scheda aperta e la riga scelta stanno nell'indirizzo, così "Indietro" del browser funziona.
- `azioni.ts` (`"use server"`) contiene i salvataggi: controllano il ruolo, validano, scrivono e tornano alla pagina con un messaggio.
- I moduli lunghi sono componenti `"use client"` con `useActionState`: se il salvataggio non va, il modulo resta compilato e mostra l'errore.

## Regole
1. **Il database si cambia solo con file in `supabase/migrations/`**, numerati in ordine (`0001_fondamenta.sql`, `0002_anagrafiche.sql`…), mai a mano dal pannello. Così lo stesso schema si ricrea identico su `gestionale-prod`. Per ora una migrazione si applica incollando il file intero in Supabase → **SQL Editor** → Run (una volta sola per database).
2. **`docs/SCHEMA-DATABASE.md` è la fonte di verità** sulle tabelle: chi cambia una tabella lo aggiorna.
3. Le **tabelle condivise** (`profili`, `dipendenti`, `soggetti`, `articoli`, `commesse`, `registro_modifiche`) si modificano con cautela: altre sezioni le usano.
4. Interfaccia e nomi in **italiano**.
5. Le chiavi stanno solo in `.env.local` (mai su GitHub, mai in chat).
6. A fine lavoro: `git add .` → `git commit -m "..."` → `git push`.
7. **Permessi su due livelli:**
   - nel **database** (Row Level Security): è la protezione vera, vale anche se qualcuno aggira l'app;
   - nell'**app**: ogni pagina riservata inizia con `await richiediSezione("/nome-scheda")`, che usa l'elenco `SEZIONI` di `lib/ruoli.ts` (lo stesso che decide le voci di menu). Ogni azione server che scrive dati controlla il ruolo con `richiediRuolo(...)`.
8. **Ogni nuova tabella** ha: RLS attiva, `revoke all ... from anon`, i trigger `b_aggiornamento` (`imposta_aggiornamento`), `vieta_cancellazione` e, se va tracciata, `z_registro` (`registra_modifica`). Esempi in `0001_fondamenta.sql`.
9. Nelle regole RLS si usano le funzioni `public.ha_ruolo('titolare', 'ufficio', …)` e `public.ruolo_corrente()`, scritte tra parentesi `(select …)` perché il database le calcoli una volta sola.

## Utenti e accessi
- Non c'è registrazione libera: **Supabase → Authentication → Sign In / Providers → disattivare "Allow new users to sign up"**.
- I nuovi account si creano da Supabase (Authentication → Users → **Add user**, con "Auto Confirm User"). Il profilo nasce **disattivato, ruolo operaio**; il titolare lo attiva e sceglie il ruolo in **Impostazioni**.
- Nessuno può cambiare il proprio ruolo o disattivarsi da solo (protezione nel database).
- Password dimenticata: per ora la reimposta il titolare da Supabase (Authentication → Users → utente → Reset password / Update password).

## Organizzazione delle chat
| Chat | Cosa fa | Dipende da |
|---|---|---|
| **Fondamenta** | login, profili, ruoli, dipendenti, registro modifiche, impaginazione | — |
| **Anagrafiche** | clienti/fornitori, articoli, listini, condizioni di pagamento | Fondamenta |
| **Preventivi** | preventivi, righe, PDF, invio email | Anagrafiche |
| **Produzione** | commesse, task, piano settimanale | Preventivi |
| **Timbrature** | timbratura da telefono (anche offline), presenze, export | Fondamenta, Produzione |
| **Dashboard** | indicatori e attività recenti | tutte |

Ogni chat di sezione inizia con: *"Leggi ARCHITETTURA.md e SCHEMA-DATABASE.md, poi lavoriamo sulla sezione X"*.

## Stato di avanzamento
- [x] Account (GitHub, Supabase, Vercel), strumenti sul Mac
- [x] Scheletro Next.js collegato a Supabase, codice su GitHub
- [x] Bozza schema database (v0.1)
- [x] Fondamenta: migrazione `0001_fondamenta.sql`, login, profili e ruoli, dipendenti, registro modifiche, impaginazione, pagina Impostazioni
- [x] Fondamenta: migrazione applicata su `gestionale-dev`, login del titolare funzionante
- [x] Primo deploy su Vercel (regione Francoforte, collegato a `gestionale-dev`; ogni `git push` aggiorna il sito). Vercel ha accesso solo al repository `gestionale`
- [x] Anagrafiche: migrazione `0002_anagrafiche.sql` (clienti/fornitori, articoli, listini con prezzi per articolo, condizioni di pagamento) e pagina Anagrafiche con 5 schede (Clienti, Fornitori, Dipendenti, Articoli, Pagamenti e listini). Elenco dipendenti condiviso con Impostazioni (`components/ElencoDipendenti.tsx`)
- [ ] Anagrafiche: applicare `0002_anagrafiche.sql` su `gestionale-dev` e provare con dati inventati
- [ ] Preventivi
- [ ] Produzione
- [ ] Timbrature
- [ ] Dashboard

### Da fare più avanti (Fondamenta)
- Pagina "password dimenticata" (reset in autonomia), prima di dare l'app ai dipendenti veri
- Decidere la quinta scheda prima della chat Preventivi
- In produzione: progetto Vercel collegato a `gestionale-prod`, dominio aziendale

### Da fare più avanti (Anagrafiche)
- Scheda cliente: numero di preventivi e commesse collegati (quando esisteranno quelle tabelle)
- Se gli operai devono vedere il nome del cliente nelle commesse: regola o vista apposita (oggi non leggono `soggetti`)
- Eventuale import iniziale di clienti/articoli da file (CSV/Excel) prima di passare a `gestionale-prod`
