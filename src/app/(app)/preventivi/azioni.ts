"use server";
// Salvataggi della scheda Preventivi: titolare e ufficio (la contabilità legge soltanto).
// Il database (RLS e trigger) rifiuterebbe comunque chi non ha i permessi e le modifiche
// a un preventivo accettato o rifiutato.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { leggiValore } from "./calcoli";
import { eStato, indirizzo } from "./comuni";
import type { DatiModulo, EsitoSalvataggio } from "./tipi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

class ErroreDati extends Error {}

const testo = (v: unknown) => String(v ?? "").trim();
const oNull = (v: unknown) => testo(v) || null;
const idONull = (v: unknown) => (UUID.test(testo(v)) ? testo(v) : null);

/** Numero scritto nel campo → numero; vuoto → null; sbagliato → errore con il nome del campo. */
function numero(v: string, campo: string, decimali: number): number | null {
  if (!testo(v)) return null;
  const n = leggiValore(v);
  if (n === null) throw new ErroreDati(`${campo}: «${v}» non è un numero valido (es. 12 o 12,50).`);
  return Math.round(n * 10 ** decimali) / 10 ** decimali;
}

function spiegaErrore(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message; // messaggi scritti nei trigger (es. preventivo bloccato)
  if (errore.code === "23514") return "Controlla i dati: c'è un valore fuori dai limiti (es. numero negativo o validità prima della data).";
  if (errore.code === "23503") return "Un dato scelto non esiste più (cliente, tariffa o articolo): ricarica la pagina.";
  if (errore.code === "42501") return "Non hai i permessi per modificare questo preventivo.";
  return "Salvataggio non riuscito. Riprova.";
}

// ---------------------------------------------------------------------
// Salva il preventivo intero (testata, fasi, ore e materiali) in un colpo solo.
// ---------------------------------------------------------------------
export async function salvaPreventivo(_prima: EsitoSalvataggio, dati: FormData): Promise<EsitoSalvataggio> {
  await richiediRuolo("titolare", "ufficio");

  let modulo: DatiModulo;
  try {
    modulo = JSON.parse(String(dati.get("dati") ?? ""));
  } catch {
    return { errore: "Dati del modulo non leggibili. Ricarica la pagina." };
  }

  let preventivo: Record<string, unknown>;
  let fasi: unknown[];
  try {
    const t = modulo.testata;
    if (!idONull(t.soggetto_id)) throw new ErroreDati("Scegli il cliente dall'elenco dei suggerimenti.");
    if (!testo(t.oggetto)) throw new ErroreDati("Scrivi l'oggetto del preventivo.");
    if (testo(t.data) && !DATA.test(testo(t.data))) throw new ErroreDati("Data non valida.");
    if (testo(t.valido_fino) && !DATA.test(testo(t.valido_fino))) throw new ErroreDati("Data di validità non valida.");
    const ricarico = numero(t.ricarico_percentuale, "Ricarico %", 2);

    preventivo = {
      soggetto_id: testo(t.soggetto_id),
      oggetto: testo(t.oggetto),
      modello_id: idONull(t.modello_id),
      data: oNull(t.data),
      valido_fino: oNull(t.valido_fino),
      ricarico_percentuale: ricarico ?? 35,
      prezzo_cliente: numero(t.prezzo_cliente, "Prezzo al cliente", 2),
      codice_iva_id: idONull(t.codice_iva_id),
      cig: oNull(t.cig),
      cup: oNull(t.cup),
      note: oNull(t.note),
    };

    fasi = (modulo.fasi ?? []).map((f, i) => {
      const nomeFase = `Fase ${i + 1}`;
      if (!testo(f.titolo)) throw new ErroreDati(`${nomeFase}: scrivi il titolo.`);
      return {
        id: idONull(f.id),
        titolo: testo(f.titolo),
        descrizione_cliente: oNull(f.descrizione_cliente),
        ore: f.ore.map((r, j) => {
          const dove = `${nomeFase}, ore riga ${j + 1}`;
          if (!idONull(r.tariffa_id)) throw new ErroreDati(`${dove}: scegli la tariffa.`);
          const persone = numero(r.persone, `${dove}, persone`, 0);
          if (persone !== null && (persone < 1 || persone > 99)) throw new ErroreDati(`${dove}: persone da 1 a 99.`);
          return {
            id: idONull(r.id),
            tariffa_id: testo(r.tariffa_id),
            ore: numero(r.ore, `${dove}, ore`, 2) ?? 0,
            persone,
            costo_orario: numero(r.costo_orario, `${dove}, € / ora`, 2), // vuoto → copiato dalla tariffa
          };
        }),
        materiali: f.materiali.map((r, j) => {
          const dove = `${nomeFase}, materiale riga ${j + 1}`;
          const articolo = idONull(r.articolo_id);
          if (!testo(r.descrizione) && !articolo) throw new ErroreDati(`${dove}: scrivi il materiale.`);
          const larghezza = r.bobina ? numero(r.larghezza_m, `${dove}, larghezza`, 3) : null;
          const metri = r.bobina ? numero(r.metri_lineari, `${dove}, metri lineari`, 3) : null;
          if (r.bobina && (!larghezza || !metri)) throw new ErroreDati(`${dove}: per la bobina servono larghezza e metri lineari.`);
          return {
            id: idONull(r.id),
            articolo_id: articolo,
            descrizione: oNull(r.descrizione),
            unita_misura: oNull(r.unita_misura),
            larghezza_m: larghezza,
            metri_lineari: metri,
            quantita: r.bobina ? null : (numero(r.quantita, `${dove}, quantità`, 3) ?? 0), // bobina: la calcola il database
            costo_unitario: numero(r.costo_unitario, `${dove}, € / unità`, 4), // vuoto → copiato dall'articolo
          };
        }),
      };
    });
  } catch (e) {
    if (e instanceof ErroreDati) return { errore: e.message };
    return { errore: "Dati del modulo non validi. Ricarica la pagina." };
  }

  // Tutto in un colpo solo: se una parte non va, il database non salva niente.
  const supabase = await creaClientServer();
  const { data: id, error } = await supabase.rpc("salva_preventivo", {
    p_id: idONull(modulo.id),
    p_preventivo: preventivo,
    p_fasi: fasi,
  });
  if (error) return { errore: spiegaErrore(error) };

  revalidatePath("/preventivi");
  redirect(indirizzo({ id: String(id), ok: modulo.id ? "Preventivo salvato." : "Preventivo creato." }));
}

// ---------------------------------------------------------------------
// Cambio di stato (bozza, inviato, accettato, rifiutato) e archiviazione
// ---------------------------------------------------------------------
function torna(id: string, messaggio: string, errore = false): never {
  redirect(indirizzo({ id, [errore ? "errore" : "ok"]: messaggio }));
}

export async function cambiaStato(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = idONull(dati.get("id"));
  const stato = testo(dati.get("stato"));
  if (!id || !eStato(stato)) redirect("/preventivi");

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("preventivi").update({ stato }).eq("id", id).select("id");
  if (error) torna(id, spiegaErrore(error), true);
  if (!data?.length) torna(id, "Preventivo non trovato o permessi insufficienti.", true);

  revalidatePath("/preventivi");
  torna(id, `Stato cambiato in «${stato}».`);
}

export async function archiviaPreventivo(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = idONull(dati.get("id"));
  if (!id) redirect("/preventivi");
  const attivo = dati.get("attivo") === "true";

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("preventivi").update({ attivo }).eq("id", id).select("id");
  if (error) torna(id, spiegaErrore(error), true);
  if (!data?.length) torna(id, "Preventivo non trovato o permessi insufficienti.", true);

  revalidatePath("/preventivi");
  torna(id, attivo ? "Preventivo ripristinato." : "Preventivo archiviato.");
}
