"use server";
// Correzioni delle timbrature (0013), solo titolare e ufficio:
//   - aggiungere una timbratura dimenticata (tipo, ora, motivo obbligatorio);
//   - annullare una timbratura sbagliata (motivo obbligatorio).
// Una timbratura non si modifica mai: si annulla e se ne aggiunge una giusta.
// Gli stessi limiti li impone il database (RLS e trigger normalizza_timbratura);
// tutto finisce nel registro delle modifiche.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { TIPI_TIMBRATURA, type TipoTimbratura } from "@/lib/timbrature";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

/** Torna alle presenze di quel giorno, con il pannello della persona aperto. */
function torna(dati: FormData, messaggio: string, errore = false): never {
  const p = new URLSearchParams({ scheda: "presenze" });
  const giorno = testo(dati, "giorno");
  const persona = testo(dati, "dipendente_id");
  if (DATA.test(giorno)) p.set("giorno", giorno);
  if (UUID.test(persona)) p.set("correggi", persona);
  p.set(errore ? "errore" : "ok", messaggio);
  redirect(`/timbrature?${p.toString()}`);
}

function spiega(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message;
  if (errore.code === "42501") return "Solo il titolare e l'ufficio correggono le timbrature.";
  return "Correzione non riuscita. Riprova.";
}

export async function aggiungiTimbratura(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const dipendente = testo(dati, "dipendente_id");
  const giorno = testo(dati, "giorno");
  const tipo = testo(dati, "tipo") as TipoTimbratura;
  const ora = testo(dati, "ora");
  const motivo = testo(dati, "motivo");

  if (!UUID.test(dipendente) || !DATA.test(giorno)) torna(dati, "Dati mancanti: ricarica la pagina.", true);
  if (!TIPI_TIMBRATURA.includes(tipo)) torna(dati, "Scegli il tipo di timbratura.", true);
  if (!ORA.test(ora)) torna(dati, "Scrivi l'ora (es. 08:00).", true);
  if (!motivo) torna(dati, "Scrivi il motivo della correzione (es. «dimenticata l'uscita»).", true);

  const supabase = await creaClientServer();
  // l'ora è quella italiana di quel giorno: ci pensa il database a convertirla
  const { error } = await supabase.from("timbrature").insert({
    dipendente_id: dipendente,
    tipo,
    orario: `${giorno} ${ora}:00 Europe/Rome`,
    motivo,
  });
  if (error) torna(dati, spiega(error), true);

  revalidatePath("/timbrature");
  torna(dati, `Timbratura aggiunta alle ${ora}.`);
}

export async function annullaTimbratura(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati, "id");
  const motivo = testo(dati, "annullata_motivo");
  if (!UUID.test(id)) torna(dati, "Timbratura non trovata: ricarica la pagina.", true);
  if (!motivo) torna(dati, "Scrivi il motivo dell'annullamento.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("timbrature")
    .update({ attivo: false, annullata_motivo: motivo })
    .eq("id", id)
    .select("id");
  if (error) torna(dati, spiega(error), true);
  if (!data?.length) torna(dati, "Annullamento non riuscito: permessi insufficienti.", true);

  revalidatePath("/timbrature");
  torna(dati, "Timbratura annullata.");
}
