"use server";
// Salvataggi degli ordini d'acquisto: titolare e ufficio (la contabilità legge soltanto).
// Il database (RLS e trigger) rifiuterebbe comunque chi non ha i permessi e le modifiche
// a un ordine già arrivato o annullato.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { leggiNumero } from "@/lib/validazioni";
import { STATI_ORDINE, eStatoOrdine } from "@/lib/magazzino";
import { indirizzo } from "./comuni";

export type EsitoOrdine = { errore?: string };

/** Quello che il modulo manda (campo nascosto "dati", in JSON). */
export type DatiOrdine = {
  id: string | null;
  testata: {
    soggetto_id: string;
    data: string;
    consegna_prevista: string;
    riferimento_fornitore: string;
    note_fornitore: string;
    note: string;
  };
  righe: { id: string | null; articolo_id: string; descrizione: string; quantita: string; costo_unitario: string }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const testo = (v: unknown) => String(v ?? "").trim();
const oNull = (v: unknown) => testo(v) || null;
const idONull = (v: unknown) => (UUID.test(testo(v)) ? testo(v) : null);

class ErroreDati extends Error {}

/** "12,5" → 12.5 con al massimo `decimali` cifre dopo la virgola; vuoto → null. */
function numero(v: string, campo: string, decimali: number): number | null {
  if (!testo(v)) return null;
  const n = leggiNumero(testo(v));
  if (n === null || n < 0 || n >= 1e9) throw new ErroreDati(`${campo}: «${v}» non è un numero valido (es. 12 o 12,50).`);
  if (Math.round(n * 10 ** decimali) !== n * 10 ** decimali) throw new ErroreDati(`${campo}: al massimo ${decimali} decimali.`);
  return n;
}

function spiegaErrore(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message; // messaggi scritti nei trigger (es. ordine già arrivato)
  if (errore.code === "23514") return "Controlla i dati: c'è un valore fuori dai limiti (es. consegna prima della data dell'ordine).";
  if (errore.code === "23503") return "Un dato scelto non esiste più (fornitore o articolo): ricarica la pagina.";
  if (errore.code === "42501") return "Non hai i permessi per modificare questo ordine.";
  return "Salvataggio non riuscito. Riprova.";
}

export async function salvaOrdine(_prima: EsitoOrdine, dati: FormData): Promise<EsitoOrdine> {
  await richiediRuolo("titolare", "ufficio");

  let modulo: DatiOrdine;
  try {
    modulo = JSON.parse(String(dati.get("dati") ?? ""));
  } catch {
    return { errore: "Dati del modulo non leggibili. Ricarica la pagina." };
  }

  let ordine: Record<string, unknown>;
  let righe: Record<string, unknown>[];
  try {
    const t = modulo.testata;
    if (!idONull(t.soggetto_id)) throw new ErroreDati("Scegli il fornitore.");
    if (testo(t.data) && !DATA.test(testo(t.data))) throw new ErroreDati("Data dell'ordine non valida.");
    if (testo(t.consegna_prevista) && !DATA.test(testo(t.consegna_prevista))) throw new ErroreDati("Data di consegna non valida.");
    if (testo(t.consegna_prevista) && testo(t.data) && testo(t.consegna_prevista) < testo(t.data))
      throw new ErroreDati("La consegna prevista non può essere prima della data dell'ordine.");
    ordine = {
      soggetto_id: testo(t.soggetto_id),
      data: oNull(t.data),
      consegna_prevista: oNull(t.consegna_prevista),
      riferimento_fornitore: oNull(t.riferimento_fornitore),
      note_fornitore: oNull(t.note_fornitore),
      note: oNull(t.note),
    };

    if (!modulo.righe?.length) throw new ErroreDati("Aggiungi almeno un articolo all'ordine.");
    righe = modulo.righe.map((r, i) => {
      const dove = `Riga ${i + 1}`;
      if (!idONull(r.articolo_id)) throw new ErroreDati(`${dove}: scegli l'articolo.`);
      const q = numero(r.quantita, `${dove}, quantità`, 3);
      if (!q) throw new ErroreDati(`${dove}: scrivi la quantità.`);
      return {
        id: idONull(r.id),
        articolo_id: testo(r.articolo_id),
        descrizione: oNull(r.descrizione), // vuota → dall'articolo
        quantita: q,
        costo_unitario: numero(r.costo_unitario, `${dove}, prezzo`, 4), // vuoto → dall'articolo
      };
    });
  } catch (e) {
    if (e instanceof ErroreDati) return { errore: e.message };
    return { errore: "Dati del modulo non validi. Ricarica la pagina." };
  }

  // Tutto in un colpo solo: se una parte non va, il database non salva niente.
  const supabase = await creaClientServer();
  const { data: id, error } = await supabase.rpc("salva_ordine_acquisto", {
    p_id: idONull(modulo.id),
    p_ordine: ordine,
    p_righe: righe,
  });
  if (error) return { errore: spiegaErrore(error) };

  revalidatePath("/magazzino");
  revalidatePath("/anagrafiche");
  redirect(indirizzo({ scheda: "ordini", id: String(id), ok: modulo.id ? "Ordine salvato." : "Ordine creato." }));
}

function torna(id: string, messaggio: string, errore = false): never {
  redirect(indirizzo({ scheda: "ordini", id, [errore ? "errore" : "ok"]: messaggio }));
}

export async function cambiaStatoOrdine(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = idONull(dati.get("id"));
  const stato = testo(dati.get("stato"));
  if (!id || !eStatoOrdine(stato)) redirect(indirizzo({ scheda: "ordini" }));

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("ordini_acquisto").update({ stato }).eq("id", id).select("id");
  if (error) torna(id, spiegaErrore(error), true);
  if (!data?.length) torna(id, "Ordine non trovato o permessi insufficienti.", true);

  revalidatePath("/magazzino");
  revalidatePath("/anagrafiche");
  const etichetta = STATI_ORDINE.find((s) => s.valore === stato)?.etichetta ?? stato;
  torna(id, `Stato cambiato in «${etichetta.toLowerCase()}».`);
}

export async function archiviaOrdine(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = idONull(dati.get("id"));
  if (!id) redirect(indirizzo({ scheda: "ordini" }));
  const attivo = dati.get("attivo") === "true";

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("ordini_acquisto").update({ attivo }).eq("id", id).select("id");
  if (error) torna(id, spiegaErrore(error), true);
  if (!data?.length) torna(id, "Ordine non trovato o permessi insufficienti.", true);

  revalidatePath("/magazzino");
  revalidatePath("/anagrafiche");
  torna(id, attivo ? "Ordine ripristinato." : "Ordine archiviato.");
}
