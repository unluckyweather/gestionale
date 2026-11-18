"use server";
// Salvataggi della scheda Anagrafiche. Possono scrivere solo titolare e ufficio:
// lo controlla richiediRuolo qui e, comunque, il database (RLS) rifiuterebbe gli altri.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import {
  codiceFiscaleValido,
  emailValida,
  leggiNumero,
  partitaIvaValida,
  pulisciCodiceFiscale,
  pulisciPartitaIva,
} from "@/lib/validazioni";

/** Risposta dei moduli grandi: in caso di errore restituisce anche i valori scritti, per non perderli. */
export type StatoModulo = { errore?: string; valori?: Record<string, string> };

const SCHEDE = ["clienti", "fornitori", "articoli", "pagamenti"] as const;
type Scheda = (typeof SCHEDE)[number];

const TIPI_SOGGETTO = ["cliente", "fornitore", "entrambi"];
const TIPI_ARTICOLO = ["articolo", "lavorazione", "servizio"];
const ALIQUOTE = [22, 10, 5, 4, 0];

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
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
  if (errore.code === "23505") return doppione;
  if (errore.code === "23514") return "Un campo non è nel formato giusto: controlla i dati e riprova.";
  if (errore.code === "42501") return "Non hai i permessi per questa modifica.";
  if (errore.code === "P0001") return errore.message; // messaggi scritti da noi nei trigger
  return "Salvataggio non riuscito. Riprova.";
}


// ---------------------------------------------------------------------
// Clienti e fornitori
// ---------------------------------------------------------------------
export async function salvaSoggetto(_prima: StatoModulo, dati: FormData): Promise<StatoModulo> {
  await richiediRuolo("titolare", "ufficio");
  const valori = valoriDi(dati);
  const sbaglio = (errore: string): StatoModulo => ({ errore, valori });

  const id = testo(dati, "id");
  const scheda: Scheda = testo(dati, "scheda") === "fornitori" ? "fornitori" : "clienti";
  const tipo = testo(dati, "tipo");
  const partitaIva = pulisciPartitaIva(testo(dati, "partita_iva"));
  const codiceFiscale = pulisciCodiceFiscale(testo(dati, "codice_fiscale"));
  const codiceSdi = testo(dati, "codice_sdi").toUpperCase().replace(/\s/g, "");
  const cap = testo(dati, "cap");
  const provincia = testo(dati, "provincia").toUpperCase();
  const email = testo(dati, "email");
  const pec = testo(dati, "pec");

  if (!testo(dati, "ragione_sociale")) return sbaglio("La ragione sociale è obbligatoria.");
  if (!TIPI_SOGGETTO.includes(tipo)) return sbaglio("Scegli se è cliente, fornitore o entrambi.");
  if (partitaIva && !partitaIvaValida(partitaIva))
    return sbaglio("La partita IVA non è valida: controlla le 11 cifre.");
  if (codiceFiscale && !codiceFiscaleValido(codiceFiscale))
    return sbaglio("Il codice fiscale non è valido: controlla i caratteri.");
  if (codiceSdi && !/^[A-Z0-9]{7}$/.test(codiceSdi))
    return sbaglio("Il codice SDI ha 7 caratteri (per i privati: 0000000).");
  if (cap && !/^\d{5}$/.test(cap)) return sbaglio("Il CAP ha 5 cifre.");
  if (provincia && !/^[A-Z]{2}$/.test(provincia)) return sbaglio("La provincia è la sigla di 2 lettere (es. TV).");
  if (email && !emailValida(email)) return sbaglio("L'email non è valida.");
  if (pec && !emailValida(pec)) return sbaglio("La PEC non è valida.");

  // La pulizia (spazi, maiuscole, campi vuoti) la ripete anche il database.
  const record = {
    tipo,
    ragione_sociale: testo(dati, "ragione_sociale"),
    partita_iva: partitaIva || null,
    codice_fiscale: codiceFiscale || null,
    codice_sdi: codiceSdi || null,
    pec: pec || null,
    indirizzo: testo(dati, "indirizzo") || null,
    cap: cap || null,
    citta: testo(dati, "citta") || null,
    provincia: provincia || null,
    email: email || null,
    telefono: testo(dati, "telefono") || null,
    referente: testo(dati, "referente") || null,
    condizione_pagamento_id: testo(dati, "condizione_pagamento_id") || null,
    listino_id: testo(dati, "listino_id") || null,
    note: testo(dati, "note") || null,
  };
  const doppione = "Esiste già un cliente o fornitore attivo con questa partita IVA: cercalo nell'elenco.";

  const supabase = await creaClientServer();

  if (!id) {
    const { data, error } = await supabase.from("soggetti").insert(record).select("id").single();
    if (error) return sbaglio(spiegaErrore(error, doppione));
    revalidatePath("/anagrafiche");
    vaiA(scheda, `${record.ragione_sociale} aggiunto.`, data.id);
  }

  const { data, error } = await supabase
    .from("soggetti")
    .update({ ...record, attivo: dati.get("attivo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) return sbaglio(spiegaErrore(error, doppione));
  if (!data?.length) return sbaglio("Scheda non trovata o permessi insufficienti.");

  revalidatePath("/anagrafiche");
  vaiA(scheda, "Modifiche salvate.", id);
}


// ---------------------------------------------------------------------
// Articoli (con i prezzi per listino)
// ---------------------------------------------------------------------
export async function salvaArticolo(_prima: StatoModulo, dati: FormData): Promise<StatoModulo> {
  await richiediRuolo("titolare", "ufficio");
  const valori = valoriDi(dati);
  const sbaglio = (errore: string): StatoModulo => ({ errore, valori });

  const id = testo(dati, "id");
  const tipo = testo(dati, "tipo");
  const prezzoBase = leggiNumero(testo(dati, "prezzo_base") || "0");
  const aliquota = Number(testo(dati, "aliquota_iva"));

  if (!testo(dati, "descrizione")) return sbaglio("La descrizione è obbligatoria.");
  if (!TIPI_ARTICOLO.includes(tipo)) return sbaglio("Tipo non valido.");
  if (!testo(dati, "unita_misura")) return sbaglio("L'unità di misura è obbligatoria (es. pz, m, h).");
  if (prezzoBase === null || prezzoBase < 0) return sbaglio("Il prezzo base non è un numero valido.");
  if (!ALIQUOTE.includes(aliquota)) return sbaglio("Aliquota IVA non valida.");

  // Prezzi per listino: campi "prezzo_<id listino>"; vuoto = vale il prezzo base.
  const prezzi: { listino_id: string; prezzo: number | null }[] = [];
  for (const [campo, valore] of Object.entries(valori)) {
    if (!campo.startsWith("prezzo_") || campo === "prezzo_base") continue;
    const prezzo = valore.trim() ? leggiNumero(valore) : null;
    if (valore.trim() && (prezzo === null || prezzo < 0))
      return sbaglio(`Un prezzo di listino non è un numero valido: "${valore}".`);
    prezzi.push({ listino_id: campo.slice("prezzo_".length), prezzo });
  }

  const record = {
    codice: testo(dati, "codice") || null,
    descrizione: testo(dati, "descrizione"),
    tipo,
    unita_misura: testo(dati, "unita_misura"),
    prezzo_base: prezzoBase,
    aliquota_iva: aliquota,
    note: testo(dati, "note") || null,
  };
  const doppione = "Esiste già un articolo attivo con questo codice.";

  const supabase = await creaClientServer();
  let articoloId = id;

  if (!id) {
    const { data, error } = await supabase.from("articoli").insert(record).select("id").single();
    if (error) return sbaglio(spiegaErrore(error, doppione));
    articoloId = data.id;
  } else {
    const { data, error } = await supabase
      .from("articoli")
      .update({ ...record, attivo: dati.get("attivo") === "on" })
      .eq("id", id)
      .select("id");
    if (error) return sbaglio(spiegaErrore(error, doppione));
    if (!data?.length) return sbaglio("Articolo non trovato o permessi insufficienti.");
  }

  // Prezzi compilati: si salvano (nuovi o aggiornati). Prezzi svuotati: la riga si disattiva.
  const daSalvare = prezzi
    .filter((p) => p.prezzo !== null)
    .map((p) => ({ listino_id: p.listino_id, articolo_id: articoloId, prezzo: p.prezzo, attivo: true }));
  if (daSalvare.length) {
    const { error } = await supabase
      .from("prezzi_listino")
      .upsert(daSalvare, { onConflict: "listino_id,articolo_id" });
    if (error)
      return { ...sbaglio("Articolo salvato, ma i prezzi di listino no. Riprova a salvare."), valori: { ...valori, id: articoloId } };
  }
  const daTogliere = prezzi.filter((p) => p.prezzo === null).map((p) => p.listino_id);
  if (daTogliere.length) {
    const { error } = await supabase
      .from("prezzi_listino")
      .update({ attivo: false })
      .eq("articolo_id", articoloId)
      .in("listino_id", daTogliere)
      .eq("attivo", true);
    if (error)
      return { ...sbaglio("Articolo salvato, ma i prezzi di listino no. Riprova a salvare."), valori: { ...valori, id: articoloId } };
  }

  revalidatePath("/anagrafiche");
  vaiA("articoli", id ? "Modifiche salvate." : `${record.descrizione} aggiunto.`, articoloId);
}


// ---------------------------------------------------------------------
// Condizioni di pagamento e listini (moduli piccoli, una riga ciascuno)
// ---------------------------------------------------------------------
function tornaPagamenti(messaggio: string, errore = false): never {
  redirect(`/anagrafiche?scheda=pagamenti&${errore ? "errore" : "ok"}=${encodeURIComponent(messaggio)}`);
}

export async function salvaCondizionePagamento(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati, "id");
  const descrizione = testo(dati, "descrizione");
  const giorni = Number(testo(dati, "giorni") || "0");
  if (!descrizione) tornaPagamenti("La descrizione è obbligatoria.", true);
  if (!Number.isInteger(giorni) || giorni < 0 || giorni > 365)
    tornaPagamenti("I giorni devono essere un numero intero da 0 a 365.", true);

  const doppione = "Esiste già una condizione di pagamento con questa descrizione.";
  const supabase = await creaClientServer();
  const { data, error } = id
    ? await supabase
        .from("condizioni_pagamento")
        .update({ descrizione, giorni, attivo: dati.get("attivo") === "on" })
        .eq("id", id)
        .select("id")
    : await supabase.from("condizioni_pagamento").insert({ descrizione, giorni }).select("id");
  if (error) tornaPagamenti(spiegaErrore(error, doppione), true);
  if (!data?.length) tornaPagamenti("Non trovata o permessi insufficienti.", true);

  revalidatePath("/anagrafiche");
  tornaPagamenti(id ? "Condizione di pagamento salvata." : `${descrizione} aggiunta.`);
}

export async function salvaListino(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati, "id");
  const nome = testo(dati, "nome");
  const note = testo(dati, "note") || null;
  if (!nome) tornaPagamenti("Il nome del listino è obbligatorio.", true);

  const doppione = "Esiste già un listino con questo nome.";
  const supabase = await creaClientServer();
  const { data, error } = id
    ? await supabase
        .from("listini")
        .update({ nome, note, attivo: dati.get("attivo") === "on" })
        .eq("id", id)
        .select("id")
    : await supabase.from("listini").insert({ nome, note }).select("id");
  if (error) tornaPagamenti(spiegaErrore(error, doppione), true);
  if (!data?.length) tornaPagamenti("Non trovato o permessi insufficienti.", true);

  revalidatePath("/anagrafiche");
  tornaPagamenti(id ? "Listino salvato." : `Listino ${nome} aggiunto.`);
}
