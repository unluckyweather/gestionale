"use server";
// Salvataggi della scheda Anagrafiche. Ogni azione controlla il ruolo con richiediRuolo;
// il database (RLS) rifiuterebbe comunque chi non ha i permessi.
//   clienti/fornitori, articoli, categorie → titolare e ufficio
//   codici IVA, condizioni di pagamento, banche aziendali → titolare e contabilità
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import {
  codiceFiscaleValido,
  emailValida,
  abiCabDaIban,
  ibanValido,
  leggiNumero,
  partitaIvaValida,
  pulisciCodiceFiscale,
  pulisciIban,
} from "@/lib/validazioni";

/** Risposta dei moduli grandi: in caso di errore restituisce anche i valori scritti, per non perderli. */
export type StatoModulo = { errore?: string; valori?: Record<string, string> };

type Scheda = "clienti" | "fornitori" | "articoli" | "tabelle";

const TIPI_SOGGETTO = ["cliente", "fornitore", "entrambi"];
const FORME = ["azienda", "persona_fisica", "pubblica_amministrazione"];
const TIPI_ARTICOLO = ["articolo", "lavorazione", "servizio"];
const DOCUMENTI_RC = ["TD16", "TD17", "TD18", "TD19"];
const ALIQUOTE = [22, 10, 5, 4, 0];

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

/** Testo ripulito, oppure null se vuoto. */
function oNull(valore: unknown): string | null {
  const t = String(valore ?? "").trim();
  return t ? t : null;
}

/** Tutti i campi del modulo (tranne quelli interni di Next.js), da restituire in caso di errore. */
function valoriDi(dati: FormData): Record<string, string> {
  const valori: Record<string, string> = {};
  dati.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) valori[k] = v;
  });
  return valori;
}

function vaiA(scheda: Scheda, messaggio: string, id?: string): never {
  const parametri = new URLSearchParams({ scheda, ok: messaggio });
  if (id) parametri.set("id", id);
  redirect(`/anagrafiche?${parametri}`);
}

function spiegaErrore(errore: PostgrestError, doppione: string): string {
  if (errore.code === "23505") {
    if (errore.message.includes("partita_iva"))
      return "Esiste già un cliente o fornitore attivo con questa partita IVA: cercalo nell'elenco.";
    if (errore.message.includes("protocollo"))
      return "Questo protocollo di dichiarazione d'intento è già registrato.";
    if (errore.message.includes("una_operativa")) return "C'è già una sede operativa per questo soggetto.";
    return doppione;
  }
  if (errore.code === "23514") return "Un campo non è nel formato giusto: controlla i dati e riprova.";
  if (errore.code === "42501") return "Non hai i permessi per questa modifica.";
  if (errore.code === "P0001") return errore.message; // messaggi scritti da noi nel database
  return "Salvataggio non riuscito. Riprova.";
}

function numeroIntero(valore: string, min: number, max: number): number | null | "errore" {
  if (!valore) return null;
  const n = Number(valore);
  return Number.isInteger(n) && n >= min && n <= max ? n : "errore";
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;


// ---------------------------------------------------------------------
// Clienti e fornitori (scheda intera: soggetto + contatti + sedi + dichiarazioni)
// ---------------------------------------------------------------------
type RigaJson = Record<string, unknown>;

function leggiElenco(dati: FormData, campo: string): RigaJson[] {
  try {
    const elenco = JSON.parse(testo(dati, campo) || "[]");
    return Array.isArray(elenco) ? elenco.filter((r) => r && typeof r === "object") : [];
  } catch {
    return [];
  }
}

/** Vero se tutti i campi indicati sono vuoti (riga lasciata in bianco: si ignora). */
function rigaVuota(riga: RigaJson, campi: string[]): boolean {
  return campi.every((c) => !String(riga[c] ?? "").trim());
}

export async function salvaSoggetto(_prima: StatoModulo, dati: FormData): Promise<StatoModulo> {
  await richiediRuolo("titolare", "ufficio");
  const valori = valoriDi(dati);
  const sbaglio = (errore: string): StatoModulo => ({ errore, valori });

  const id = testo(dati, "id");
  const tipo = testo(dati, "tipo");
  const forma = testo(dati, "forma");
  const scheda: Scheda = testo(dati, "scheda") === "fornitori" ? "fornitori" : "clienti";

  if (!TIPI_SOGGETTO.includes(tipo)) return sbaglio("Scegli se è cliente, fornitore o entrambi.");
  if (!FORME.includes(forma)) return sbaglio("Scegli se è un'azienda, una persona fisica o una PA.");

  const persona = forma === "persona_fisica";
  const pa = forma === "pubblica_amministrazione";
  const ragioneSociale = testo(dati, "ragione_sociale");
  if (!persona && !ragioneSociale)
    return sbaglio(pa ? "La denominazione dell'ente è obbligatoria." : "La ragione sociale è obbligatoria.");
  if (persona && (!testo(dati, "cognome") || !testo(dati, "nome")))
    return sbaglio("Per una persona fisica servono cognome e nome.");

  // --- dati fiscali: i controlli italiani solo se il paese è IT
  const paeseIva = testo(dati, "paese_iva").toUpperCase() || "IT";
  const italiano = paeseIva === "IT";
  let partitaIva = testo(dati, "partita_iva").toUpperCase().replace(/[\s.]/g, "");
  if (partitaIva.startsWith(paeseIva)) partitaIva = partitaIva.slice(2);
  const codiceFiscale = pulisciCodiceFiscale(testo(dati, "codice_fiscale"));
  const codiceSdi = testo(dati, "codice_sdi").toUpperCase().replace(/\s/g, "");
  const codiceUfficio = testo(dati, "codice_ufficio_pa").toUpperCase().replace(/\s/g, "");
  const pec = testo(dati, "pec");

  if (!/^[A-Z]{2}$/.test(paeseIva)) return sbaglio("La sigla del paese della partita IVA ha 2 lettere (es. IT, DE).");
  if (partitaIva && italiano && !partitaIvaValida(partitaIva))
    return sbaglio("La partita IVA non è valida: controlla le 11 cifre.");
  if (partitaIva && !italiano && !/^[A-Z0-9]{2,28}$/.test(partitaIva))
    return sbaglio("La partita IVA estera può contenere solo lettere e numeri.");
  if (codiceFiscale && italiano && !codiceFiscaleValido(codiceFiscale))
    return sbaglio("Il codice fiscale non è valido: controlla i caratteri.");
  if (codiceSdi && !/^[A-Z0-9]{7}$/.test(codiceSdi))
    return sbaglio("Il codice SDI ha 7 caratteri (privati: 0000000; esteri: XXXXXXX).");
  if (pa && codiceUfficio && !/^[A-Z0-9]{6}$/.test(codiceUfficio))
    return sbaglio("Il codice univoco ufficio della PA ha 6 caratteri.");
  if (pec && !emailValida(pec)) return sbaglio("La PEC non è valida.");

  // --- sede legale
  const nazione = testo(dati, "nazione").toUpperCase() || "IT";
  const cap = testo(dati, "cap");
  const provincia = testo(dati, "provincia").toUpperCase();
  if (!/^[A-Z]{2}$/.test(nazione)) return sbaglio("Scegli la nazione della sede legale.");
  if (nazione === "IT" && cap && !/^\d{5}$/.test(cap)) return sbaglio("Il CAP della sede legale ha 5 cifre.");
  if (nazione === "IT" && provincia && !/^[A-Z]{2}$/.test(provincia))
    return sbaglio("La provincia è la sigla di 2 lettere (es. TV).");

  // --- banca
  const iban = pulisciIban(testo(dati, "iban"));
  const daIban = abiCabDaIban(iban);
  const abi = testo(dati, "abi") || daIban?.abi || "";
  const cab = testo(dati, "cab") || daIban?.cab || "";
  if (iban && !ibanValido(iban)) return sbaglio("L'IBAN non è valido: controlla lettere e cifre.");
  if (abi && !/^\d{5}$/.test(abi)) return sbaglio("L'ABI ha 5 cifre.");
  if (cab && !/^\d{5}$/.test(cab)) return sbaglio("Il CAB ha 5 cifre.");

  // --- scadenze
  const mese1 = numeroIntero(testo(dati, "mese_escluso_1"), 1, 12);
  const mese2 = numeroIntero(testo(dati, "mese_escluso_2"), 1, 12);
  const giornoFisso = numeroIntero(testo(dati, "giorno_fisso"), 1, 31);
  if (mese1 === "errore" || mese2 === "errore") return sbaglio("Mese escluso non valido.");
  if (giornoFisso === "errore") return sbaglio("Il giorno fisso è un numero da 1 a 31.");

  // --- reverse charge (solo fornitori)
  const reverse = tipo !== "cliente" && dati.get("reverse_charge") === "on";
  const rcDocumento = testo(dati, "rc_tipo_documento");
  const rcNatura = testo(dati, "rc_natura").toUpperCase();
  if (reverse && !DOCUMENTI_RC.includes(rcDocumento)) return sbaglio("Scegli il documento da generare per il reverse charge.");
  if (reverse && rcNatura && !/^N[1-7](\.[1-9])?$/.test(rcNatura))
    return sbaglio("La natura del reverse charge è nel formato N6.1, N6.2…");

  // --- privacy
  const privacyInviata = testo(dati, "privacy_inviata_il");
  const privacyFirmata = testo(dati, "privacy_firmata_il");
  if ((privacyInviata && !DATA.test(privacyInviata)) || (privacyFirmata && !DATA.test(privacyFirmata)))
    return sbaglio("Data della privacy non valida.");

  // --- contatti
  const contatti: RigaJson[] = [];
  for (const c of leggiElenco(dati, "contatti")) {
    if (rigaVuota(c, ["riferimento", "persona", "email", "telefono", "cellulare"])) continue;
    const email = String(c.email ?? "").trim();
    if (email && !emailValida(email)) return sbaglio(`L'email del contatto «${email}» non è valida.`);
    contatti.push({
      id: oNull(c.id),
      riferimento: oNull(c.riferimento),
      persona: oNull(c.persona),
      email: oNull(email),
      telefono: oNull(c.telefono),
      cellulare: oNull(c.cellulare),
      riceve_preventivi: c.riceve_preventivi === true,
      riceve_fatture: c.riceve_fatture === true,
    });
  }

  // --- sedi (la operativa arriva nello stesso elenco, con tipo = operativa)
  const sedi: RigaJson[] = [];
  for (const s of leggiElenco(dati, "sedi")) {
    if (rigaVuota(s, ["nome", "indirizzo", "comune"])) continue;
    const sedeNazione = String(s.nazione ?? "IT").toUpperCase() || "IT";
    const sedeCap = String(s.cap ?? "").trim();
    const sedeProv = String(s.provincia ?? "").trim().toUpperCase();
    const operativa = s.tipo === "operativa";
    const nomeSede = operativa ? "della sede operativa" : `della sede «${String(s.nome || s.comune || "").trim()}»`;
    if (sedeNazione === "IT" && sedeCap && !/^\d{5}$/.test(sedeCap)) return sbaglio(`Il CAP ${nomeSede} ha 5 cifre.`);
    if (sedeNazione === "IT" && sedeProv && !/^[A-Z]{2}$/.test(sedeProv))
      return sbaglio(`La provincia ${nomeSede} è la sigla di 2 lettere.`);
    sedi.push({
      id: oNull(s.id),
      tipo: operativa ? "operativa" : "altra",
      nome: oNull(s.nome),
      indirizzo: oNull(s.indirizzo),
      civico: oNull(s.civico),
      cap: oNull(sedeCap),
      comune: oNull(s.comune),
      provincia: oNull(sedeProv),
      nazione: /^[A-Z]{2}$/.test(sedeNazione) ? sedeNazione : "IT",
      telefono: oNull(s.telefono),
      annotazioni: oNull(s.annotazioni),
      consegna: operativa || s.consegna === true,
    });
  }

  // --- dichiarazioni d'intento (solo clienti)
  const dichiarazioni: RigaJson[] = [];
  for (const d of leggiElenco(dati, "dichiarazioni")) {
    if (rigaVuota(d, ["protocollo", "data", "importo"])) continue;
    if (tipo === "fornitore") return sbaglio("Le dichiarazioni d'intento si registrano solo per i clienti.");
    const protocollo = String(d.protocollo ?? "").replace(/[\s/]+/g, "-").replace(/^(\d{17})-*(\d{6})$/, "$1-$2");
    const data = String(d.data ?? "");
    const anno = Number(d.anno);
    const importo = leggiNumero(String(d.importo ?? ""));
    if (!/^\d{17}-\d{6}$/.test(protocollo))
      return sbaglio("Il protocollo della dichiarazione d'intento è di 17 cifre + 6 cifre.");
    if (!DATA.test(data)) return sbaglio("Manca la data della dichiarazione d'intento.");
    if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) return sbaglio("Anno della dichiarazione d'intento non valido.");
    if (importo === null || importo <= 0) return sbaglio("L'importo della dichiarazione d'intento non è valido.");
    dichiarazioni.push({ id: oNull(d.id), protocollo, data, anno, importo });
  }

  // La pulizia (spazi, maiuscole, campi vuoti) la ripete anche il database.
  const soggetto = {
    tipo,
    forma,
    ragione_sociale: persona ? null : ragioneSociale,
    cognome: persona ? testo(dati, "cognome") : null,
    nome: persona ? testo(dati, "nome") : null,
    nome_breve: oNull(testo(dati, "nome_breve")),
    categoria_id: oNull(testo(dati, "categoria_id")),
    sito_web: oNull(testo(dati, "sito_web")),
    paese_iva: paeseIva,
    partita_iva: oNull(partitaIva),
    codice_fiscale: oNull(codiceFiscale),
    codice_sdi: oNull(codiceSdi),
    codice_ufficio_pa: pa ? oNull(codiceUfficio) : null,
    split_payment: pa && dati.get("split_payment") === "on",
    pec: oNull(pec),
    codice_iva_abituale_id: oNull(testo(dati, "codice_iva_abituale_id")),
    indirizzo: oNull(testo(dati, "indirizzo")),
    civico: oNull(testo(dati, "civico")),
    cap: oNull(cap),
    comune: oNull(testo(dati, "comune")),
    provincia: oNull(provincia),
    nazione,
    iban: oNull(iban),
    abi: oNull(abi),
    cab: oNull(cab),
    banca_agenzia: oNull(testo(dati, "banca_agenzia")),
    banca_aziendale_id: oNull(testo(dati, "banca_aziendale_id")),
    note_riba: oNull(testo(dati, "note_riba")),
    condizione_pagamento_id: oNull(testo(dati, "condizione_pagamento_id")),
    mese_escluso_1: mese1,
    mese_escluso_2: mese2,
    giorno_fisso: giornoFisso,
    reverse_charge: reverse,
    rc_tipo_documento: reverse ? rcDocumento : null,
    rc_natura: reverse ? oNull(rcNatura) : null,
    rc_codice_iva_id: reverse ? oNull(testo(dati, "rc_codice_iva_id")) : null,
    note_interne: oNull(testo(dati, "note_interne")),
    note_documenti: oNull(testo(dati, "note_documenti")),
    privacy_inviata_il: oNull(privacyInviata),
    privacy_firmata_il: oNull(privacyFirmata),
    attivo: id ? dati.get("attivo") === "on" : true,
  };

  // Tutto in un colpo solo: se una parte non va, il database non salva niente.
  const supabase = await creaClientServer();
  const { data: nuovoId, error } = await supabase.rpc("salva_soggetto", {
    p_id: id || null,
    p_soggetto: soggetto,
    p_contatti: contatti,
    p_sedi: sedi,
    p_dichiarazioni: tipo === "fornitore" ? [] : dichiarazioni,
  });
  if (error) return sbaglio(spiegaErrore(error, "Esiste già un dato uguale: controlla la scheda."));

  revalidatePath("/anagrafiche");
  const nome = persona ? `${soggetto.cognome} ${soggetto.nome}` : ragioneSociale;
  vaiA(scheda, id ? "Modifiche salvate." : `${nome} aggiunto.`, String(nuovoId));
}


// ---------------------------------------------------------------------
// Articoli (catalogo materiali con costo)
// ---------------------------------------------------------------------
export async function salvaArticolo(_prima: StatoModulo, dati: FormData): Promise<StatoModulo> {
  await richiediRuolo("titolare", "ufficio");
  const valori = valoriDi(dati);
  const sbaglio = (errore: string): StatoModulo => ({ errore, valori });

  const id = testo(dati, "id");
  const tipo = testo(dati, "tipo");
  const costo = leggiNumero(testo(dati, "costo_unitario") || "0");
  const larghezzaTesto = testo(dati, "larghezza_bobina_m");
  const larghezza = larghezzaTesto ? leggiNumero(larghezzaTesto) : null;

  if (!testo(dati, "descrizione")) return sbaglio("La descrizione è obbligatoria.");
  if (!TIPI_ARTICOLO.includes(tipo)) return sbaglio("Tipo non valido.");
  if (!testo(dati, "unita_misura")) return sbaglio("L'unità di misura è obbligatoria (es. pz, m2, ml).");
  if (costo === null || costo < 0) return sbaglio("Il costo unitario non è un numero valido.");
  if (larghezzaTesto && (larghezza === null || larghezza <= 0 || larghezza >= 1000))
    return sbaglio("La larghezza della bobina non è valida (in metri, es. 1,37).");

  // lastra: tutte e due le misure in cm (es. 305 × 205), oppure nessuna
  const misuraLastra = (campo: string) => {
    const t = testo(dati, campo);
    if (!t) return null;
    const n = leggiNumero(t);
    return n === null || n <= 0 || n >= 100000 ? NaN : Math.round(n * 10) / 10;
  };
  const lastraL = misuraLastra("lastra_larghezza_cm");
  const lastraH = misuraLastra("lastra_altezza_cm");
  if (Number.isNaN(lastraL) || Number.isNaN(lastraH))
    return sbaglio("Le misure della lastra non sono valide (in centimetri, es. 305 e 205).");
  if ((lastraL === null) !== (lastraH === null)) return sbaglio("Per la lastra scrivi sia la larghezza sia l'altezza.");
  if (lastraL !== null && larghezza !== null)
    return sbaglio("Un articolo è in bobina oppure a lastra: togli la larghezza della bobina o le misure della lastra.");

  const record = {
    codice: oNull(testo(dati, "codice")),
    descrizione: testo(dati, "descrizione"),
    tipo,
    unita_misura: testo(dati, "unita_misura"),
    costo_unitario: costo,
    larghezza_bobina_m: larghezza,
    lastra_larghezza_cm: lastraL,
    lastra_altezza_cm: lastraH,
    codice_iva_id: oNull(testo(dati, "codice_iva_id")),
    fornitore_id: oNull(testo(dati, "fornitore_id")),
    note: oNull(testo(dati, "note")),
  };
  const doppione = "Esiste già un articolo attivo con questo codice.";
  const supabase = await creaClientServer();

  if (!id) {
    const { data, error } = await supabase.from("articoli").insert(record).select("id").single();
    if (error) return sbaglio(spiegaErrore(error, doppione));
    revalidatePath("/anagrafiche");
    vaiA("articoli", `${record.descrizione} aggiunto.`, data.id);
  }

  const { data, error } = await supabase
    .from("articoli")
    .update({ ...record, attivo: dati.get("attivo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) return sbaglio(spiegaErrore(error, doppione));
  if (!data?.length) return sbaglio("Articolo non trovato o permessi insufficienti.");

  revalidatePath("/anagrafiche");
  vaiA("articoli", "Modifiche salvate.", id);
}


// ---------------------------------------------------------------------
// Tabelle di servizio (moduli piccoli, una riga ciascuno)
// ---------------------------------------------------------------------
function tornaTabelle(messaggio: string, errore = false): never {
  redirect(`/anagrafiche?scheda=tabelle&${errore ? "errore" : "ok"}=${encodeURIComponent(messaggio)}`);
}

/** Inserisce (senza id) o aggiorna (con id, anche "attivo") una riga, poi torna alla scheda. */
async function salvaRiga(
  tabella: string,
  dati: FormData,
  record: Record<string, unknown>,
  messaggi: { nuovo: string; doppione: string }
): Promise<never> {
  const id = testo(dati, "id");
  const supabase = await creaClientServer();
  const { data, error } = id
    ? await supabase.from(tabella).update({ ...record, attivo: dati.get("attivo") === "on" }).eq("id", id).select("id")
    : await supabase.from(tabella).insert(record).select("id");
  if (error) tornaTabelle(spiegaErrore(error, messaggi.doppione), true);
  if (!data?.length) tornaTabelle("Non trovata o permessi insufficienti.", true);
  revalidatePath("/anagrafiche");
  tornaTabelle(id ? "Modifica salvata." : messaggi.nuovo);
}

export async function salvaCodiceIva(dati: FormData) {
  await richiediRuolo("titolare", "contabilita");
  const codice = testo(dati, "codice");
  const descrizione = testo(dati, "descrizione");
  const aliquota = Number(testo(dati, "aliquota"));
  const natura = testo(dati, "natura").toUpperCase() || null;
  if (!codice || !descrizione) tornaTabelle("Codice e descrizione del codice IVA sono obbligatori.", true);
  if (!ALIQUOTE.includes(aliquota)) tornaTabelle("Aliquota non valida (22, 10, 5, 4 o 0).", true);
  if (aliquota === 0 && !natura) tornaTabelle("Con aliquota 0 serve la natura (es. N3.1).", true);
  if (aliquota > 0 && natura) tornaTabelle("La natura si indica solo con aliquota 0.", true);
  if (natura && !/^N[1-7](\.[1-9])?$/.test(natura)) tornaTabelle("La natura è nel formato N1…N7 (es. N3.1).", true);
  await salvaRiga("codici_iva", dati, { codice, descrizione, aliquota, natura }, {
    nuovo: `Codice IVA ${codice} aggiunto.`,
    doppione: "Esiste già un codice IVA attivo con questo codice.",
  });
}

export async function salvaCondizionePagamento(dati: FormData) {
  await richiediRuolo("titolare", "contabilita");
  const descrizione = testo(dati, "descrizione");
  const giorni = Number(testo(dati, "giorni") || "0");
  if (!descrizione) tornaTabelle("La descrizione è obbligatoria.", true);
  if (!Number.isInteger(giorni) || giorni < 0 || giorni > 365)
    tornaTabelle("I giorni devono essere un numero intero da 0 a 365.", true);
  await salvaRiga("condizioni_pagamento", dati, { descrizione, giorni }, {
    nuovo: `${descrizione} aggiunta.`,
    doppione: "Esiste già una condizione di pagamento con questa descrizione.",
  });
}

export async function salvaBancaAziendale(dati: FormData) {
  await richiediRuolo("titolare", "contabilita");
  const nome = testo(dati, "nome");
  const iban = pulisciIban(testo(dati, "iban"));
  const daIban = abiCabDaIban(iban);
  const abi = testo(dati, "abi") || daIban?.abi || "";
  const cab = testo(dati, "cab") || daIban?.cab || "";
  if (!nome) tornaTabelle("Il nome della banca è obbligatorio.", true);
  if (iban && !ibanValido(iban)) tornaTabelle("L'IBAN non è valido.", true);
  if ((abi && !/^\d{5}$/.test(abi)) || (cab && !/^\d{5}$/.test(cab))) tornaTabelle("ABI e CAB hanno 5 cifre.", true);
  await salvaRiga(
    "banche_aziendali",
    dati,
    { nome, iban: iban || null, abi: abi || null, cab: cab || null, note: testo(dati, "note") || null },
    { nuovo: `Banca ${nome} aggiunta.`, doppione: "Esiste già una banca aziendale con questo nome." }
  );
}

export async function salvaCategoria(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const descrizione = testo(dati, "descrizione");
  if (!descrizione) tornaTabelle("La descrizione della categoria è obbligatoria.", true);
  await salvaRiga("categorie_soggetto", dati, { descrizione }, {
    nuovo: `Categoria ${descrizione} aggiunta.`,
    doppione: "Esiste già una categoria con questo nome.",
  });
}
