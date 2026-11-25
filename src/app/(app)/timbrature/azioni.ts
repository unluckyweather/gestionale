"use server";
// Ferie e permessi: li scrive solo il titolare (lo impone anche il database).
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { minuti } from "@/lib/produzione";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TIPI = ["ferie", "permesso", "malattia"];

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

function spiega(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message;
  if (errore.code === "23514") return "Controlla le date e le ore: la fine deve venire dopo l'inizio.";
  if (errore.code === "42501") return "Solo il titolare registra ferie e permessi.";
  return "Salvataggio non riuscito. Riprova.";
}

export async function salvaAssenza(dati: FormData) {
  await richiediRuolo("titolare");
  const dipendente = testo(dati, "dipendente_id");
  const tipo = testo(dati, "tipo");
  const aOre = tipo === "permesso";
  const dal = aOre ? testo(dati, "giorno") : testo(dati, "dal");
  const al = aOre ? dal : testo(dati, "al") || dal;
  const dalle = aOre ? testo(dati, "dalle") : "";
  const alle = aOre ? testo(dati, "alle") : "";

  if (!UUID.test(dipendente)) torna(dati, "Scegli la persona.", true);
  if (!TIPI.includes(tipo)) torna(dati, "Scegli il tipo di assenza.", true);
  if (!DATA.test(dal) || !DATA.test(al)) torna(dati, "Indica le date.", true);
  if (al < dal) torna(dati, "La data di fine viene prima di quella di inizio.", true);
  if (aOre) {
    // permesso: a ore nello stesso giorno, oppure giornata intera se le ore sono vuote
    if ((dalle || alle) && (!ORA.test(dalle) || !ORA.test(alle))) torna(dati, "Scrivi tutte e due le ore del permesso (es. 08:00 e 10:00).", true);
    if (dalle && alle && minuti(alle) <= minuti(dalle)) torna(dati, "L'ora di fine del permesso deve venire dopo quella di inizio.", true);
  }

  const supabase = await creaClientServer();
  const { error } = await supabase.from("assenze").insert({
    dipendente_id: dipendente,
    tipo,
    dal,
    al,
    dalle: dalle || null,
    alle: alle || null,
    note: testo(dati, "note") || null,
  });
  if (error) torna(dati, spiega(error), true);

  // avviso: la persona ha già lavori nel programma in quei giorni?
  let avviso = "";
  const { data: lavori } = await supabase
    .from("assegnazioni")
    .select("giorno, dalle, alle")
    .eq("dipendente_id", dipendente)
    .eq("attivo", true)
    .gte("giorno", dal)
    .lte("giorno", al);
  const toccati = (lavori ?? []).filter(
    (a) => !dalle || !alle || (minuti(String(a.dalle)) < minuti(alle) && minuti(String(a.alle)) > minuti(dalle))
  );
  if (toccati.length)
    avviso = ` Attenzione: in quei giorni ha ${toccati.length} ${toccati.length === 1 ? "lavoro" : "lavori"} nel programma, da spostare.`;

  revalidatePath("/timbrature");
  revalidatePath("/produzione");
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

  revalidatePath("/timbrature");
  revalidatePath("/produzione");
  torna(dati, "Assenza tolta.");
}
