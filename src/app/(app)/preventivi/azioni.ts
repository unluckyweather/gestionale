"use server";
// Salvataggi della scheda Preventivi: titolare e ufficio (la contabilità legge soltanto).
// Il database (RLS e trigger) rifiuterebbe comunque chi non ha i permessi e le modifiche
// a un preventivo accettato o rifiutato.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { aggiornaCosti, bozzaFasi, copiaFasi } from "./bozze";
import { eStato, indirizzo, oggiItalia } from "./comuni";
import { leggiFasi, leggiTariffeArticoli } from "./letture";
import { DATA, ErroreDati, fasiPerDatabase, idONull, numero, oNull, spiegaErrore, testo } from "./perDatabase";
import type { BozzaFase, DatiModello, DatiModulo, EsitoSalvataggio, FaseSalvata, ModelloLetto } from "./tipi";

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

    fasi = fasiPerDatabase(modulo.fasi);
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


// ---------------------------------------------------------------------
// Modelli di lavorazione: salvataggio e archiviazione (titolare e ufficio)
// ---------------------------------------------------------------------
function testataModello(t: DatiModello["testata"]) {
  if (!testo(t.nome)) throw new ErroreDati("Scrivi il nome del modello.");
  return {
    nome: testo(t.nome),
    descrizione: oNull(t.descrizione),
    ricarico_percentuale: numero(t.ricarico_percentuale, "Ricarico %", 2) ?? 35,
    note: oNull(t.note),
  };
}

function spiegaErroreModello(errore: Parameters<typeof spiegaErrore>[0]): string {
  if (errore.code === "23505") return "Esiste già un modello attivo con questo nome.";
  return spiegaErrore(errore);
}

export async function salvaModello(_prima: EsitoSalvataggio, dati: FormData): Promise<EsitoSalvataggio> {
  await richiediRuolo("titolare", "ufficio");
  let modulo: DatiModello;
  try {
    modulo = JSON.parse(String(dati.get("dati") ?? ""));
  } catch {
    return { errore: "Dati del modulo non leggibili. Ricarica la pagina." };
  }

  let modello: Record<string, unknown>;
  let fasi: unknown[];
  try {
    modello = testataModello(modulo.testata);
    fasi = fasiPerDatabase(modulo.fasi);
  } catch (e) {
    if (e instanceof ErroreDati) return { errore: e.message };
    return { errore: "Dati del modulo non validi. Ricarica la pagina." };
  }

  const supabase = await creaClientServer();
  const { data: id, error } = await supabase.rpc("salva_modello", { p_id: idONull(modulo.id), p_modello: modello, p_fasi: fasi });
  if (error) return { errore: spiegaErroreModello(error) };

  revalidatePath("/preventivi");
  redirect(indirizzo({ scheda: "modelli", id: String(id), ok: modulo.id ? "Modello salvato." : "Modello creato." }));
}

export async function archiviaModello(dati: FormData) {
  await richiediRuolo("titolare", "ufficio");
  const id = idONull(dati.get("id"));
  if (!id) redirect(indirizzo({ scheda: "modelli" }));
  const attivo = dati.get("attivo") === "true";

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("modelli_lavorazione").update({ attivo }).eq("id", id).select("id");
  const messaggio = error
    ? spiegaErroreModello(error)
    : !data?.length
      ? "Modello non trovato o permessi insufficienti."
      : attivo
        ? "Modello ripristinato."
        : "Modello archiviato.";
  revalidatePath("/preventivi");
  redirect(indirizzo({ scheda: "modelli", id, [error || !data?.length ? "errore" : "ok"]: messaggio }));
}

// ---------------------------------------------------------------------
// "Parti da un modello": legge ricarico e fasi (il modulo poi aggiorna i costi a oggi)
// ---------------------------------------------------------------------
export async function leggiModello(id: string): Promise<ModelloLetto> {
  await richiediRuolo("titolare", "ufficio");
  if (!idONull(id)) return { errore: "Modello non valido." };
  const supabase = await creaClientServer();
  const [{ data: modello, error }, fasi] = await Promise.all([
    supabase.from("modelli_lavorazione").select("ricarico_percentuale").eq("id", id).maybeSingle(),
    leggiFasi(supabase, { modelli: [id] }),
  ]);
  if (error || !modello || fasi === null) return { errore: "Non riesco a leggere il modello. Riprova." };
  return { ricarico_percentuale: Number(modello.ricarico_percentuale), fasi: fasi as FaseSalvata[] };
}

// ---------------------------------------------------------------------
// "Salva come modello": un nuovo modello con le fasi del preventivo (come sono nella pagina)
// ---------------------------------------------------------------------
export async function salvaComeModello(dati: { nome: string; ricarico_percentuale: string; fasi: BozzaFase[] }): Promise<EsitoSalvataggio> {
  await richiediRuolo("titolare", "ufficio");
  let fasi: unknown[];
  let modello: Record<string, unknown>;
  try {
    modello = testataModello({ nome: dati.nome, descrizione: "", ricarico_percentuale: dati.ricarico_percentuale, note: "" });
    // fasi NUOVE: senza gli id del preventivo
    fasi = fasiPerDatabase(copiaFasi(dati.fasi));
  } catch (e) {
    if (e instanceof ErroreDati) return { errore: e.message };
    return { errore: "Dati non validi. Ricarica la pagina." };
  }
  const supabase = await creaClientServer();
  const { data: id, error } = await supabase.rpc("salva_modello", { p_id: null, p_modello: modello, p_fasi: fasi });
  if (error) return { errore: spiegaErroreModello(error) };
  revalidatePath("/preventivi");
  redirect(indirizzo({ scheda: "modelli", id: String(id), ok: `Modello «${modello.nome}» creato dal preventivo.` }));
}

// ---------------------------------------------------------------------
// "Duplica": nuova bozza con numero nuovo, data di oggi, stesse fasi e righe.
// Il prezzo corretto a mano NON si copia (riparte dal calcolato).
// costi: "originali" = come nel preventivo copiato; "attuali" = tariffe e catalogo di oggi.
// ---------------------------------------------------------------------
export async function duplicaPreventivo(id: string, costi: "originali" | "attuali"): Promise<EsitoSalvataggio> {
  await richiediRuolo("titolare", "ufficio");
  if (!idONull(id)) return { errore: "Preventivo non valido." };
  const supabase = await creaClientServer();
  const [{ data: p, error }, fasiSalvate, scelte] = await Promise.all([
    supabase
      .from("preventivi")
      .select("numero, soggetto_id, oggetto, modello_id, ricarico_percentuale, codice_iva_id, cig, cup, note")
      .eq("id", id)
      .maybeSingle(),
    leggiFasi(supabase, { preventivo: id }),
    leggiTariffeArticoli(supabase),
  ]);
  if (error || !p || fasiSalvate === null || scelte === null) return { errore: "Non riesco a leggere il preventivo da duplicare. Riprova." };

  let bozze = copiaFasi(bozzaFasi(fasiSalvate)); // fasi NUOVE, senza gli id del preventivo copiato
  if (costi === "attuali") bozze = aggiornaCosti(bozze, scelte.tariffe, scelte.articoli);

  let fasi: unknown[];
  try {
    fasi = fasiPerDatabase(bozze);
  } catch (e) {
    return { errore: e instanceof ErroreDati ? e.message : "Dati del preventivo non validi." };
  }

  const { data: nuovoId, error: erroreSalva } = await supabase.rpc("salva_preventivo", {
    p_id: null,
    p_preventivo: {
      soggetto_id: p.soggetto_id,
      oggetto: p.oggetto,
      modello_id: p.modello_id,
      data: oggiItalia(),
      valido_fino: null, // un mese da oggi
      ricarico_percentuale: p.ricarico_percentuale,
      prezzo_cliente: null, // riparte dal prezzo calcolato
      codice_iva_id: p.codice_iva_id,
      cig: p.cig,
      cup: p.cup,
      note: p.note,
    },
    p_fasi: fasi,
  });
  if (erroreSalva) return { errore: spiegaErrore(erroreSalva) };

  revalidatePath("/preventivi");
  redirect(
    indirizzo({
      id: String(nuovoId),
      ok: `Copia del preventivo ${p.numero} creata${costi === "attuali" ? " con i costi di oggi" : " con gli stessi costi"}.`,
    })
  );
}
