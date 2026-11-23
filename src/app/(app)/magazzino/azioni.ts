"use server";
// Salvataggi della scheda Magazzino.
//   carico, scarico e inventario (rettifica) → tutti gli utenti attivi (anche gli operai, 0008)
//   annullamento di un movimento → titolare e ufficio
// Il database (RLS) rifiuterebbe comunque chi non ha i permessi.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { leggiNumero } from "@/lib/validazioni";
import { quantitaConUnita } from "@/lib/magazzino";

export type StatoMovimento = { errore?: string; valori?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

/** Data di oggi in Italia, come "2026-11-23". */
function oggi(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
}

function torna(articoloId: string, chiave: "ok" | "errore", messaggio: string): never {
  redirect(`/magazzino?${new URLSearchParams({ id: articoloId, [chiave]: messaggio })}`);
}

export async function registraMovimento(_prima: StatoMovimento, dati: FormData): Promise<StatoMovimento> {
  // la contabilità legge soltanto (come nel database)
  await richiediRuolo("titolare", "ufficio", "operaio");
  const valori: Record<string, string> = {};
  dati.forEach((v, k) => {
    if (typeof v === "string" && !k.startsWith("$ACTION")) valori[k] = v;
  });
  const sbaglio = (errore: string): StatoMovimento => ({ errore, valori });

  const articoloId = testo(dati, "articolo_id");
  const tipo = testo(dati, "tipo");
  const data = testo(dati, "data") || oggi();
  const note = testo(dati, "note") || null;
  const numero = leggiNumero(testo(dati, "quantita"));

  if (!UUID.test(articoloId)) return sbaglio("Articolo non valido.");
  if (!["carico", "scarico", "rettifica"].includes(tipo)) return sbaglio("Scegli se è un carico, uno scarico o un inventario.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return sbaglio("La data non è valida.");
  if (data > oggi()) return sbaglio("La data non può essere nel futuro.");
  if (numero === null || numero < 0 || numero >= 1e9 || Math.round(numero * 1000) !== numero * 1000)
    return sbaglio("La quantità non è un numero valido (al massimo 3 decimali).");
  if (tipo !== "rettifica" && numero === 0) return sbaglio("Scrivi una quantità maggiore di zero.");

  const supabase = await creaClientServer();
  const { data: riga } = await supabase
    .from("magazzino")
    .select("descrizione, unita, giacenza")
    .eq("articolo_id", articoloId)
    .maybeSingle();
  if (!riga) return sbaglio("Articolo non trovato.");

  // Carico: +quantità. Scarico: −quantità.
  // Inventario: si scrive quanto c'è davvero; il movimento è la differenza con la giacenza attuale.
  let movimento = tipo === "scarico" ? -numero : numero;
  if (tipo === "rettifica") {
    movimento = Math.round((numero - Number(riga.giacenza)) * 1000) / 1000;
    if (movimento === 0)
      return sbaglio(`La giacenza è già ${quantitaConUnita(numero, riga.unita)}: non serve nessuna rettifica.`);
  }

  const { error } = await supabase
    .from("movimenti_magazzino")
    .insert({ articolo_id: articoloId, tipo, quantita: movimento, data, note });
  if (error) return sbaglio(`Movimento non registrato: ${error.message}`);

  revalidatePath("/magazzino");
  revalidatePath("/anagrafiche");
  const fatto =
    tipo === "carico"
      ? `Caricate ${quantitaConUnita(numero, riga.unita)}`
      : tipo === "scarico"
        ? `Scaricate ${quantitaConUnita(numero, riga.unita)}`
        : `Inventario registrato (${movimento > 0 ? "+" : ""}${quantitaConUnita(movimento, riga.unita)})`;
  torna(articoloId, "ok", `${fatto} di ${riga.descrizione}.`);
}

/** Annulla un movimento sbagliato (resta nello storico, barrato). */
export async function annullaMovimento(dati: FormData): Promise<void> {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati, "id");
  const articoloId = testo(dati, "articolo_id");
  if (!UUID.test(id) || !UUID.test(articoloId)) redirect("/magazzino");

  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("movimenti_magazzino")
    .update({ attivo: false })
    .eq("id", id)
    .eq("attivo", true)
    .select("id");
  if (error) torna(articoloId, "errore", `Movimento non annullato: ${error.message}`);
  if (!data?.length) torna(articoloId, "errore", "Movimento non trovato o già annullato.");

  revalidatePath("/magazzino");
  revalidatePath("/anagrafiche");
  torna(articoloId, "ok", "Movimento annullato: la giacenza è stata ricalcolata.");
}
