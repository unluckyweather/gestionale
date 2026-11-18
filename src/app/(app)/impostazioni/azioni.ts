"use server";
// Azioni della pagina Impostazioni (solo titolare).
// Anche se qualcuno le chiamasse senza permesso, il database (RLS) rifiuterebbe.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { eRuolo } from "@/lib/ruoli";

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
