"use server";
// Azioni della pagina Impostazioni (solo titolare).
// Anche se qualcuno le chiamasse senza permesso, il database (RLS) rifiuterebbe.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { eRuolo } from "@/lib/ruoli";
import {
  codiceFiscaleValido,
  emailValida,
  ibanValido,
  leggiNumero,
  partitaIvaValida,
  pulisciCodiceFiscale,
  pulisciIban,
  pulisciPartitaIva,
} from "@/lib/validazioni";

// Pagine a cui si può tornare dopo un salvataggio (i dipendenti si modificano anche da Anagrafiche).
const RITORNI = ["/impostazioni", "/anagrafiche?scheda=dipendenti"];

function torna(messaggio: string, errore = false, ritorno = "/impostazioni"): never {
  const base = RITORNI.includes(ritorno) ? ritorno : "/impostazioni";
  const separatore = base.includes("?") ? "&" : "?";
  redirect(`${base}${separatore}${errore ? "errore" : "ok"}=${encodeURIComponent(messaggio)}`);
}

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

function spiegaErrore(errore: PostgrestError): string {
  if (errore.code === "23505") return "Questo account è già collegato a un altro dipendente.";
  if (errore.code === "23514") return "Nome e cognome sono obbligatori.";
  if (errore.code === "P0001") return errore.message; // messaggi scritti da noi nei trigger
  return "Salvataggio non riuscito. Riprova.";
}

export async function salvaProfilo(dati: FormData) {
  const io = await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const nome = testo(dati, "nome_visualizzato");
  const ruolo = testo(dati, "ruolo");
  const attivo = dati.get("attivo") === "on";

  // Il proprio ruolo e la propria attivazione non si toccano (lo blocca anche il database).
  const modifiche =
    id === io.id ? { nome_visualizzato: nome } : { nome_visualizzato: nome, ruolo, attivo };
  if (id !== io.id && !eRuolo(ruolo)) torna("Ruolo non valido.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("profili").update(modifiche).eq("id", id).select("id");
  if (error) torna(spiegaErrore(error), true);
  if (!data?.length) torna("Account non trovato o permessi insufficienti.", true);

  revalidatePath("/", "layout");
  torna("Account salvato.");
}

export async function salvaDipendente(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const ritorno = testo(dati, "ritorno");
  const valori = {
    nome: testo(dati, "nome"),
    cognome: testo(dati, "cognome"),
    mansione_principale: testo(dati, "mansione_principale") || null,
    profilo_id: testo(dati, "profilo_id") || null,
  };
  if (!valori.nome || !valori.cognome) torna("Nome e cognome sono obbligatori.", true, ritorno);

  const supabase = await creaClientServer();

  if (!id) {
    const { error } = await supabase.from("dipendenti").insert(valori);
    if (error) torna(spiegaErrore(error), true, ritorno);
    revalidatePath("/impostazioni");
    revalidatePath("/anagrafiche");
    torna(`${valori.nome} ${valori.cognome} aggiunto.`, false, ritorno);
  }

  const { data, error } = await supabase
    .from("dipendenti")
    .update({ ...valori, attivo: dati.get("attivo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) torna(spiegaErrore(error), true, ritorno);
  if (!data?.length) torna("Dipendente non trovato o permessi insufficienti.", true, ritorno);

  revalidatePath("/impostazioni");
  revalidatePath("/anagrafiche");
  torna("Dipendente salvato.", false, ritorno);
}

// ---------------------------------------------------------------------
// Tariffe orarie (solo titolare: lo impone anche il database)
// ---------------------------------------------------------------------
const TIPI_TARIFFA = ["persona", "macchina", "posa"];

function spiegaErroreTariffa(errore: PostgrestError): string {
  if (errore.code === "23505") return "Esiste già una tariffa attiva con questo nome.";
  if (errore.code === "23514") return "Controlla i dati: nome obbligatorio e costo orario non negativo.";
  if (errore.code === "P0001") return errore.message;
  return "Salvataggio non riuscito. Riprova.";
}

export async function salvaTariffa(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const nome = testo(dati, "nome");
  const tipo = testo(dati, "tipo");
  const costo = leggiNumero(testo(dati, "costo_orario"));

  if (!nome) torna("Il nome della tariffa è obbligatorio.", true);
  if (!TIPI_TARIFFA.includes(tipo)) torna("Tipo di tariffa non valido.", true);
  if (costo === null || costo < 0) torna(`Costo orario non valido per «${nome}»: scrivi ad esempio 45 o 45,50.`, true);

  const valori = {
    nome,
    tipo,
    costo_orario: Math.round(costo * 100) / 100,
    note: testo(dati, "note") || null,
  };

  const supabase = await creaClientServer();

  if (!id) {
    const { error } = await supabase.from("tariffe_orarie").insert(valori);
    if (error) torna(spiegaErroreTariffa(error), true);
    revalidatePath("/impostazioni");
    torna(`Tariffa «${nome}» aggiunta.`);
  }

  const { data, error } = await supabase
    .from("tariffe_orarie")
    .update({ ...valori, attivo: dati.get("attivo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) torna(spiegaErroreTariffa(error), true);
  if (!data?.length) torna("Tariffa non trovata o permessi insufficienti.", true);

  revalidatePath("/impostazioni");
  revalidatePath("/preventivi");
  torna(`Tariffa «${nome}» salvata.`);
}


// ---------------------------------------------------------------------
// Dati dell'azienda (intestazione dei documenti) — solo titolare
// ---------------------------------------------------------------------
export type StatoAzienda = { errore?: string; valori?: Record<string, string> };

const CAMPI_AZIENDA = [
  "ragione_sociale", "indirizzo", "civico", "cap", "comune", "provincia", "nazione",
  "partita_iva", "codice_fiscale", "telefono", "email", "pec", "sito_web",
  "iban", "banca", "rea", "capitale_sociale", "piede_documenti", "logo",
] as const;

/** Logo ammesso: immagine PNG, JPG, WebP o SVG incorporata (data URL), al massimo ~300 KB. */
const LOGO = /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;

export async function salvaAzienda(_prima: StatoAzienda, dati: FormData): Promise<StatoAzienda> {
  await richiediRuolo("titolare");
  const valori: Record<string, string> = {};
  for (const c of CAMPI_AZIENDA) valori[c] = testo(dati, c);
  const sbaglio = (errore: string): StatoAzienda => ({ errore, valori });

  const nazione = (valori.nazione || "IT").toUpperCase();
  const piva = pulisciPartitaIva(valori.partita_iva);
  const cf = pulisciCodiceFiscale(valori.codice_fiscale);
  const iban = pulisciIban(valori.iban);

  if (!valori.ragione_sociale) return sbaglio("La ragione sociale è obbligatoria.");
  if (!/^[A-Z]{2}$/.test(nazione)) return sbaglio("Nazione: usa la sigla di 2 lettere (es. IT).");
  if (piva && nazione === "IT" && !partitaIvaValida(piva)) return sbaglio("La partita IVA non è valida: controlla le cifre.");
  if (cf && nazione === "IT" && !codiceFiscaleValido(cf)) return sbaglio("Il codice fiscale non è valido.");
  if (valori.email && !emailValida(valori.email)) return sbaglio("L'email non è scritta correttamente.");
  if (valori.pec && !emailValida(valori.pec)) return sbaglio("La PEC non è scritta correttamente.");
  if (iban && !ibanValido(iban)) return sbaglio("L'IBAN non è valido: controlla le cifre.");
  if (valori.logo && (!LOGO.test(valori.logo) || valori.logo.length > 400000))
    return sbaglio("Il logo deve essere un'immagine PNG, JPG, WebP o SVG di al massimo 300 KB.");

  const record = {
    ragione_sociale: valori.ragione_sociale,
    indirizzo: valori.indirizzo || null,
    civico: valori.civico || null,
    cap: valori.cap || null,
    comune: valori.comune || null,
    provincia: valori.provincia || null,
    nazione,
    partita_iva: piva || null,
    codice_fiscale: cf || null,
    telefono: valori.telefono || null,
    email: valori.email || null,
    pec: valori.pec || null,
    sito_web: valori.sito_web || null,
    iban: iban || null,
    banca: valori.banca || null,
    rea: valori.rea || null,
    capitale_sociale: valori.capitale_sociale || null,
    piede_documenti: valori.piede_documenti || null,
    logo: valori.logo || null,
  };

  const supabase = await creaClientServer();
  const id = testo(dati, "id");
  const { data, error } = id
    ? await supabase.from("azienda").update(record).eq("id", id).select("id")
    : await supabase.from("azienda").insert(record).select("id");
  if (error) {
    if (error.code === "23505") return sbaglio("I dati dell'azienda esistono già: ricarica la pagina.");
    if (error.code === "23514") return sbaglio("Controlla i dati: un campo non è nel formato giusto (email, IBAN, nazione o logo).");
    return sbaglio(spiegaErrore(error));
  }
  if (!data?.length) return sbaglio("Salvataggio non riuscito: permessi insufficienti.");

  revalidatePath("/impostazioni");
  revalidatePath("/stampa", "layout");
  torna("Dati dell'azienda salvati.");
}
