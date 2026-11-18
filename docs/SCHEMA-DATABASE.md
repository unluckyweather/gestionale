# Schema del database – Gestionale

> **Documento di riferimento condiviso.** Ogni chat del progetto lo legge prima di toccare il database.
> Chi aggiunge o modifica una tabella aggiorna questo file nello stesso momento.
> Stato: **v0.3** (17/11/2026) – Fondamenta in `0001_fondamenta.sql` (applicata su `gestionale-dev`), Anagrafiche in `0002_anagrafiche.sql`; le altre sezioni sono ancora bozza.

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
> Oggi tracciate: `profili`, `dipendenti` e tutte le tabelle delle Anagrafiche. Da agganciare: `timbrature` (obbligo di tracciare le correzioni), `preventivi`, `commesse`.
> Serve anche per le "Attività recenti" della Dashboard: oggi lo legge solo il titolare; quando si farà la Dashboard si deciderà cosa mostrare agli altri ruoli.

### Permessi Fondamenta (attivi)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| profili | lettura di tutti, modifica | lettura di tutti | lettura di tutti | solo il proprio, lettura |
| dipendenti | tutto (no cancellazione) | lettura | lettura | solo sé stesso, lettura |
| registro_modifiche | lettura | — | — | — |

---

## 2. Anagrafiche — ✅ in `0002_anagrafiche.sql`

Enum `tipo_soggetto`: `cliente`, `fornitore`, `entrambi`.
Enum `tipo_articolo`: `articolo`, `lavorazione`, `servizio`.
Tutte le tabelle hanno `attivo` (predefinito true), i campi `creato_*`/`aggiornato_*`, i trigger `b_aggiornamento`, `vieta_cancellazione`, `z_registro` (sono tutte tracciate nel registro).
Solo soggetti italiani (decisione 17/11): i controlli di formato sono quelli italiani.

### `soggetti` — clienti e fornitori (una sola tabella)
| campo | tipo | note |
|---|---|---|
| tipo | tipo_soggetto | predefinito `cliente`; `entrambi` compare sia tra i clienti sia tra i fornitori |
| ragione_sociale | text | obbligatoria (non vuota) |
| partita_iva | text | 11 cifre; **unica tra i soggetti attivi** |
| codice_fiscale | text | 16 caratteri (persone) o 11 cifre (aziende) |
| codice_sdi | text | 7 caratteri (privati: `0000000`) |
| pec, email | text | formato email |
| indirizzo, citta, telefono, referente, note | text | |
| cap | text | 5 cifre |
| provincia | text | sigla di 2 lettere maiuscole |
| condizione_pagamento_id | uuid → condizioni_pagamento | facoltativo |
| listino_id | uuid → listini | vuoto = paga il prezzo base |

> Trigger `a_normalizza` (`normalizza_soggetto`): prima di salvare toglie spazi, mette in maiuscolo CF/SDI/provincia, toglie "IT" e punti dalla P.IVA, mette in minuscolo email/PEC, trasforma i campi vuoti in null.
> La cifra di controllo di P.IVA e codice fiscale la verifica l'app (`src/lib/validazioni.ts`), il database controlla solo il formato.

### `condizioni_pagamento`
`descrizione` (obbligatoria, unica tra le attive, es. "Bonifico 30 gg"), `giorni` (0–365).
Dati iniziali: Rimessa diretta (0), Bonifico 30 gg (30), Bonifico 60 gg (60).

### `listini`
`nome` (obbligatorio, unico tra gli attivi, es. "Rivenditori"), `note`.
Non c'è un listino "Standard": chi non ha listino paga il **prezzo base** dell'articolo.

### `articoli` — articoli, lavorazioni e servizi
| campo | tipo | note |
|---|---|---|
| codice | text | facoltativo; se c'è, unico tra gli attivi (maiuscole/minuscole uguali) |
| descrizione | text | obbligatoria |
| tipo | tipo_articolo | predefinito `articolo` |
| unita_misura | text | obbligatoria, predefinito `pz` |
| prezzo_base | numeric(12,4) | ≥ 0, IVA esclusa. **4 decimali** (prezzi al pezzo come 0,0350 €) |
| aliquota_iva | numeric(5,2) | 22, 10, 5, 4 o 0; predefinito 22 |
| note | text | |

> Trigger `a_normalizza` (`normalizza_articolo`): toglie spazi, codice vuoto → null.

### `prezzi_listino` — prezzo di un articolo in un listino
`listino_id`, `articolo_id`, `prezzo` numeric(12,4) ≥ 0. **Una sola riga per coppia** (`unique (listino_id, articolo_id)`): per togliere un prezzo si mette `attivo = false`, per rimetterlo si riattiva la stessa riga (l'app usa un *upsert*).

### Funzione `prezzo_per_cliente(articolo, soggetto)`
Restituisce il prezzo del listino del cliente se c'è (riga attiva, listino attivo), altrimenti il prezzo base. **Da usare nei Preventivi** per proporre il prezzo di una riga. Rispetta i permessi di chi la chiama.

### Permessi Anagrafiche (attivi)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| soggetti, articoli, listini, prezzi_listino, condizioni_pagamento | lettura, inserimento, modifica | lettura, inserimento, modifica | lettura | — |

> **Per la chat Produzione:** gli operai oggi non leggono `soggetti`. Se nelle commesse/task devono vedere il nome del cliente, serve una regola o una vista apposita (solo `ragione_sociale` dei clienti delle commesse visibili).
> **Per la chat Preventivi:** il mockup mostra in Anagrafiche il numero di preventivi e commesse collegati a un cliente: da aggiungere alla scheda cliente quando esisteranno quelle tabelle.

---

## 3. Preventivi

### `preventivi`
| campo | tipo | note |
|---|---|---|
| numero | text | `P-2026-112`, progressivo per anno |
| soggetto_id | uuid → soggetti | cliente |
| data, valido_fino | date | |
| stato | enum | `bozza`, `inviato`, `accettato`, `rifiutato` |
| note | text | |
| imponibile, iva, totale | numeric | calcolati dalle righe |

### `righe_preventivo`
| campo | tipo | note |
|---|---|---|
| preventivo_id | uuid → preventivi | |
| articolo_id | uuid → articoli | facoltativo (riga libera) |
| descrizione | text | |
| quantita, prezzo_unitario, sconto | numeric | |
| aliquota_iva | numeric | |
| ordine | int | posizione della riga |

---

## 4. Produzione

### `commesse`
| campo | tipo | note |
|---|---|---|
| numero | text | `C-2026-041`, progressivo per anno |
| preventivo_id | uuid → preventivi | facoltativo (commessa senza preventivo) |
| soggetto_id | uuid → soggetti | cliente |
| descrizione | text | |
| data_consegna | date | |
| stato | enum | `da_pianificare`, `in_lavorazione`, `controllo_qualita`, `completata` |
| urgente | bool | |
| avanzamento | int | 0–100 % |

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

> Le ore lavorate e gli stati (presente, in pausa, non timbrato) si **calcolano** dalle timbrature, non si salvano.
> Le correzioni dell'ufficio finiscono in `registro_modifiche`.

### `assenze`
`dipendente_id`, `tipo` (`ferie`, `permesso`, `altro`), `dal`, `al`, `note`.

---

## 6. Contabilità / quinta scheda
Da definire.

---

## Permessi per ruolo (proposta per le sezioni future, da confermare)
| | Titolare | Ufficio | Contabilità | Operaio |
|---|---|---|---|---|
| Anagrafiche clienti/fornitori/articoli | tutto (no cancellazione) | tutto (no cancellazione) | lettura | — |
| Dipendenti | tutto (anche da Anagrafiche) | lettura | lettura | solo sé stesso |
| Preventivi | tutto | tutto | lettura | — |
| Commesse e task | tutto | tutto | lettura | solo i propri task |
| Timbrature | tutto | lettura e correzione | lettura ed export | solo le proprie, solo nuove |
| Registro modifiche | lettura | — | — | — |

Schede visibili nel menu (da `src/lib/ruoli.ts`): Dashboard, Produzione, Timbrature a tutti; Preventivi e Anagrafiche a titolare, ufficio, contabilità; Impostazioni solo al titolare.
