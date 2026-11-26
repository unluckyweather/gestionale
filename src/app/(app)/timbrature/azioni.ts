"use server";
// Ferie e permessi (0010 + 0012):
//   - il titolare registra (nasce approvata), toglie, approva o rifiuta le richieste;
//   - chi è collegato a un dipendente chiede ferie o permessi per sé e ritira
//     le richieste non ancora decise. La malattia la registra il titolare.
// Gli stessi limiti li impone anche il database (RLS e trigger della 0012).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { richiediRuolo, richiediUtente } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { minuti } from "@/lib/produzione";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPI = ["ferie", "permesso", "malattia"];

type Periodo = { tipo: string; dal: string; al: string; dalle: string; alle: string };

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

/** Torna al calendario (stessa settimana) con un messaggio. */
function torna(dati: FormData, messaggio: string, errore = false): never {
  const p = new URLSearchParams({ scheda: "ferie" });
  const dal = testo(dati, "settimana");
  if (DATA.test(dal)) p.set("dal", dal);
  p.set(errore ? "errore" : "ok", messaggio);
  redirect(`/timbrature?${p.toString()}`);
}

function spiega(errore: PostgrestError, chi: "titolare" | "richiesta" = "titolare"): string {
  if (errore.code === "P0001") return errore.message;
  if (errore.code === "23514") return "Controlla le date e le ore: la fine deve venire dopo l'inizio.";
  if (errore.code === "42501")
    return chi === "titolare" ? "Solo il titolare registra ferie e permessi." : "Puoi chiedere ferie e permessi solo per te.";
  return "Salvataggio non riuscito. Riprova.";
}

/** Legge tipo, date e ore dal modulo (uguale per titolare e richieste). */
function leggiPeriodo(dati: FormData, tipiAmmessi: string[]): Periodo {
  const tipo = testo(dati, "tipo");
  const aOre = tipo === "permesso";
  const dal = aOre ? testo(dati, "giorno") : testo(dati, "dal");
  const al = aOre ? dal : testo(dati, "al") || dal;
  const dalle = aOre ? testo(dati, "dalle") : "";
  const alle = aOre ? testo(dati, "alle") : "";

  if (!tipiAmmessi.includes(tipo)) torna(dati, "Scegli il tipo di assenza.", true);
  if (!DATA.test(dal) || !DATA.test(al)) torna(dati, "Indica le date.", true);
  if (al < dal) torna(dati, "La data di fine viene prima di quella di inizio.", true);
  if (aOre) {
    // permesso: a ore nello stesso giorno, oppure giornata intera se le ore sono vuote
    if ((dalle || alle) && (!ORA.test(dalle) || !ORA.test(alle))) torna(dati, "Scrivi tutte e due le ore del permesso (es. 08:00 e 10:00).", true);
    if (dalle && alle && minuti(alle) <= minuti(dalle)) torna(dati, "L'ora di fine del permesso deve venire dopo quella di inizio.", true);
  }
  return { tipo, dal, al, dalle, alle };
}

/** Avviso se la persona ha lavori nel programma in quel periodo (testo vuoto se no). */
async function avvisoProgramma(
  supabase: SupabaseClient,
  dipendente: string,
  p: { dal: string; al: string; dalle: string | null; alle: string | null }
): Promise<string> {
  const { data: lavori } = await supabase
    .from("assegnazioni")
    .select("giorno, dalle, alle")
    .eq("dipendente_id", dipendente)
    .eq("attivo", true)
    .gte("giorno", p.dal)
    .lte("giorno", p.al);
  const toccati = (lavori ?? []).filter(
    (a) => !p.dalle || !p.alle || (minuti(String(a.dalle)) < minuti(p.alle) && minuti(String(a.alle)) > minuti(p.dalle))
  );
  if (!toccati.length) return "";
  return ` Attenzione: in quei giorni ha ${toccati.length} ${toccati.length === 1 ? "lavoro" : "lavori"} nel programma, da spostare.`;
}

function aggiorna() {
  revalidatePath("/timbrature");
  revalidatePath("/produzione");
  revalidatePath("/", "layout"); // numerino delle richieste nel menu
}

export async function salvaAssenza(dati: FormData) {
  await richiediRuolo("titolare");
  const dipendente = testo(dati, "dipendente_id");
  if (!UUID.test(dipendente)) torna(dati, "Scegli la persona.", true);
  const p = leggiPeriodo(dati, TIPI);

  const supabase = await creaClientServer();
  const { error } = await supabase.from("assenze").insert({
    dipendente_id: dipendente,
    tipo: p.tipo,
    dal: p.dal,
    al: p.al,
    dalle: p.dalle || null,
    alle: p.alle || null,
    note: testo(dati, "note") || null,
  });
  if (error) torna(dati, spiega(error), true);

  const avviso = await avvisoProgramma(supabase, dipendente, { ...p, dalle: p.dalle || null, alle: p.alle || null });
  aggiorna();
  torna(dati, `Assenza registrata.${avviso}`);
}

export async function togliAssenza(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  if (!UUID.test(id)) torna(dati, "Assenza non valida.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("assenze").update({ attivo: false }).eq("id", id).select("id");
  if (error) torna(dati, spiega(error), true);
  if (!data?.length) torna(dati, "Assenza non trovata o permessi insufficienti.", true);

  aggiorna();
  torna(dati, "Assenza tolta.");
}

/** Richiesta di ferie o permesso per sé (qualsiasi ruolo collegato a un dipendente). */
export async function chiediAssenza(dati: FormData) {
  await richiediUtente();
  const p = leggiPeriodo(dati, ["ferie", "permesso"]);

  const supabase = await creaClientServer();
  const { data: io } = await supabase.from("dipendenti_elenco").select("id").eq("io", true).eq("attivo", true).maybeSingle();
  if (!io) torna(dati, "Il tuo account non è collegato a un dipendente: chiedi al titolare di collegarlo.", true);

  const { error } = await supabase.from("assenze").insert({
    dipendente_id: io.id,
    tipo: p.tipo,
    stato: "richiesta",
    dal: p.dal,
    al: p.al,
    dalle: p.dalle || null,
    alle: p.alle || null,
    note: testo(dati, "note") || null,
  });
  if (error) torna(dati, spiega(error, "richiesta"), true);

  aggiorna();
  torna(dati, "Richiesta inviata. Finché il titolare non la approva, nel programma risulti presente.");
}

/** Ritira una propria richiesta non ancora decisa. */
export async function ritiraRichiesta(dati: FormData) {
  await richiediUtente();
  const id = testo(dati, "id");
  if (!UUID.test(id)) torna(dati, "Richiesta non valida.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("assenze")
    .update({ attivo: false })
    .eq("id", id)
    .eq("stato", "richiesta")
    .select("id");
  if (error) torna(dati, spiega(error, "richiesta"), true);
  if (!data?.length) torna(dati, "Richiesta non trovata, o già decisa dal titolare.", true);

  aggiorna();
  torna(dati, "Richiesta ritirata.");
}

/** Il titolare approva o rifiuta una richiesta (con una nota facoltativa per la persona). */
export async function decidiRichiesta(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const esito = testo(dati, "esito");
  if (!UUID.test(id)) torna(dati, "Richiesta non valida.", true);
  if (esito !== "approva" && esito !== "rifiuta") torna(dati, "Scegli se approvare o rifiutare.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("assenze")
    .update({ stato: esito === "approva" ? "approvata" : "rifiutata", risposta: testo(dati, "risposta") || null })
    .eq("id", id)
    .eq("stato", "richiesta")
    .eq("attivo", true)
    .select("dipendente_id, dal, al, dalle, alle");
  if (error) torna(dati, spiega(error), true);
  const riga = data?.[0];
  if (!riga) torna(dati, "Richiesta non trovata: forse è stata ritirata o già decisa.", true);

  let avviso = "";
  if (esito === "approva") avviso = await avvisoProgramma(supabase, riga.dipendente_id, riga);
  aggiorna();
  torna(dati, esito === "approva" ? `Richiesta approvata.${avviso}` : "Richiesta rifiutata.");
}
