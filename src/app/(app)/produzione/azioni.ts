"use server";
// Salvataggi della scheda Produzione → Commesse: titolare e ufficio
// (contabilità e operai leggono soltanto). Il database (RLS e trigger)
// rifiuterebbe comunque chi non ha i permessi.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { DATA, ErroreDati, idONull, numero, oNull, testo } from "../preventivi/perDatabase";
import { indirizzo } from "./comuni";
import { oggiIt } from "@/lib/produzione";

export type EsitoCommessa = { errore?: string };

/** Lavoro come arriva dal modulo (i numeri sono testo, come scritti nei campi). */
export type LavoroModulo = {
  id: string;
  fase_id: string;
  titolo: string;
  descrizione: string;
  macchina_id: string;
  ore_previste: string;
};

export type CommessaModulo = {
  id: string;
  preventivo_id: string;
  soggetto_id: string;
  sede_id: string;
  descrizione: string;
  data: string;
  data_consegna: string;
  urgente: boolean;
  note: string;
  lavori: LavoroModulo[];
};

function spiega(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message; // messaggi scritti nei trigger
  if (errore.code === "23505") return "Questo preventivo ha già una commessa (o il numero è già usato).";
  if (errore.code === "23514") return "Controlla i dati: c'è un campo obbligatorio vuoto o un numero negativo.";
  if (errore.code === "23503") return "Un dato scelto non esiste più (cliente, sede o macchina): ricarica la pagina.";
  if (errore.code === "42501") return "Non hai i permessi per modificare le commesse.";
  return "Salvataggio non riuscito. Riprova.";
}

// ---------------------------------------------------------------------
// Salva la commessa con i suoi lavori, tutto in un colpo (salva_commessa)
// ---------------------------------------------------------------------
export async function salvaCommessa(_prima: EsitoCommessa, dati: FormData): Promise<EsitoCommessa> {
  await richiediRuolo("titolare", "ufficio");

  let modulo: CommessaModulo;
  try {
    modulo = JSON.parse(String(dati.get("dati") ?? ""));
  } catch {
    return { errore: "Dati del modulo non leggibili. Ricarica la pagina." };
  }

  const id = idONull(modulo.id);
  let commessa: Record<string, unknown>;
  let lavori: Record<string, unknown>[];
  try {
    const preventivo = id ? null : idONull(modulo.preventivo_id);
    if (!preventivo && !idONull(modulo.soggetto_id)) throw new ErroreDati("Scegli il cliente.");
    if (!preventivo && !testo(modulo.descrizione)) throw new ErroreDati("Scrivi la descrizione della commessa.");
    if (testo(modulo.data) && !DATA.test(testo(modulo.data))) throw new ErroreDati("Data non valida.");
    if (testo(modulo.data_consegna) && !DATA.test(testo(modulo.data_consegna))) throw new ErroreDati("Data di consegna non valida.");

    commessa = {
      ...(preventivo ? { preventivo_id: preventivo } : {}),
      soggetto_id: idONull(modulo.soggetto_id),
      sede_id: idONull(modulo.sede_id),
      descrizione: oNull(modulo.descrizione),
      data: oNull(modulo.data),
      data_consegna: oNull(modulo.data_consegna),
      urgente: Boolean(modulo.urgente),
      note: oNull(modulo.note),
    };

    lavori = (modulo.lavori ?? []).map((l, i) => {
      const dove = `Lavoro ${i + 1}`;
      if (!testo(l.titolo)) throw new ErroreDati(`${dove}: scrivi cosa c'è da fare (es. Stampa).`);
      const ore = numero(l.ore_previste, `${dove}, ore`, 2);
      if (ore !== null && (ore < 0 || ore > 9999)) throw new ErroreDati(`${dove}: ore da 0 a 9999.`);
      return {
        id: idONull(l.id),
        fase_id: idONull(l.fase_id),
        titolo: testo(l.titolo),
        descrizione: oNull(l.descrizione),
        macchina_id: idONull(l.macchina_id),
        ore_previste: ore,
      };
    });
  } catch (e) {
    if (e instanceof ErroreDati) return { errore: e.message };
    return { errore: "Dati del modulo non validi. Ricarica la pagina." };
  }

  const supabase = await creaClientServer();
  const { data: nuovoId, error } = await supabase.rpc("salva_commessa", {
    p_id: id,
    p_commessa: commessa,
    p_lavori: lavori,
  });
  if (error) return { errore: spiega(error) };

  revalidatePath("/produzione");
  revalidatePath("/preventivi");
  redirect(indirizzo({ id: String(nuovoId), ok: id ? "Commessa salvata." : "Commessa creata." }));
}

// ---------------------------------------------------------------------
// Stato (completata / riapri) e archiviazione
// ---------------------------------------------------------------------
function torna(id: string, messaggio: string, errore = false): never {
  redirect(indirizzo({ id, [errore ? "errore" : "ok"]: messaggio }));
}

/** «Segna completata» oppure «Riapri» (torna in lavorazione; poi lo stato segue di nuovo i lavori). */
export async function cambiaStatoCommessa(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati.get("id"));
  const stato = testo(dati.get("stato"));
  if (!idONull(id)) redirect(indirizzo({ errore: "Commessa non valida." }));
  if (stato !== "completata" && stato !== "in_lavorazione") torna(id, "Stato non valido.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("commesse").update({ stato }).eq("id", id).select("id");
  if (error) torna(id, spiega(error), true);
  if (!data?.length) torna(id, "Commessa non trovata o permessi insufficienti.", true);

  revalidatePath("/produzione");
  torna(id, stato === "completata" ? "Commessa segnata come completata." : "Commessa riaperta.");
}

export async function archiviaCommessa(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = testo(dati.get("id"));
  const attivo = testo(dati.get("attivo")) === "true";
  if (!idONull(id)) redirect(indirizzo({ errore: "Commessa non valida." }));

  const supabase = await creaClientServer();
  if (!attivo) {
    // non si archivia una commessa che ha ancora lavori nel programma da oggi in poi
    const { data: lavori } = await supabase.from("lavori").select("id").eq("commessa_id", id).eq("attivo", true);
    const ids = (lavori ?? []).map((l) => l.id as string);
    if (ids.length) {
      const { count } = await supabase
        .from("assegnazioni")
        .select("id", { count: "exact", head: true })
        .in("lavoro_id", ids)
        .eq("attivo", true)
        .gte("giorno", oggiIt());
      if (count) torna(id, "La commessa ha ancora lavori nel programma da oggi in poi: toglili prima dal programma.", true);
    }
  }

  const { data, error } = await supabase.from("commesse").update({ attivo }).eq("id", id).select("id");
  if (error) torna(id, spiega(error), true);
  if (!data?.length) torna(id, "Commessa non trovata o permessi insufficienti.", true);

  revalidatePath("/produzione");
  revalidatePath("/preventivi");
  torna(id, attivo ? "Commessa ripristinata." : "Commessa archiviata.");
}
