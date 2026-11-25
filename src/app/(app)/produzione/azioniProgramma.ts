"use server";
// Programma del giorno: lo scrive solo il titolare (lo impone anche il database).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo, richiediUtente } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { minuti } from "@/lib/produzione";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

/** Torna al programma dello stesso giorno e della stessa vista, con un messaggio. */
function torna(dati: FormData, messaggio: string, errore = false, extra: Record<string, string> = {}): never {
  const p = new URLSearchParams({ scheda: "programma" });
  const giorno = testo(dati, "torna_giorno") || testo(dati, "giorno");
  if (DATA.test(giorno)) p.set("giorno", giorno);
  if (testo(dati, "vista") === "persona") p.set("vista", "persona");
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  p.set(errore ? "errore" : "ok", messaggio);
  redirect(`/produzione?${p.toString()}`);
}

function spiega(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message;
  if (errore.code === "23514") return "L'ora di fine deve venire dopo l'ora di inizio.";
  if (errore.code === "42501") return "Solo il titolare prepara il programma.";
  return "Salvataggio non riuscito. Riprova.";
}

/** Nuova assegnazione o modifica di una esistente (id). */
export async function salvaAssegnazione(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const lavoro = testo(dati, "lavoro_id");
  const persona = testo(dati, "dipendente_id");
  const macchina = testo(dati, "macchina_id");
  const giorno = testo(dati, "giorno");
  const dalle = testo(dati, "dalle");
  const alle = testo(dati, "alle");
  // se qualcosa non va si torna al modulo, con i dati scritti
  const indietro: Record<string, string> = id ? { modifica: id } : { lavoro, a: persona, dalle, alle };

  if (id && !UUID.test(id)) torna(dati, "Assegnazione non valida.", true);
  if (!id && !UUID.test(lavoro)) torna(dati, "Scegli il lavoro da programmare.", true);
  if (persona && !UUID.test(persona)) torna(dati, "Persona non valida.", true, indietro);
  if (macchina && !UUID.test(macchina)) torna(dati, "Macchina non valida.", true, indietro);
  if (!DATA.test(giorno)) torna(dati, "Indica il giorno.", true, indietro);
  if (!ORA.test(dalle) || !ORA.test(alle)) torna(dati, "Scrivi le ore come 08:00.", true, indietro);
  if (minuti(alle) <= minuti(dalle)) torna(dati, "L'ora di fine deve venire dopo l'ora di inizio.", true, indietro);

  const valori = {
    dipendente_id: persona || null,
    macchina_id: macchina || null,
    giorno,
    dalle,
    alle,
    note: testo(dati, "note") || null,
  };
  const supabase = await creaClientServer();

  if (id) {
    const { data, error } = await supabase.from("assegnazioni").update(valori).eq("id", id).select("id");
    if (error) torna(dati, spiega(error), true, indietro);
    if (!data?.length) torna(dati, "Assegnazione non trovata o permessi insufficienti.", true);
  } else {
    const { error } = await supabase.from("assegnazioni").insert({ ...valori, lavoro_id: lavoro });
    if (error) torna(dati, spiega(error), true, indietro);
  }

  revalidatePath("/produzione");
  // si resta sul giorno dell'assegnazione (anche se è stata spostata a un altro giorno)
  dati.set("torna_giorno", giorno);
  torna(dati, id ? "Programma aggiornato." : "Lavoro messo nel programma.");
}

/**
 * «Inizia» / «Finito» / «Riapri» da «Il mio programma».
 * Gli operai possono cambiare solo lo stato dei lavori che hanno nel programma
 * (lo impongono la regola RLS e il trigger della 0010); titolare e ufficio tutti.
 * Lo stato della commessa si aggiorna da solo.
 */
export async function cambiaStatoLavoro(dati: FormData) {
  await richiediUtente();
  const lavoro = testo(dati, "lavoro_id");
  const stato = testo(dati, "stato");
  const p = new URLSearchParams({ scheda: "mio" });
  const giorno = testo(dati, "giorno");
  if (DATA.test(giorno)) p.set("giorno", giorno);
  const persona = testo(dati, "persona");
  if (UUID.test(persona)) p.set("persona", persona);
  const vai = (chiave: "ok" | "errore", messaggio: string): never => {
    p.set(chiave, messaggio);
    redirect(`/produzione?${p.toString()}`);
  };

  if (!UUID.test(lavoro)) vai("errore", "Lavoro non valido.");
  if (!["da_fare", "in_corso", "finito"].includes(stato)) vai("errore", "Stato non valido.");

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("lavori").update({ stato }).eq("id", lavoro).select("titolo");
  if (error) vai("errore", spiega(error));
  if (!data?.length) vai("errore", "Puoi segnare solo i lavori che hai nel programma.");

  revalidatePath("/produzione");
  const titolo = String(data![0].titolo);
  vai("ok", stato === "finito" ? `«${titolo}» segnato come finito.` : stato === "in_corso" ? `«${titolo}» iniziato.` : `«${titolo}» riportato a da fare.`);
}

/** Lavoro interno, senza commessa (manutenzione, pulizia, prove…): poi si mette nel programma. */
export async function salvaLavoroInterno(dati: FormData) {
  await richiediRuolo("titolare");
  const titolo = testo(dati, "titolo");
  const macchina = testo(dati, "macchina_id");
  const ore = Number(testo(dati, "ore_previste").replace(",", ".") || "0");
  if (!titolo) torna(dati, "Scrivi cosa c'è da fare.", true);
  if (macchina && !UUID.test(macchina)) torna(dati, "Macchina non valida.", true);
  if (!Number.isFinite(ore) || ore < 0 || ore > 999) torna(dati, "Ore non valide (es. 2 o 1,5).", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("lavori")
    .insert({ titolo, macchina_id: macchina || null, ore_previste: ore || null, urgente: dati.get("urgente") === "on" })
    .select("id")
    .single();
  if (error || !data) torna(dati, error ? spiega(error) : "Salvataggio non riuscito.", true);

  revalidatePath("/produzione");
  torna(dati, `Lavoro interno «${titolo}» aggiunto: ora mettilo nel programma.`, false, { lavoro: String(data.id) });
}

/** Toglie un'assegnazione dal programma (si archivia: resta nello storico). */
export async function togliAssegnazione(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  if (!UUID.test(id)) torna(dati, "Assegnazione non valida.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("assegnazioni").update({ attivo: false }).eq("id", id).select("id");
  if (error) torna(dati, spiega(error), true);
  if (!data?.length) torna(dati, "Assegnazione non trovata o permessi insufficienti.", true);

  revalidatePath("/produzione");
  torna(dati, "Tolto dal programma.");
}
