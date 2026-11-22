# Architettura e regole del progetto – Gestionale

> **Da leggere all'inizio di ogni chat del progetto.**

## Tecnologie
- **Next.js 16 + TypeScript** (App Router, cartella `src/app`), stile con **Tailwind CSS**
- **Supabase**: database PostgreSQL, login, tempo reale (server in UE, Francoforte)
- **Vercel**: hosting (regione Francoforte)
- **GitHub**: repository privato `gestionale`
- Codice sul Mac in `Documenti/Sviluppo/gestionale`

## Mockup di riferimento
**Confermato il 19/11/2026:** "Mockup gestionale – preventivi a fasi" → https://claude.ai/artifact/B5LEbqMxrBA2FJXqQu8U4s
Contiene tutte le schede. Sostituisce il mockup del 15/11 (https://claude.ai/artifact/AupuzjZ62JxYoLTXNoTjMf) e la bozza separata "Anagrafica cliente/fornitore – proposta" (v3, ora inclusa).
Novità del 19/11:
- **Preventivi a fasi** (ore × tariffa + materiali + ricarico): l'azienda lavora su misura (stampa, insegne, wrapping, allestimenti, bandiere), **non c'è un listino di vendita**.
- **Dashboard** con "Ore previste e ore reali" e "Pose e installazioni in programma".
- **Scheda cliente/fornitore completa**: azienda / persona fisica / PA, soggetti esteri, sedi, più contatti, banca e Ri.Ba., scadenze, reverse charge, dichiarazioni d'intento, campi per la fattura elettronica (XML).

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
supabase/prove/          dati inventati da incollare SOLO su gestionale-dev (non sono migrazioni)
docs/                    questi documenti
```

### Com'è fatta una scheda (esempio: `anagrafiche/`)
> In `preventivi/` le parti comuni a preventivi e modelli stanno in: `bozze.ts` (fasi dal database al modulo, copia, costi di oggi, totali), `calcoli.ts` (conti con gli arrotondamenti del database), `perDatabase.ts` (controlli e conversione prima del salvataggio), `letture.ts` (letture condivise), `ElencoFasi.tsx` (fasi, ore, materiali, lastre), `Conferma.tsx` (finestre di conferma dentro la pagina: `window.confirm` non funziona in tutti i browser).

- `page.tsx` legge l'indirizzo (`?scheda=clienti&id=…&q=…`) e mostra la parte giusta: la scheda aperta e la riga scelta stanno nell'indirizzo, così "Indietro" del browser funziona.
- `azioni.ts` (`"use server"`) contiene i salvataggi: controllano il ruolo, validano, scrivono e tornano alla pagina con un messaggio.
- I moduli lunghi sono componenti `"use client"` con `useActionState`: se il salvataggio non va, il modulo resta compilato e mostra l'errore.

## Regole
1. **Il database si cambia solo con file in `supabase/migrations/`**, numerati in ordine (`0001_fondamenta.sql`, `0002_anagrafiche.sql`, `0003_preventivi.sql`, `0004_lastre.sql`…), mai a mano dal pannello. Così lo stesso schema si ricrea identico su `gestionale-prod`. Per ora una migrazione si applica incollando il file intero in Supabase → **SQL Editor** → Run (una volta sola per database). Una migrazione **non ancora applicata** da nessuna parte si può ancora correggere; una già applicata no (si crea la successiva).
2. **`docs/SCHEMA-DATABASE.md` è la fonte di verità** sulle tabelle: chi cambia una tabella lo aggiorna.
3. Le **tabelle condivise** (`profili`, `dipendenti`, `soggetti`, `articoli`, `codici_iva`, `preventivi`, `numeratori`, `commesse`, `registro_modifiche`) si modificano con cautela: altre sezioni le usano.
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
| **Anagrafiche** | clienti/fornitori (azienda, persona, PA, esteri), contatti, sedi, banca e scadenze, reverse charge, dichiarazioni d'intento; catalogo materiali; codici IVA, pagamenti, banche aziendali | Fondamenta |
| **Preventivi** | preventivi a fasi (ore × tariffa + materiali + ricarico), tariffe orarie, modelli di lavorazione, PDF per il cliente, invio email ai contatti giusti | Anagrafiche |
| **Produzione** | commesse (con ore previste e sede di posa), task, pose fuori sede, piano settimanale | Preventivi |
| **Timbrature** | timbratura da telefono (anche offline), presenze, export | Fondamenta, Produzione |
| **Dashboard** | indicatori, attività recenti, ore previste/reali, pose in programma | tutte |

Ogni chat di sezione inizia con: *"Leggi ARCHITETTURA.md e SCHEMA-DATABASE.md, poi lavoriamo sulla sezione X"*.

## Stato di avanzamento
- [x] Account (GitHub, Supabase, Vercel), strumenti sul Mac
- [x] Scheletro Next.js collegato a Supabase, codice su GitHub
- [x] Bozza schema database (v0.1)
- [x] Fondamenta: migrazione `0001_fondamenta.sql`, login, profili e ruoli, dipendenti, registro modifiche, impaginazione, pagina Impostazioni
- [x] Fondamenta: migrazione applicata su `gestionale-dev`, login del titolare funzionante
- [x] Primo deploy su Vercel (regione Francoforte, collegato a `gestionale-dev`; ogni `git push` aggiorna il sito). Vercel ha accesso solo al repository `gestionale`
- [x] Anagrafiche (prima versione): `0002_anagrafiche.sql` e pagina Anagrafiche con 5 schede. **Superata dal mockup del 19/11**. Era stata applicata per errore su `gestionale-dev`: tolta il 19/11 (tabelle, funzioni e tipi della vecchia versione) prima di applicare la nuova
- [x] Mockup confermato (19/11): preventivi a fasi + scheda cliente/fornitore v3; schema v0.5
- [x] Anagrafiche: `0002_anagrafiche.sql` e pagina **riscritte** secondo SCHEMA-DATABASE v0.5 (sezione 2): schede Clienti, Fornitori, Articoli, "Codici IVA, pagamenti e banche"; scheda cliente/fornitore completa come nel mockup, storico modifiche per il titolare
- [x] Anagrafiche: `0002_anagrafiche.sql` applicata su `gestionale-dev` (19/11)
- [x] Anagrafiche: pagina provata su `gestionale-dev` con dati inventati (19/11)
- [x] Anagrafiche: viste e approvate da titolare e ufficio (22/11). Eventuali correzioni dopo le prove con dati veri
- [x] Preventivi: piano approvato (22/11). Passi: 1) migrazione `0003_preventivi.sql`, 2) tariffe orarie in Impostazioni, 3) elenco preventivi, 4) pagina del preventivo con calcoli dal vivo, 5) modelli e "Duplica", 6) PDF da stampare, 7) PDF vero e invio email (servizio esterno). "Converti in commessa" si fa nella chat Produzione
- [x] Preventivi: `0003_preventivi.sql` scritta e provata in locale con l'esempio del mockup e i 4 ruoli (22/11)
- [x] Preventivi: `0003_preventivi.sql` applicata su `gestionale-dev` (verificato il 22/11: tabelle e viste presenti, chiuse agli utenti non collegati)
- [x] Preventivi passo 2: tariffe orarie in Impostazioni (solo titolare), scritto (22/11) — da provare su `gestionale-dev`
- [x] Preventivi passo 3: elenco con ricerca (cliente, numero, oggetto), filtri per stato con i numeri, "archiviati", anteprima con fasi e totali dalla vista `preventivi_riepilogo` (22/11) — da provare su `gestionale-dev` con `supabase/prove/dati_prova_preventivi.sql`
- [x] Preventivi passo 4: pagina del preventivo (`?id=…`, `?id=nuovo`) con fasi, ore, materiali (catalogo o liberi, bobine) e riepilogo dal vivo con le stesse regole di arrotondamento del database (`preventivi/calcoli.ts`); salvataggio con `salva_preventivo`, cambio di stato, archivia/ripristina (22/11) — provato su `gestionale-dev` come titolare
- [x] Preventivi: materiali a lastra (lastre intere o m² usati + scarto, margine di taglio): `0004_lastre.sql` scritta e provata in locale con PGlite (22/11); catalogo articoli con misure della lastra
- [x] Preventivi: `0004_lastre.sql` applicata su `gestionale-dev` e provata nel browser (22/11): articolo a lastra nel catalogo, righe a lastre intere e a m² usati, totali uguali al database
- [x] Preventivi passo 5 (22/11): scheda «Modelli di lavorazione» (elenco con costo e prezzo indicativi ai costi di oggi, pagina del modello, archivia/ripristina); nel preventivo «Parti da un modello» (aggiungi o sostituisci le fasi, costi di oggi), «Salva come modello» e «Duplica» (nuova bozza, si sceglie se tenere i costi o aggiornarli a oggi; il prezzo corretto a mano non si copia). Nessuna migrazione nuova. Provato su `gestionale-dev` come titolare
- [ ] Preventivi: passi 6–7
- [ ] Produzione
- [ ] Timbrature
- [ ] Dashboard

### Da fare più avanti (Fondamenta)
- Pagina "password dimenticata" (reset in autonomia), prima di dare l'app ai dipendenti veri
- Decidere la quinta scheda (la fatturazione elettronica è candidata: l'anagrafica ha già i dati)
- In produzione: progetto Vercel collegato a `gestionale-prod`, dominio aziendale

### Da fare più avanti (Anagrafiche)
- Verificare con il commercialista: reverse charge (TD16–TD19), dichiarazioni d'intento, elenco codici IVA/nature, condizioni di pagamento a rate
- Scheda cliente: numero di preventivi e commesse collegati (quando esisteranno quelle tabelle)
- Se gli operai devono vedere nome cliente o indirizzo di posa: vista apposita (oggi non leggono `soggetti`)
- **Import da FileMaker** (decisione 22/11: si fa alla fine, prima di passare a `gestionale-prod`): pulsante/script che legge i file XML esportati da FileMaker (fornitori, clienti, riferimenti, altre sedi, condizioni di pagamento). Servirà un campo nascosto con il vecchio codice FileMaker (es. 914) per collegare contatti e sedi alla scheda giusta: va aggiunto con una nuova migrazione in quel momento. Scarti (P.IVA non valide, doppioni) in un elenco da sistemare a mano
- **Test fattura elettronica XML** (decisione 22/11): dopo i Preventivi, generare un XML di prova (cliente italiano, estero, PA con split payment, esportatore abituale, fornitore in reverse charge) e verificarlo con un validatore e con il commercialista, per capire se i dati dell'anagrafica bastano. Serviranno anche modalità di pagamento (MP05, MP12…) e rate nelle condizioni di pagamento
