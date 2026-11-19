# Schema del database – Gestionale

> **Documento di riferimento condiviso.** Ogni chat del progetto lo legge prima di toccare il database.
> Chi aggiunge o modifica una tabella aggiorna questo file nello stesso momento.
> Stato: **v0.5** (19/11/2026) – Fondamenta in `0001_fondamenta.sql` (applicata su `gestionale-dev`). Anagrafiche: `0002_anagrafiche.sql` riscritta secondo la sezione 2 (v0.5) e **applicata su `gestionale-dev`**. Le altre sezioni sono bozza.
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

> Il profilo nasce da solo quando si crea un utente su Supabase (trigger `al_nuovo_utente` su `auth.users`).
> Nessuno può cambiare il **proprio** ruolo o disattivare il **proprio** account (trigger `a_proteggi`).
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
> Oggi tracciate: `profili`, `dipendenti` e (con la 0002) tutte le tabelle delle Anagrafiche; da tracciare `timbrature` (obbligo di tracciare le correzioni), `preventivi`, `commesse`.
> Serve anche per le "Attività recenti" della Dashboard e per il pulsante "Storico modifiche" della scheda cliente/fornitore.

### Permessi Fondamenta (attivi)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| profili | lettura di tutti, modifica | lettura di tutti | lettura di tutti | solo il proprio, lettura |
| dipendenti | tutto (no cancellazione) | lettura | lettura | solo sé stesso, lettura |
| registro_modifiche | lettura | — | — | — |

---

## 2. Anagrafiche — v0.5 (19/11), in `0002_anagrafiche.sql` (applicata su `gestionale-dev`)

Riferimento: artboard *Anagrafiche – scheda cliente/fornitore* del mockup confermato.
Tutte le tabelle hanno `attivo` (predefinito true), i campi `creato_*`/`aggiornato_*`, i trigger `b_aggiornamento`, `vieta_cancellazione`, `z_registro`.

**Decisioni del 19/11:**
- **Anche soggetti esteri e pubblica amministrazione** (supera la decisione del 17/11 "solo soggetti italiani"). I controlli di formato italiani (P.IVA 11 cifre, CF, CAP 5 cifre, provincia) si applicano **solo se il paese è IT**.
- L'azienda lavora su misura: **niente listino di vendita**. `articoli` è il catalogo dei **materiali acquistati con il loro costo** (usato nei preventivi a fasi, sezione 3). `listini` e `prezzi_listino` non si creano; nel mockup il campo "Listino" è disattivato.
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
| categoria_id | uuid → categorie_soggetto | categoria merceologica, facoltativa |
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
> **Salvataggio della scheda intera:** funzione `salva_soggetto(p_id, p_soggetto, p_contatti, p_sedi, p_dichiarazioni)` (JSON). Salva soggetto, contatti, sedi e dichiarazioni "tutto o niente": righe con `id` aggiornate, senza `id` nuove, righe attive non più presenti archiviate. È `security invoker`: valgono le regole RLS di chi la chiama. Restituisce l'id del soggetto.
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

### `categorie_soggetto` — nuova
`descrizione` (unica tra le attive). Categorie merceologiche di clienti/fornitori.

### `condizioni_pagamento`
`descrizione` (obbligatoria, unica tra le attive, es. "Ri.Ba. 30-60 gg f.m."), `giorni` (0–365).
Dati iniziali: Rimessa diretta (0), Bonifico 30 gg (30), Bonifico 60 gg (60).
> Le condizioni a più rate (30-60 gg, fine mese) e la modalità per l'XML (MP05 bonifico, MP12 Ri.Ba.…) richiedono campi in più: da dettagliare quando si farà la fatturazione.

### `articoli` — catalogo materiali (con costo)
| campo | tipo | note |
|---|---|---|
| codice | text | facoltativo; se c'è, unico tra gli attivi (maiuscole/minuscole uguali) |
| descrizione | text | obbligatoria |
| tipo | tipo_articolo | `articolo`, `lavorazione`, `servizio`; predefinito `articolo` |
| unita_misura | text | obbligatoria, predefinito `pz`; tipiche `m2`, `ml`, `pz`, `foglio`, `lastra` |
| costo_unitario | numeric(12,4) | ≥ 0, IVA esclusa, **4 decimali** |
| larghezza_bobina_m | numeric(6,3) | solo materiali in bobina: m² = larghezza × metri lineari |
| codice_iva_id | uuid → codici_iva | predefinito 22 |
| fornitore_id | uuid → soggetti | facoltativo: fornitore abituale |
| note | text | |

> Trigger `a_normalizza` (`normalizza_articolo`): toglie spazi, codice vuoto → null, codice IVA vuoto → il codice "22" attivo.
> Rispetto alla vecchia `0002`: `prezzo_base` → `costo_unitario`, `aliquota_iva` → `codice_iva_id`; niente `listini`, `prezzi_listino`, `soggetti.listino_id`, funzione `prezzo_per_cliente`.

### Permessi Anagrafiche
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| soggetti, contatti, sedi, dichiarazioni d'intento, articoli, categorie | lettura, inserimento, modifica | lettura, inserimento, modifica | lettura | — |
| codici_iva, condizioni_pagamento, banche_aziendali | lettura, inserimento, modifica | lettura | lettura, inserimento, modifica | — |

> Proposta: le tabelle "fiscali" (codici IVA, pagamenti, banche aziendali) le modificano titolare e contabilità. Da confermare.
> **Per la chat Produzione:** gli operai non leggono `soggetti`. Se nelle commesse/task devono vedere il nome del cliente o l'indirizzo di posa, serve una vista apposita (solo nome e sede delle commesse visibili).
> **GDPR:** le persone fisiche e i contatti sono dati personali → campi privacy nella scheda; nessun dato di soggetti va mostrato agli operai oltre al necessario.

---

## 3. Preventivi — bozza v0.4 (a fasi, confermata 19/11)

Mockup: artboard *Preventivo a fasi (dettaglio)*.

Come funziona: un preventivo è fatto di **fasi** (es. Grafica, Stampa, Taglio e montaggio, Posa in loco). Ogni fase ha righe di **ore** (ore × tariffa oraria) e righe di **materiali** (quantità × costo). Costo totale + ricarico % = prezzo calcolato; il **prezzo al cliente** si può correggere a mano. Il cliente (PDF, email) vede solo le descrizioni delle fasi e il prezzo; ore, costi e ricarico restano interni.

Dati confermati dall'utente (19/11): **più tariffe orarie** (persona/reparto/macchina); materiali in bobina calcolati in **m² = larghezza bobina × metri lineari**; **la trasferta è compresa nella tariffa di posa** (nessuna voce separata); **costi, ricarico e margine visibili a titolare, ufficio e contabilità** (non agli operai).

Il PDF/email si invia ai contatti del cliente con `riceve_preventivi = true`.

### `tariffe_orarie` — nuova
| campo | tipo | note |
|---|---|---|
| nome | text | es. "Grafica", "Laboratorio", "Stampante UV", "Posa (trasferta compresa)" |
| tipo | enum | `persona`, `macchina`, `posa` |
| costo_orario | numeric(12,2) | € / ora |
| note | text | |

Modificabili solo dal titolare (in Impostazioni); lette da ufficio e contabilità.

### `preventivi`
| campo | tipo | note |
|---|---|---|
| numero | text | `P-2026-113`, progressivo per anno |
| soggetto_id | uuid → soggetti | cliente |
| oggetto | text | es. "Insegna luminosa negozio" |
| modello_id | uuid → modelli_lavorazione | facoltativo: da quale modello è partito |
| data, valido_fino | date | |
| stato | enum | `bozza`, `inviato`, `accettato`, `rifiutato` |
| ricarico_percentuale | numeric(5,2) | es. 35 |
| prezzo_cliente | numeric(12,2) | proposto da costo × (1 + ricarico), modificabile |
| codice_iva_id | uuid → codici_iva | proposto da `soggetti.codice_iva_abituale_id`, altrimenti 22 |
| cig, cup | text | solo per la PA |
| note | text | |
| costo_totale, ore_previste, iva, totale | numeric | **calcolati** dalle fasi (vista o funzione, non salvati a mano) |

### `fasi_preventivo` — nuova
| campo | tipo | note |
|---|---|---|
| preventivo_id | uuid → preventivi | |
| ordine | int | posizione |
| titolo | text | es. "Stampa" |
| descrizione_cliente | text | testo che va nel PDF |

### `ore_fase` — nuova
| campo | tipo | note |
|---|---|---|
| fase_id | uuid → fasi_preventivo | |
| tariffa_id | uuid → tariffe_orarie | |
| ore | numeric(6,2) | ore totali (es. 2 persone × 4 h = 8) |
| persone | int | facoltativo, solo per mostrare il dettaglio |
| costo_orario | numeric(12,2) | **copiato** dalla tariffa al momento del preventivo |

### `materiali_fase` — nuova
| campo | tipo | note |
|---|---|---|
| fase_id | uuid → fasi_preventivo | |
| articolo_id | uuid → articoli | facoltativo (materiale non a catalogo) |
| descrizione | text | |
| unita_misura | text | `m2`, `ml`, `pz`… |
| larghezza_m, metri_lineari | numeric | solo per bobine: quantità = larghezza × metri lineari |
| quantita | numeric(12,3) | |
| costo_unitario | numeric(12,4) | **copiato** dall'articolo |

### `modelli_lavorazione` — nuova (da dettagliare)
Stessa struttura del preventivo (modello → fasi → ore e materiali), senza cliente né date. Esempi: "Insegna luminosa", "Adesivo prespaziato", "Banner PVC con occhielli", "Wrapping furgone", "Bandiera a goccia".

---

## 4. Produzione

### `commesse`
| campo | tipo | note |
|---|---|---|
| numero | text | `C-2026-041`, progressivo per anno |
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

Schede visibili nel menu (da `src/lib/ruoli.ts`): Dashboard, Produzione, Timbrature a tutti; Preventivi e Anagrafiche a titolare, ufficio, contabilità; Impostazioni solo al titolare.
