# Schema del database – Gestionale

> **Documento di riferimento condiviso.** Ogni chat del progetto lo legge prima di toccare il database.
> Chi aggiunge o modifica una tabella aggiorna questo file nello stesso momento.
> Stato: **v1.0** (24/11/2026) – **Multi-azienda in `0009_multi_azienda.sql` (applicata su `gestionale-dev` il 24/11, sezione 0)**. Fondamenta in `0001_fondamenta.sql` e Anagrafiche in `0002_anagrafiche.sql` (entrambe applicate su `gestionale-dev`). Preventivi in `0003_preventivi.sql` (applicata su `gestionale-dev`). Materiali a lastra in `0004_lastre.sql`, stampa in `0005_stampa.sql` (entrambe applicate su `gestionale-dev`). Categorie merceologiche dei materiali in `0006_categorie_merceologiche.sql` (applicata su `gestionale-dev`). Magazzino e ordini d'acquisto in `0007_magazzino_ordini.sql` (applicata su `gestionale-dev` il 23/11); inventario anche per gli operai in `0008_inventario_operai.sql` (applicata su `gestionale-dev` il 23/11). Le altre sezioni sono bozza.
> Mockup confermato (19/11): https://claude.ai/artifact/B5LEbqMxrBA2FJXqQu8U4s — preventivi a fasi + scheda cliente/fornitore "proposta v3".

## Regole comuni a tutte le tabelle
- Nomi in italiano, minuscolo, con trattino basso (`ragione_sociale`). Tabelle al plurale.
- Ogni tabella ha: `id` (uuid), `creato_il`, `creato_da`, `aggiornato_il`, `aggiornato_da` (eccezione: `registro_modifiche`, che è già un registro).
  - `creato_*` hanno valori predefiniti (`now()`, `auth.uid()`); `aggiornato_*` li scrive il trigger `b_aggiornamento`, che impedisce anche di alterare `creato_*`.
- Le righe non si cancellano mai davvero: si usa `attivo = false` (o `archiviato_il`), per non perdere lo storico. Il trigger `vieta_cancellazione` lo impone.
- Gli stati sono elenchi fissi (enum), scritti in minuscolo: es. `bozza`, `inviato`.
- Importi in euro con 2 decimali (`numeric(12,2)`), date e orari con fuso orario (`timestamptz`).
- Ogni tabella ha la Row Level Security attiva: i permessi per ruolo stanno nel database. Gli utenti non collegati (`anon`) non hanno accesso (`revoke all ... from anon`).

## Funzioni comuni (create in 0001)
| funzione | a cosa serve |
|---|---|
| `ruolo_corrente()` | ruolo dell'utente collegato, `null` se non attivo |
| `ha_ruolo('titolare', 'ufficio', …)` | vero se l'utente è attivo e ha uno dei ruoli; da usare nelle regole RLS come `(select public.ha_ruolo(...))` |
| `imposta_aggiornamento()` | trigger `before update`: compila `aggiornato_il/_da` |
| `vieta_cancellazione()` | trigger `before delete`: blocca la cancellazione |
| `registra_modifica()` | trigger `after insert or update`: scrive in `registro_modifiche` (azione `archiviazione` se `attivo` passa a false o si compila `archiviato_il`) |

Nomi dei trigger: `a_…` protezioni, `b_aggiornamento`, `z_registro` (Postgres li esegue in ordine alfabetico).

---

## 0. Predisposizione multi-azienda — ✅ applicata in `0009_multi_azienda.sql` (su `gestionale-dev` il 24/11)

**Perché:** lo stesso gestionale potrà servire più aziende clienti, ognuna con i suoi dati, nello stesso database. Ogni riga "sa" di quale azienda è (`azienda_id`) e il database mostra a ogni utente **solo le righe della sua azienda**. Per ora esiste una sola azienda: per chi usa l'app non cambia niente.

**Decisioni (approvate il 24/11):**
- `azienda` smette di essere "una sola riga" e diventa **l'elenco delle aziende** (tolti la colonna `unica` e il vincolo `azienda_una_sola`). Ogni utente appartiene a **una** azienda (`profili.azienda_id`).
- Le aziende nuove si creano **solo dal SQL Editor** con `crea_azienda(…)`; dall'app il titolare modifica solo i dati della propria (niente più "inserimento" in Impostazioni).
- `azienda.attivo = false` **spegne un'azienda**: i suoi utenti risultano non attivi (vedono «account non attivo»).

### Funzioni nuove
| funzione | a cosa serve |
|---|---|
| `azienda_corrente()` | `azienda_id` del profilo collegato; `null` se non collegato. `security definer`, si usa come `(select public.azienda_corrente())` |
| `allinea_azienda()` | trigger `a0_azienda` (prima di tutti gli altri `a_…`): nelle righe figlie **copia** l'`azienda_id` dal padre se manca e **controlla** che padre e tabelle collegate (cliente, articolo, codice IVA, tariffa…) siano della **stessa azienda**, altrimenti errore. Vieta di cambiare `azienda_id` dopo la creazione |
| `crea_azienda(p_ragione_sociale, p_email_titolare)` | crea l'azienda, le **copia i dati iniziali** (codici IVA, condizioni di pagamento, tariffe orarie d'esempio) e, se c'è l'email, sposta quell'utente nella nuova azienda come titolare attivo. Solo dal SQL Editor (non eseguibile dagli utenti dell'app) |

`ruolo_corrente()` restituisce `null` anche quando l'azienda dell'utente è spenta.

### `azienda_id` in tutte le tabelle con dati aziendali
`uuid not null → azienda`, predefinito `azienda_corrente()` (l'app non lo deve mandare), con indice. Le righe esistenti ricevono l'id dell'azienda di oggi.

| gruppo | tabelle | da dove prende l'azienda |
|---|---|---|
| Fondamenta | `profili`, `dipendenti`, `registro_modifiche` | profilo: assegnata alla creazione; registro: dalla riga registrata |
| Tabelle "di base" | `codici_iva`, `condizioni_pagamento`, `banche_aziendali`, `categorie_merceologiche`, `tariffe_orarie`, `modelli_lavorazione`, `numeratori` | azienda dell'utente |
| Anagrafiche | `soggetti`, `articoli` | azienda dell'utente (controllo su codici IVA, pagamento, banca, categoria, fornitore) |
| figlie dei soggetti | `contatti_soggetto`, `sedi_soggetto`, `dichiarazioni_intento`, `fornitori_categorie` | dal soggetto |
| Preventivi | `preventivi` | azienda dell'utente (controllo su cliente, modello, codice IVA) |
| figlie | `fasi_preventivo` (dal preventivo o dal modello), `ore_fase` e `materiali_fase` (dalla fase; controllo su tariffa e articolo) | dal padre |
| Magazzino | `ordini_acquisto` (controllo sul fornitore), `righe_ordine_acquisto` (dall'ordine; controllo sull'articolo), `movimenti_magazzino` (dall'articolo; controllo sulla riga d'ordine) | dal padre |

### Regole RLS
Ogni tabella sopra (e `azienda` con `id`) riceve **una regola in più, "restrittiva"**: `azienda_id = (select public.azienda_corrente())`, sia per leggere sia per scrivere. Postgres la mette **in "e"** con le regole per ruolo che esistono già: per vedere una riga serve il ruolo giusto **e** la stessa azienda. Le regole per ruolo non cambiano.
- La vista **`magazzino`** (che non usa le regole RLS perché gli operai non leggono `articoli`) riceve il filtro `a.azienda_id = azienda_corrente()`. Le altre viste sono `security_invoker` e seguono già le regole.
- Le funzioni `security definer` (`prossimo_numero`, `numera_*`, `registra_modifica`) lavorano sull'azienda della riga, mai su tutte.

### Vincoli unici e numeratori per azienda
- `numeratori`: chiave `azienda_id + documento + anno` → ogni azienda ha i suoi `1/26`, `2/26`… sia per i **preventivi** sia per gli **ordini d'acquisto** (e poi le commesse). `prossimo_numero(p_azienda_id, p_documento, p_anno)`.
- `preventivi` e `ordini_acquisto`: `unique (azienda_id, anno, progressivo)`.
- Unici "tra gli attivi" anche per azienda: nome di tariffe, modelli, banche; codice dei codici IVA; descrizione di condizioni di pagamento e categorie; P.IVA dei soggetti; protocollo delle dichiarazioni d'intento; codice degli articoli. (Due aziende possono avere lo stesso cliente o lo stesso codice articolo.)

### Utenti
- `al_nuovo_utente`: il nuovo profilo va **nell'azienda più vecchia** (oggi l'unica), disattivato e operaio come prima. Per un'altra azienda lo si sposta con `crea_azienda(…, email)` o dal SQL Editor.
- `a_proteggi`: **nessuno cambia la propria azienda**, e dall'app nessuno cambia l'azienda di nessuno (solo dal SQL Editor).
- `registro_modifiche.azienda_id`: il titolare vede solo lo storico della propria azienda.

### File (Storage)
Oggi l'app non usa Storage (il logo è dentro `azienda.logo`). Regola per quando servirà: ogni file sta sotto `<azienda_id>/…` e le regole del bucket permettono solo la cartella `azienda_corrente()`.

### Regole per le tabelle nuove (da qui in poi)
Ogni nuova tabella con dati aziendali ha: `azienda_id uuid not null default public.azienda_corrente() references public.azienda (id)`, un indice su `azienda_id`, la regola restrittiva `"<tabella>: stessa azienda"` e il trigger `a0_azienda` con i suoi collegamenti (es. `allinea_azienda('commessa_id:commesse')`). Vincoli unici e numeratori sempre con `azienda_id` davanti. Le viste non `security_invoker` filtrano `azienda_id = azienda_corrente()`.

### Prove (24/11)
- In locale con PGlite (0001→0009 con dati di prova, poi una seconda azienda): 97 controlli su 97.
- Su `gestionale-dev`: backup nello schema `backup_prima_0009` (24 tabelle; si butta con `drop schema backup_prima_0009 cascade;`), migrazione applicata (dati, registro e numeri invariati). Seconda azienda «Azienda di prova B» con `crea_azienda` e un titolare di prova: con lo script `supabase/prove/test_isolamento_aziende.sql` B vede 0 righe di A in tutte le tabelle e viste, e 25 tentativi di modificare o collegare dati di A sono respinti; B ha il suo preventivo 1/26 e può avere un soggetto con la stessa P.IVA di A. Nell'app (titolare A): elenchi, Impostazioni (solo i propri account, salvataggio dati azienda), stampa e «Duplica» (19/26) funzionano. Poi utente e azienda di prova spenti (`attivo = false`).

### Cosa resta uguale nell'app
Le funzioni `salva_soggetto`, `salva_preventivo`, `salva_modello`, `salva_fasi`, `salva_ordine_acquisto`, `registra_arrivo` sono `security invoker`: le righe nuove prendono da sole l'azienda (valore predefinito o trigger). Si sistemano le ricerche interne dei trigger (es. codice IVA «22» dell'azienda giusta) e il salvataggio dei dati azienda in Impostazioni (solo modifica).

---

## 1. Fondamenta (utenti e ruoli) — ✅ in `0001_fondamenta.sql`

Enum `ruolo_utente`: `titolare`, `ufficio`, `contabilita`, `operaio`.
Enum `azione_registro`: `creazione`, `modifica`, `archiviazione`.

### `profili` — chi può entrare nell'app
| campo | tipo | note |
|---|---|---|
| id | uuid | = id dell'utente di Supabase Auth |
| email | text | copiata dall'account alla creazione, non modificabile da qui |
| nome_visualizzato | text | nome mostrato nell'app (predefinito: parte dell'email prima della @) |
| ruolo | ruolo_utente | predefinito `operaio` |
| attivo | bool | predefinito **false**: il titolare attiva i nuovi account |

> Il profilo nasce da solo quando si crea un utente su Supabase (trigger `al_nuovo_utente` su `auth.users`), dalla 0009 nell'azienda più vecchia; per un'altra azienda si usa `crea_azienda(…, email)`.
> Nessuno può cambiare il **proprio** ruolo o disattivare il **proprio** account (trigger `a_proteggi`); dalla 0009 l'azienda di un utente non si cambia dall'app.
> Il primo titolare si imposta una volta sola dal SQL Editor: `update profili set ruolo = 'titolare', attivo = true where email = '…';`

### `dipendenti` — anagrafica del personale
| campo | tipo | note |
|---|---|---|
| nome, cognome | text | obbligatori (non vuoti) |
| mansione_principale | text | es. "Assemblaggio" |
| profilo_id | uuid → profili | **unico**; vuoto se il dipendente non usa l'app |
| attivo | bool | predefinito true |

> Un dipendente può esistere senza account (es. chi non timbra dal telefono). Un account può esistere senza essere dipendente (es. un consulente esterno).

### `registro_modifiche` — chi ha fatto cosa
| campo | tipo | note |
|---|---|---|
| tabella, record_id | text, uuid | cosa è stato modificato |
| azione | azione_registro | |
| autore | uuid → profili | vuoto se la modifica è fatta dal pannello Supabase o da un trigger di sistema |
| quando | timestamptz | |
| prima, dopo | jsonb | riga intera prima e dopo la modifica |

> Si scrive **solo** tramite il trigger `registra_modifica` (gli utenti non possono inserire, modificare o cancellare).
> Oggi tracciate: `profili`, `dipendenti` e (con la 0002) tutte le tabelle delle Anagrafiche; con la 0003 anche `preventivi`, fasi, righe, tariffe e modelli; da tracciare `timbrature` (obbligo di tracciare le correzioni), `commesse`.
> Serve anche per le "Attività recenti" della Dashboard e per il pulsante "Storico modifiche" della scheda cliente/fornitore.

### Permessi Fondamenta (attivi)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| profili | lettura di tutti, modifica | lettura di tutti | lettura di tutti | solo il proprio, lettura |
| dipendenti | tutto (no cancellazione) | lettura | lettura | solo sé stesso, lettura |
| registro_modifiche | lettura | — | — | — |

---

### `azienda` — i nostri dati (0005)
Dalla 0009 è **l'elenco delle aziende** (sezione 0): ogni utente vede solo la propria; il titolare la modifica, le nuove si creano con `crea_azienda()`. `attivo = false` spegne l'azienda. `ragione_sociale` (obbligatoria), `indirizzo`, `civico`, `cap`, `comune`, `provincia`, `nazione` (predefinita `IT`), `partita_iva`, `codice_fiscale`, `telefono`, `email`, `pec`, `sito_web`, `iban`, `banca`, `rea`, `capitale_sociale`, `piede_documenti`, `logo` (immagine PNG/JPG/WebP/SVG come data URL, al massimo ~300 KB).
Intestazione dei preventivi stampati; servirà anche alla fattura elettronica (cedente/prestatore).
Permessi: leggono titolare, ufficio, contabilità; modifica solo il titolare (Impostazioni). Non si cancella. Trigger `a_normalizza`, `b_aggiornamento`, `vieta_cancellazione`, `z_registro`.

---

## 2. Anagrafiche — v0.5 (19/11), in `0002_anagrafiche.sql` (applicata su `gestionale-dev`)

Riferimento: artboard *Anagrafiche – scheda cliente/fornitore* del mockup confermato.
Tutte le tabelle hanno `attivo` (predefinito true), i campi `creato_*`/`aggiornato_*`, i trigger `b_aggiornamento`, `vieta_cancellazione`, `z_registro`.

**Decisioni del 19/11:**
- **Anche soggetti esteri e pubblica amministrazione** (supera la decisione del 17/11 "solo soggetti italiani"). I controlli di formato italiani (P.IVA 11 cifre, CF, CAP 5 cifre, provincia) si applicano **solo se il paese è IT**.
- L'azienda lavora su misura: **niente listino di vendita**. `articoli` è il catalogo dei **materiali acquistati con il loro costo** (usato nei preventivi a fasi, sezione 3). `listini` e `prezzi_listino` non si creano e nella scheda non c'è nessun campo "Listino" (tolto il 22/11).
- I campi segnati **XML** finiscono nella fattura elettronica. Le parti segnate "da confermare" (reverse charge, dichiarazioni d'intento) vanno verificate con il commercialista prima della fatturazione, ma le tabelle si creano subito.

Enum nuovi: `tipo_soggetto` (`cliente`, `fornitore`, `entrambi`), `forma_soggetto` (`azienda`, `persona_fisica`, `pubblica_amministrazione`), `tipo_sede` (`operativa`, `altra`), `tipo_articolo` (`articolo`, `lavorazione`, `servizio`).

**Paesi e nazioni** (`paese_iva`, `nazione` di soggetti e sedi): sigla ISO di 2 lettere (`IT`, `DE`, `FR`…), come vuole la fattura elettronica; l'app mostra il nome ("Italia").

### `soggetti` — clienti e fornitori (una sola tabella)
| campo | tipo | note |
|---|---|---|
| tipo | tipo_soggetto | predefinito `cliente` |
| forma | forma_soggetto | predefinito `azienda` |
| ragione_sociale | text | obbligatoria per azienda e PA (per la PA: denominazione ente) · XML |
| cognome, nome | text | obbligatori per persona fisica · XML |
| denominazione | text | **calcolata** dal database: ragione sociale, oppure "cognome nome". Per elenchi e ricerca (non si scrive) |
| nome_breve | text | per la ricerca rapida (es. "FES") |
| sito_web | text | |
| paese_iva | text | 2 lettere, predefinito `IT` (proposto dalla nazione della sede legale) · XML |
| partita_iva | text | se `paese_iva = IT`: 11 cifre; **unica tra i soggetti attivi** (per paese) · XML |
| codice_fiscale | text | 16 caratteri o 11 cifre (solo controlli italiani) · XML |
| codice_sdi | text | 7 caratteri; privati `0000000`; esteri `XXXXXXX` · XML |
| codice_ufficio_pa | text | 6 caratteri, solo per la PA (da IPA) · XML |
| split_payment | bool | solo PA |
| pec | text | formato email |
| codice_iva_abituale_id | uuid → codici_iva | facoltativo: proposto sulle righe dei documenti |
| indirizzo, civico, cap, comune, provincia, nazione | text | **sede legale** (va in fattura) · XML. `nazione` predefinita `IT` |
| iban | text | · XML |
| abi, cab | text | 5 cifre; ricavati dall'IBAN italiano, oppure scritti a mano (Ri.Ba.) |
| banca_agenzia | text | |
| banca_aziendale_id | uuid → banche_aziendali | nostra banca d'appoggio (Ri.Ba. e bonifici) |
| note_riba | text | |
| condizione_pagamento_id | uuid → condizioni_pagamento | · XML |
| mese_escluso_1, mese_escluso_2 | smallint | 1–12, facoltativi: una scadenza in quel mese slitta all'ultimo giorno del mese |
| giorno_fisso | smallint | 1–31, facoltativo |
| reverse_charge | bool | solo fornitori · da confermare |
| rc_tipo_documento | text | `TD16`, `TD17`, `TD18`, `TD19` · XML |
| rc_natura | text | es. `N6.x` |
| rc_codice_iva_id | uuid → codici_iva | IVA dell'integrazione |
| note_interne | text | visibili solo nella scheda |
| note_documenti | text | riportate su fatture e DDT |
| privacy_inviata_il, privacy_firmata_il | date | informativa privacy |

> Trigger `a_normalizza` (`normalizza_soggetto`): toglie spazi, maiuscolo per CF/SDI/provincia/paese/IBAN, toglie la sigla paese e i punti dalla P.IVA, minuscolo per PEC, campi vuoti → null. Svuota i campi che non c'entrano con la forma (es. ragione sociale per una persona fisica, campi PA per chi non è PA, campi `rc_*` senza reverse charge).
> La P.IVA è unica tra i soggetti attivi **per paese** (`paese_iva` + `partita_iva`).
> **Salvataggio della scheda intera:** funzione `salva_soggetto(p_id, p_soggetto, p_contatti, p_sedi, p_dichiarazioni, p_categorie)` (JSON; `p_categorie` aggiunto in 0006). Salva soggetto, contatti, sedi, dichiarazioni e categorie merceologiche del fornitore "tutto o niente": righe con `id` aggiornate, senza `id` nuove, righe attive non più presenti archiviate. È `security invoker`: valgono le regole RLS di chi la chiama. Restituisce l'id del soggetto.
> Regole di coerenza (`check`): azienda/PA → `ragione_sociale` obbligatoria; persona fisica → `cognome` e `nome` obbligatori; `codice_ufficio_pa` e `split_payment` solo per la PA; campi `rc_*` solo se `reverse_charge`.
> Cifre di controllo di P.IVA e CF italiani: le verifica l'app (`src/lib/validazioni.ts`).
> Nel vecchio gestionale l'autofattura in reverse charge richiedeva un "cliente fittizio": qui i dati si prendono dal fornitore stesso.
> CIG e CUP (PA) **non** stanno qui: si scrivono su ogni preventivo/fattura.

### `contatti_soggetto` — più contatti per soggetto
| campo | tipo | note |
|---|---|---|
| soggetto_id | uuid → soggetti | |
| riferimento | text | scelto da un elenco (Commerciale, Amministrazione, Acquisti, Produzione, Logistica, Titolare) o scritto a mano |
| persona | text | nome e cognome |
| email | text | |
| telefono, cellulare | text | |
| riceve_preventivi, riceve_fatture | bool | a chi proporre l'invio dei PDF (sostituisce "Email invio PDF") |

### `sedi_soggetto` — sede operativa e altre sedi
| campo | tipo | note |
|---|---|---|
| soggetto_id | uuid → soggetti | |
| tipo | tipo_sede | `operativa` (al massimo una attiva per soggetto) o `altra` |
| nome | text | es. "Magazzino", "Cantiere" |
| indirizzo, civico, cap, comune, provincia, nazione | text | |
| telefono, annotazioni | text | es. orari di consegna |
| consegna | bool | proponibile come destinazione nei DDT (la sede operativa lo è sempre) |

> "Sede operativa uguale alla sede legale" = nessuna riga `operativa`.

### `dichiarazioni_intento` — esportatori abituali (solo clienti) · XML · da confermare
| campo | tipo | note |
|---|---|---|
| soggetto_id | uuid → soggetti | |
| protocollo | text | protocollo di ricezione dell'Agenzia delle Entrate (17 cifre + 6 cifre) |
| data | date | |
| anno | smallint | |
| importo | numeric(12,2) | importo dichiarato |

> "Già fatturato", residuo e stato (valida/scaduta/esaurita) si **calcolano** dalle fatture emesse (quando esisteranno). Finché è valida, le fatture vanno senza IVA (natura N3.5) con il protocollo nell'XML.

### `codici_iva` — nuova (scheda "Codici IVA, pagamenti e banche")
| campo | tipo | note |
|---|---|---|
| codice | text | es. "22", "N3.1", "N6.x"; unico tra gli attivi |
| descrizione | text | es. "Aliquota ordinaria", "Non imponibile, esportazione" |
| aliquota | numeric(5,2) | 22, 10, 5, 4 o 0 |
| natura | text | `N1`…`N7.x` quando l'aliquota è 0 · XML |

Regola: aliquota 0 ⇔ natura obbligatoria (formato `N1`…`N7`, con sottocodice es. `N3.1`).
Dati iniziali: 22, 10, 5, 4, N3.1 (esportazione), N3.5 (dichiarazione d'intento), N6.9 (reverse charge, altri casi) — elenco da confermare con il commercialista.

### `banche_aziendali` — nuova
`nome`, `iban`, `abi`, `cab`, `note`. Le banche dell'azienda (ex "Banche Aziendali").

### `categorie_merceologiche` — (0006, prima si chiamava `categorie_soggetto`)
`descrizione` (unica tra le attive). Tipi di materiale (es. Bobine, Lastre, Adesivi): **una per articolo** (`articoli.categoria_id`) e **una o più per fornitore** (`fornitori_categorie`). I clienti non hanno categoria (decisione 23/11: `soggetti.categoria_id` tolto in 0006; le categorie già date ai fornitori sono state copiate in `fornitori_categorie`).

### `fornitori_categorie` — (0006)
Quali categorie vende ogni fornitore (per filtrare i fornitori per materiale).
| campo | tipo | note |
|---|---|---|
| soggetto_id | uuid → soggetti | solo `fornitore` o `entrambi` (trigger `a_controlla`) |
| categoria_id | uuid → categorie_merceologiche | |
| attivo | bool | categoria tolta → `false`; se torna si riattiva la stessa riga |

Una riga per coppia (`unique (soggetto_id, categoria_id)`). Si scrive con `salva_soggetto` (parametro `p_categorie`: elenco di id). Registro modifiche attivo.

### `condizioni_pagamento`
`descrizione` (obbligatoria, unica tra le attive, es. "Ri.Ba. 30-60 gg f.m."), `giorni` (0–365).
Dati iniziali: Rimessa diretta (0), Bonifico 30 gg (30), Bonifico 60 gg (60).
> Le condizioni a più rate (30-60 gg, fine mese) e la modalità per l'XML (MP05 bonifico, MP12 Ri.Ba.…) richiedono campi in più: da dettagliare quando si farà la fatturazione.

### `articoli` — catalogo materiali (con costo)
| campo | tipo | note |
|---|---|---|
| codice | text | facoltativo; se c'è, unico tra gli attivi (maiuscole/minuscole uguali) |
| descrizione | text | obbligatoria |
| tipo | tipo_articolo | `articolo`, `lavorazione`, `servizio`; predefinito `articolo`. **Non più usato dall'app (23/11)**: da togliere con una migrazione futura |
| unita_misura | text | obbligatoria, predefinito `pz`; tipiche `m2`, `ml`, `pz`, `foglio`, `lastra` |
| costo_unitario | numeric(12,4) | ≥ 0, IVA esclusa, **4 decimali** |
| larghezza_bobina_m | numeric(6,3) | solo materiali in bobina: m² = larghezza × metri lineari |
| lastra_larghezza_cm, lastra_altezza_cm | numeric(7,1) | solo materiali a lastra (0004), entrambe o nessuna; allora `costo_unitario` = **prezzo della lastra intera**. Un articolo è in bobina oppure a lastra |
| codice_iva_id | uuid → codici_iva | predefinito 22 |
| fornitore_id | uuid → soggetti | facoltativo: fornitore abituale |
| categoria_id | uuid → categorie_merceologiche | (0006) facoltativa: tipo di materiale |
| scorta_minima | numeric(12,3) | (0007) facoltativa, in unità di magazzino: sotto questa giacenza l'app avvisa |
| bobina_lunghezza_m | numeric(8,2) | (0007) solo bobine: metri lineari della bobina intera (serve al costo di una bobina negli ordini) |
| note | text | |

> Trigger `a_normalizza` (`normalizza_articolo`): toglie spazi, codice vuoto → null, codice IVA vuoto → il codice "22" attivo.
> Rispetto alla vecchia `0002`: `prezzo_base` → `costo_unitario`, `aliquota_iva` → `codice_iva_id`; niente `listini`, `prezzi_listino`, `soggetti.listino_id`, funzione `prezzo_per_cliente`.

### Permessi Anagrafiche
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| soggetti, contatti, sedi, dichiarazioni d'intento, articoli, categorie merceologiche, fornitori_categorie | lettura, inserimento, modifica | lettura, inserimento, modifica | lettura | — |
| codici_iva, condizioni_pagamento, banche_aziendali | lettura, inserimento, modifica | lettura | lettura, inserimento, modifica | — |

> Proposta: le tabelle "fiscali" (codici IVA, pagamenti, banche aziendali) le modificano titolare e contabilità. Da confermare.
> **Per la chat Produzione:** gli operai non leggono `soggetti`. Se nelle commesse/task devono vedere il nome del cliente o l'indirizzo di posa, serve una vista apposita (solo nome e sede delle commesse visibili).
> **GDPR:** le persone fisiche e i contatti sono dati personali → campi privacy nella scheda; nessun dato di soggetti va mostrato agli operai oltre al necessario.

---

## 3. Preventivi — v0.6 (22/11), in `0003_preventivi.sql` (applicata su `gestionale-dev`)

Mockup: artboard *Preventivi* e *Preventivo a fasi (dettaglio)*.

Come funziona: un preventivo è fatto di **fasi** (es. Grafica, Stampa, Taglio e montaggio, Posa in loco). Ogni fase ha righe di **ore** (ore × costo orario) e righe di **materiali** (quantità × costo). Costo totale × (1 + ricarico %) = prezzo calcolato; il **prezzo al cliente** si può correggere a mano. Il cliente (PDF, email) vede solo le descrizioni delle fasi e il prezzo; ore, costi e ricarico restano interni.

Dati confermati dall'utente (19/11): **più tariffe orarie** (persona/reparto/macchina); materiali in bobina calcolati in **m² = larghezza bobina × metri lineari**; **la trasferta è compresa nella tariffa di posa** (nessuna voce separata); **costi, ricarico e margine visibili a titolare, ufficio e contabilità** (non agli operai).

**Decisioni del 22/11:**
- **Numerazione come in FileMaker: `1/26`, `23/26`…** (progressivo che riparte da 1 ogni anno, poi le ultime due cifre dell'anno). L'anno è quello della data del preventivo. Il numero lo assegna il database alla creazione e non cambia più. Varrà lo stesso formato per le commesse.
- Un preventivo **accettato o rifiutato non si modifica più** (né lui né fasi e righe): si può solo cambiarne lo stato o archiviarlo. Per rifarlo si duplica. Bozze e inviati si modificano.
- **Margine in % sul prezzo al cliente** (348,42 € su 1.330 € = 26,2%).
- Costo orario e costo dei materiali si **copiano** nella riga quando la si crea: se cambia una tariffa o un articolo, i preventivi già fatti non cambiano.
- **Materiali a lastra** (es. 305×205 cm): si calcolano le lastre dai pezzi, e in ogni riga si sceglie se far pagare le lastre intere o solo i m² usati + scarto (predefinito 10%). C'è anche il margine di taglio (predefinito 0). Misure in cm. → `0004_lastre.sql`
- Nella riga, **costo orario e costo del materiale sono modificabili** (proposti da tariffa e catalogo, si possono cambiare per i casi speciali).
- Un preventivo accettato o rifiutato si può **riportare a bozza o inviato** da titolare e ufficio, con una conferma: torna modificabile.
- PDF: prima una pagina da stampare ("Stampa → Salva come PDF"); file PDF vero e invio email alla fine (passo 7, serve un servizio di invio email).

Il PDF/email si invia ai contatti del cliente con `riceve_preventivi = true`.

Enum nuovi: `tipo_tariffa` (`persona`, `macchina`, `posa`), `stato_preventivo` (`bozza`, `inviato`, `accettato`, `rifiutato`); con la 0004 `addebito_lastra` (`lastre_intere`, `m2_usati`).

### `numeratori` — nuova (ultimo numero usato)
| campo | tipo | note |
|---|---|---|
| documento | text | `preventivo` (poi `commessa`…) |
| anno | smallint | |
| ultimo | int | ultimo progressivo usato |

> Chiave: `azienda_id` + `documento` + `anno` (dalla 0009: ogni azienda ha i suoi numeri). Nessun utente la legge o la scrive: la aggiorna il trigger `a_numera` (funzione `prossimo_numero`) nello stesso salvataggio, così due persone nello stesso istante ricevono numeri diversi e un salvataggio fallito non "brucia" un numero.
> Per partire da un altro numero (es. continuare da FileMaker), una volta dal SQL Editor: `insert into numeratori (azienda_id, documento, anno, ultimo) values ('<id azienda>', 'preventivo', 2026, 113) on conflict (azienda_id, documento, anno) do update set ultimo = excluded.ultimo;`

### `tariffe_orarie` — nuova
| campo | tipo | note |
|---|---|---|
| nome | text | unico tra le attive. Es. "Grafica", "Laboratorio", "Stampante UV", "Posa (trasferta compresa)" |
| tipo | tipo_tariffa | `persona`, `macchina`, `posa` |
| costo_orario | numeric(12,2) | € / ora, ≥ 0 |
| note | text | |

Modificabili solo dal titolare (in Impostazioni); lette da ufficio e contabilità. Dati iniziali: le 4 tariffe del mockup con **costi d'esempio** (45, 38, 60, 42 €/h) da correggere.

### `preventivi`
| campo | tipo | note |
|---|---|---|
| anno, progressivo | smallint, int | assegnati dal database; unici insieme |
| numero | text | **calcolato**: `progressivo/aa`, es. `23/26` |
| soggetto_id | uuid → soggetti | cliente (non un fornitore), obbligatorio |
| oggetto | text | obbligatorio, es. "Insegna luminosa negozio" |
| modello_id | uuid → modelli_lavorazione | facoltativo: da quale modello è partito |
| data | date | predefinita oggi |
| valido_fino | date | se vuota: data + 1 mese; non prima della data |
| stato | stato_preventivo | predefinito `bozza` |
| ricarico_percentuale | numeric(5,2) | predefinito 35 |
| prezzo_cliente | numeric(12,2) | **vuoto = prezzo calcolato**; compilato = prezzo corretto a mano |
| codice_iva_id | uuid → codici_iva | se vuoto: quello abituale del cliente, altrimenti 22 |
| cig, cup | text | solo per la PA |
| note | text | interne, mai nel PDF |
| note_cliente | text | (0005) stampate nel PDF per il cliente |
| prezzi_fasi_nel_pdf | bool | (0005) predefinito false: il PDF mostra solo i totali; se vero anche il prezzo di ogni fase (prezzo del preventivo diviso in proporzione al costo delle fasi, somma esatta al centesimo) |

> Trigger: `a_normalizza` (pulizia, cliente non fornitore, validità e IVA proposte), `a_numera` (numero), `a_proteggi` (numero fisso; blocco se accettato/rifiutato).

### `fasi_preventivo` — nuova (fasi di un preventivo **o** di un modello)
| campo | tipo | note |
|---|---|---|
| preventivo_id | uuid → preventivi | compilato **oppure** `modello_id`, mai tutti e due |
| modello_id | uuid → modelli_lavorazione | |
| ordine | int | posizione |
| titolo | text | obbligatorio, es. "Stampa" |
| descrizione_cliente | text | testo che va nel PDF |

### `ore_fase` — nuova
| campo | tipo | note |
|---|---|---|
| fase_id | uuid → fasi_preventivo | |
| ordine | int | |
| tariffa_id | uuid → tariffe_orarie | obbligatoria |
| ore | numeric(6,2) | ore totali (es. 2 persone × 4 h = 8) |
| persone | int | facoltativo, solo per mostrare il dettaglio |
| costo_orario | numeric(12,2) | se vuoto alla creazione: **copiato** dalla tariffa |

### `materiali_fase` — nuova
| campo | tipo | note |
|---|---|---|
| fase_id | uuid → fasi_preventivo | |
| ordine | int | |
| articolo_id | uuid → articoli | facoltativo (materiale non a catalogo) |
| descrizione, unita_misura | text | se vuoti: copiati dall'articolo |
| larghezza_m, metri_lineari | numeric | solo bobine, entrambi o nessuno: allora **quantità = larghezza × metri lineari** (in m², la calcola il database) |
| quantita | numeric(12,3) | |
| costo_unitario | numeric(12,4) | se vuoto alla creazione: **copiato** dall'articolo |
| addebito_lastra | addebito_lastra | (0004) vuoto = non è una lastra; `lastre_intere` o `m2_usati` |
| lastra_larghezza_cm, lastra_altezza_cm | numeric(7,1) | misure della lastra; se vuote: dall'articolo |
| costo_lastra | numeric(12,4) | prezzo della lastra intera; se vuoto: dall'articolo |
| pezzo_larghezza_cm, pezzo_altezza_cm, pezzi | numeric(7,1), int | misura e numero dei pezzi da ricavare |
| margine_taglio_cm | numeric(5,1) | spazio tra i pezzi, predefinito 0 |
| scarto_percentuale | numeric(5,2) | solo `m2_usati`, predefinito 10 |

> **Lastre (0004):** i dati della lastra ci sono tutti o nessuno; una riga è in bobina oppure a lastra. Il database (trigger `a_normalizza`, funzione `pezzi_per_lastra`) calcola quanti pezzi stanno in una lastra, righe × colonne, tutti dritti o tutti ruotati (il migliore). Il margine conta solo **tra** i pezzi. Poi:
> - `lastre_intere` → quantità = lastre necessarie (arrotondate in su), unità `lastra`, costo unitario = prezzo della lastra;
> - `m2_usati` → quantità = m² dei pezzi × (1 + scarto %), con 3 decimali, unità `m2`, costo unitario = prezzo lastra ÷ m² della lastra, con 4 decimali.
>
> Esempio: Forex 305×205 a 48 €, 10 pezzi 100×70 → 8 per lastra → 2 lastre = 96,00 €; oppure 7,70 m² × 7,6769 = 59,11 €. Con margine 10 cm → 4 per lastra → 3 lastre = 144,00 €. Se il pezzo non entra, il salvataggio dà errore. Gli stessi calcoli dal vivo stanno in `src/app/(app)/preventivi/calcoli.ts`.

### `modelli_lavorazione` — nuova
`nome` (unico tra gli attivi), `descrizione`, `ricarico_percentuale` (predefinito 35), `note`. Le fasi stanno in `fasi_preventivo` con `modello_id`. Esempi: "Insegna luminosa", "Adesivo prespaziato", "Banner PVC con occhielli", "Wrapping furgone", "Bandiera a goccia".
> Creando un preventivo da un modello («Parti da un modello»), le fasi arrivano con tariffe e costi **attuali** (catalogo e tariffe di oggi; i materiali scritti a mano tengono il costo del modello) e il ricarico del modello; `preventivi.modello_id` ricorda da quale modello si è partiti. Anche la pagina e l'elenco dei modelli mostrano i costi di oggi.
> **«Salva come modello»** crea un modello con le fasi del preventivo. **«Duplica»** crea una nuova bozza (numero nuovo, data di oggi, stesse fasi e righe, senza prezzo corretto a mano): si sceglie se tenere i costi del preventivo copiato o aggiornarli a oggi. Decisioni del 22/11.

### Viste dei totali (calcolati, mai scritti a mano; `security_invoker`)
- **`fasi_riepilogo`**: per ogni fase attiva `ore`, `costo_ore`, `costo_materiali`, `costo`.
- **`preventivi_riepilogo`**: per ogni preventivo `ore_previste`, `costo_ore`, `costo_materiali`, `costo_totale`, `prezzo_calcolato`, `prezzo` (corretto a mano o calcolato), `margine`, `margine_percentuale` (sul prezzo), `aliquota_iva`, `iva`, `totale`.
> Ogni riga si arrotonda al centesimo, poi si somma. Prova con l'esempio del mockup: costo 981,58 €, calcolato 1.325,13 €, con prezzo 1.330 € margine 348,42 € (26,2%), IVA 292,60 €, totale 1.622,60 €.

### Salvataggio "tutto o niente"
- **`salva_preventivo(p_id, p_preventivo, p_fasi)`** e **`salva_modello(p_id, p_modello, p_fasi)`** (JSON), che usano `salva_fasi`. `p_fasi` = elenco di fasi, ognuna con `ore` e `materiali`; l'ordine nell'elenco è l'ordine di fasi e righe. Righe con `id` aggiornate, senza `id` nuove, righe attive non più presenti archiviate (una fase tolta archivia anche le sue righe). `security invoker`. Restituiscono l'id.
- Lo **stato** non si cambia da `salva_preventivo` (un nuovo preventivo è `bozza`): si cambia con un semplice update di `stato`.

### Permessi Preventivi
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| preventivi, fasi, ore, materiali, modelli | lettura, inserimento, modifica | lettura, inserimento, modifica | lettura | — |
| tariffe_orarie | lettura, inserimento, modifica | lettura | lettura | — |
| numeratori | — | — | — | — |

Tutte le tabelle hanno `attivo`, i campi `creato_*`/`aggiornato_*`, i trigger `b_aggiornamento`, `vieta_cancellazione`, `z_registro` (anche fasi e righe: lo storico di un preventivo è completo).

---

## 4. Produzione

### `commesse`
| campo | tipo | note |
|---|---|---|
| numero | text | come i preventivi: `41/26`, progressivo per anno (tabella `numeratori`, documento `commessa`) |
| preventivo_id | uuid → preventivi | facoltativo (commessa senza preventivo) |
| soggetto_id | uuid → soggetti | cliente |
| sede_id | uuid → sedi_soggetto | facoltativo: dove si fa la posa / la consegna |
| descrizione | text | |
| data_consegna | date | |
| stato | enum | `da_pianificare`, `in_lavorazione`, `controllo_qualita`, `completata` |
| urgente | bool | |
| avanzamento | int | 0–100 % |
| ore_previste | numeric(6,2) | copiate dal preventivo alla conversione |

> Ore reali = somma delle timbrature con `commessa_id` (calcolate). La Dashboard mostra "Ore previste e ore reali".
> Alla conversione in commessa, le fasi del preventivo possono diventare task (da decidere nella chat Produzione).

### `task` — mansioni e task (anche urgenti)
| campo | tipo | note |
|---|---|---|
| titolo | text | es. "Taglio e preparazione" |
| commessa_id | uuid → commesse | vuoto per lavori interni (manutenzione) |
| dipendente_id | uuid → dipendenti | a chi è assegnato |
| giorno | date | |
| ora_inizio, ora_fine | time | |
| stato | enum | `da_iniziare`, `in_corso`, `completato` |
| urgente | bool | |

> Dashboard: riquadro "Pose e installazioni in programma" → serve distinguere i task di posa fuori sede (es. campo `tipo` o `luogo`), da definire.

---

## 5. Timbrature

### `timbrature` — ogni "clic" è una riga
| campo | tipo | note |
|---|---|---|
| dipendente_id | uuid → dipendenti | |
| tipo | enum | `entrata`, `inizio_pausa`, `fine_pausa`, `uscita` |
| orario | timestamptz | ora reale della timbratura |
| commessa_id | uuid → commesse | facoltativo |
| origine | enum | `telefono`, `ufficio` (correzione) |
| id_locale | uuid | creato dal telefono: evita doppioni quando si sincronizza dopo l'offline |
| ricevuta_il | timestamptz | quando è arrivata al server |

> Le ore lavorate e gli stati si **calcolano** dalle timbrature, non si salvano.
> Le correzioni dell'ufficio finiscono in `registro_modifiche`.

### `assenze`
`dipendente_id`, `tipo` (`ferie`, `permesso`, `altro`), `dal`, `al`, `note`.

---

## 6b. Magazzino e ordini d'acquisto — v1.0 (23/11), in `0007_magazzino_ordini.sql` (applicata su `gestionale-dev`)

Richiesta del datore di lavoro dopo le prove del 23/11: dall'articolo si crea un **ordine d'acquisto** (PDF da mandare al fornitore); accanto a ogni articolo c'è la **quantità in magazzino**, che sale con gli arrivi e scende con i materiali usati nelle commesse, con un avviso quando non basta.

**Decisioni del 23/11:**
- La giacenza **non si scrive a mano**: è la somma dei **movimenti** (carico +, scarico −, rettifica ±). Un movimento sbagliato non si modifica: si archivia e se ne registra uno nuovo. Così resta lo storico.
- **Unità di magazzino**: articolo a lastra → **lastre intere**; in bobina → **bobine intere**; gli altri → la loro unità di misura. Funzione `unita_magazzino(articolo)`.
- **Sotto zero si può andare**: è un avviso, non un blocco (il materiale può esserci fisicamente senza essere stato registrato).
- Lo scarico dalle commesse si registra **quando si conferma il materiale usato davvero** (quantità proposte dal preventivo, modificabili); prima risulta "impegnato". Si fa con la sezione Produzione (colonna `movimenti_magazzino.commessa_id` da aggiungere allora).
- **Gli operai registrano carichi, scarichi e inventari** (rettifiche: permesse con la 0008, decisione del 23/11 dopo le prove: di solito è un operaio a contare il magazzino); non arrivi d'ordine né annullamenti. Vedono le giacenze, ma **mai i costi**.
- Le righe degli ordini sono **solo articoli del catalogo**, così ogni arrivo finisce nella giacenza giusta.

Enum nuovi: `stato_ordine_acquisto` (`bozza`, `inviato`, `ricevuto_parziale`, `ricevuto`, `annullato`), `tipo_movimento` (`carico`, `scarico`, `rettifica`).

### `ordini_acquisto`
| campo | tipo | note |
|---|---|---|
| anno, progressivo, numero | | come i preventivi: `3/26` (numeratore `ordine_acquisto`), assegnati dal database |
| soggetto_id | uuid → soggetti | **fornitore** (o `entrambi`), obbligatorio |
| data | date | predefinita oggi |
| consegna_prevista | date | facoltativa, non prima della data |
| stato | stato_ordine_acquisto | predefinito `bozza`; `ricevuto_parziale`/`ricevuto` li imposta il database con gli arrivi |
| riferimento_fornitore | text | es. numero della loro offerta |
| note_fornitore | text | stampate nell'ordine |
| note | text | interne |

> Trigger `a_numera`, `a_normalizza` (solo fornitori), `a_proteggi`: numero fisso; un ordine non più in bozza/inviato (arrivato anche in parte, o annullato) accetta solo cambio di stato, note interne e archiviazione.

### `righe_ordine_acquisto`
| campo | tipo | note |
|---|---|---|
| ordine_id | uuid → ordini_acquisto | |
| ordine | int | posizione |
| articolo_id | uuid → articoli | **obbligatorio** |
| descrizione | text | se vuota: dall'articolo |
| unita_misura | text | sempre l'unità di magazzino dell'articolo (la scrive il database) |
| quantita | numeric(12,3) | > 0, in unità di magazzino |
| costo_unitario | numeric(12,4) | se vuoto: `costo_unita_magazzino(articolo)` = prezzo della lastra, oppure costo al m² × larghezza × lunghezza della bobina, oppure costo unitario. Bobina senza lunghezza → va scritto a mano |

> Le righe si modificano solo con l'ordine in bozza o inviato. La quantità **arrivata** non si salva qui: si calcola dai movimenti (vista `righe_ordine_riepilogo`).

### `movimenti_magazzino`
| campo | tipo | note |
|---|---|---|
| articolo_id | uuid → articoli | |
| data | date | predefinita oggi |
| tipo | tipo_movimento | |
| quantita | numeric(12,3) | **con il segno**: carico > 0, scarico < 0, rettifica ≠ 0 |
| riga_ordine_id | uuid → righe_ordine_acquisto | solo carichi da un ordine (l'articolo lo copia il database dalla riga) |
| note | text | |
| attivo | bool | `false` = movimento annullato |

> Dopo la creazione si cambiano solo `note` e `attivo` (trigger `a_normalizza`). Trigger `y_stato_ordine`: dopo un arrivo, o il suo annullamento, ricalcola lo stato dell'ordine (`aggiorna_stato_ordine`): tutto arrivato → `ricevuto`, qualcosa → `ricevuto_parziale`, niente → `inviato`; un ordine annullato non cambia.

### Viste
- **`magazzino`**: per ogni articolo `codice`, `descrizione`, `categoria`, `unita` (di magazzino), `giacenza`, `in_arrivo` (ordinato in ordini inviati/ricevuti in parte e non ancora arrivato), `scorta_minima`, `sotto_scorta`, `ultimo_movimento`, `attivo`. **Senza costi.** Non è `security_invoker` (gli operai non leggono `articoli`): la leggono tutti gli utenti attivi, grazie al filtro sul ruolo dentro la vista (dalla 0009 anche sull'azienda).
- **`righe_ordine_riepilogo`** (`security_invoker`): per riga `quantita`, `arrivato`, `da_ricevere`, `importo`.
- **`ordini_acquisto_riepilogo`** (`security_invoker`): per ordine `righe`, `imponibile` (IVA esclusa), `da_ricevere`.

### Funzioni
- **`salva_ordine_acquisto(p_id, p_ordine, p_righe)`**: come `salva_preventivo` (tutto o niente; righe con `id` aggiornate, senza nuove, mancanti archiviate). Lo stato si cambia con un update. Restituisce l'id.
- **`registra_arrivo(p_ordine_id, p_righe, p_data, p_note)`**: `p_righe` = `[{ riga_id, quantita }]`; crea i carichi (righe a 0 ignorate, si può ricevere più dell'ordinato). Restituisce quante righe ha registrato.

### Permessi Magazzino
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| ordini_acquisto, righe | lettura, inserimento, modifica | lettura, inserimento, modifica | lettura | — |
| movimenti_magazzino | lettura, tutti i tipi, archiviazione | lettura, tutti i tipi, archiviazione | lettura | lettura; inserimento di `carico`/`scarico`/`rettifica` senza ordine (0008) |
| vista magazzino | sì | sì | sì | sì (senza costi) |

Tutte le tabelle hanno `attivo`, i campi `creato_*`/`aggiornato_*`, i trigger `b_aggiornamento`, `vieta_cancellazione`, `z_registro`.
Provata in locale con PGlite (23/11): numerazione, unità e costo di lastre e bobine, arrivi parziali e completi, stato automatico, scarichi degli operai, sotto scorta e sotto zero, permessi dei 4 ruoli e degli utenti non collegati.

---

## 6. Contabilità / quinta scheda
Da definire. La scheda anagrafica prepara già i dati per la fatturazione elettronica (XML, scadenze, Ri.Ba., reverse charge, dichiarazioni d'intento): se la quinta scheda sarà la fatturazione, partirà da qui.

---

## Permessi per ruolo (proposta per le sezioni future, da confermare)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| Anagrafiche clienti/fornitori/articoli | tutto (no cancellazione) | tutto (no cancellazione) | lettura | — |
| Tabelle fiscali (codici IVA, pagamenti, banche aziendali) | tutto | lettura | tutto | — |
| Dipendenti | tutto (anche da Anagrafiche) | lettura | lettura | solo sé stesso |
| Preventivi (fasi, ore, materiali, modelli, costi e margini) | tutto | tutto | lettura | — |
| Tariffe orarie | tutto | lettura | lettura | — |
| Commesse e task | tutto | tutto | lettura | solo i propri task |
| Timbrature | tutto | lettura e correzione | lettura ed export | solo le proprie, solo nuove |
| Registro modifiche | lettura | — | — | — |

Schede visibili nel menu (da `src/lib/ruoli.ts`): Dashboard, Produzione, Magazzino, Timbrature a tutti; Preventivi e Anagrafiche a titolare, ufficio, contabilità; Impostazioni solo al titolare.
