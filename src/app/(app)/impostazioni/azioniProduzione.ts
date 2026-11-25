"use server";
// Azioni della scheda Impostazioni → «Macchine e competenze» (solo titolare).
// Anche se qualcuno le chiamasse senza permesso, il database (RLS) rifiuterebbe.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PostgrestError } from "@supabase/supabase-js";
import { richiediRuolo } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { GIORNI, minuti, type LivelloCompetenza } from "@/lib/produzione";

const SCHEDA = "/impostazioni?scheda=macchine";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function torna(messaggio: string, errore = false, extra = ""): never {
  redirect(`${SCHEDA}${extra}&${errore ? "errore" : "ok"}=${encodeURIComponent(messaggio)}`);
}

function testo(dati: FormData, campo: string): string {
  return String(dati.get(campo) ?? "").trim();
}

function spiega(errore: PostgrestError, doppione: string): string {
  if (errore.code === "23505") return doppione;
  if (errore.code === "23514") return "Controlla i dati: c'è un campo vuoto o un periodo non valido.";
  if (errore.code === "P0001") return errore.message; // messaggi scritti da noi nei trigger
  return "Salvataggio non riuscito. Riprova.";
}

function aggiorna() {
  revalidatePath("/impostazioni");
  revalidatePath("/produzione");
}

// ---------------------------------------------------------------------
// Macchine e postazioni
// ---------------------------------------------------------------------
export async function salvaMacchina(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  const nome = testo(dati, "nome");
  const tipo = testo(dati, "tipo");
  const tariffa = testo(dati, "tariffa_id");
  const ordine = Number.parseInt(testo(dati, "ordine") || "0", 10);

  if (!nome) torna("Il nome è obbligatorio.", true);
  if (tipo !== "macchina" && tipo !== "postazione") torna("Tipo non valido.", true);
  if (tariffa && !UUID.test(tariffa)) torna("Tariffa non valida.", true);
  if (!Number.isFinite(ordine) || ordine < 0 || ordine > 9999) torna(`Posizione non valida per «${nome}».`, true);

  const valori = {
    nome,
    tipo,
    reparto: testo(dati, "reparto") || null,
    tariffa_id: tariffa || null,
    fuori_sede: dati.get("fuori_sede") === "on",
    ordine,
    note: testo(dati, "note") || null,
  };
  const doppione = `Esiste già una macchina o postazione attiva che si chiama «${nome}».`;
  const supabase = await creaClientServer();

  if (!id) {
    const { error } = await supabase.from("macchine").insert(valori);
    if (error) torna(spiega(error, doppione), true);
    aggiorna();
    torna(`«${nome}» aggiunta.`);
  }

  const { data, error } = await supabase
    .from("macchine")
    .update({ ...valori, attivo: dati.get("attivo") === "on" })
    .eq("id", id)
    .select("id");
  if (error) torna(spiega(error, doppione), true);
  if (!data?.length) torna("Macchina non trovata o permessi insufficienti.", true);

  aggiorna();
  torna(`«${nome}» salvata.`);
}

// ---------------------------------------------------------------------
// Competenze: un clic sulla casella passa al livello successivo
// (vuota → sa usarla → principale → vuota). Una riga per coppia:
// "vuota" = riga archiviata, che si riattiva se la competenza torna.
// ---------------------------------------------------------------------
export async function impostaCompetenza(dati: FormData) {
  await richiediRuolo("titolare");
  const dipendente = testo(dati, "dipendente_id");
  const macchina = testo(dati, "macchina_id");
  const livello = testo(dati, "livello");
  if (!UUID.test(dipendente) || !UUID.test(macchina)) torna("Casella non valida.", true);
  if (livello && livello !== "principale" && livello !== "sa_usarla") torna("Livello non valido.", true);

  const supabase = await creaClientServer();
  const { error } = await supabase.from("competenze").upsert(
    {
      dipendente_id: dipendente,
      macchina_id: macchina,
      livello: (livello || "sa_usarla") as LivelloCompetenza,
      attivo: Boolean(livello),
    },
    { onConflict: "dipendente_id,macchina_id" },
  );
  if (error) torna(spiega(error, "Competenza già presente."), true);

  // niente messaggio: la tabella si aggiorna da sola e la pagina resta dov'è
  aggiorna();
}

// ---------------------------------------------------------------------
// Fermi macchina (manutenzioni, guasti)
// ---------------------------------------------------------------------
export async function salvaFermo(dati: FormData) {
  await richiediRuolo("titolare");
  const macchina = testo(dati, "macchina_id");
  const dal = testo(dati, "dal");
  const al = testo(dati, "al") || dal;
  const dalle = testo(dati, "dalle");
  const alle = testo(dati, "alle");
  const motivo = testo(dati, "motivo") || "Manutenzione";

  if (!UUID.test(macchina)) torna("Scegli la macchina.", true);
  if (!DATA.test(dal) || !DATA.test(al)) torna("Indica il giorno del fermo.", true);
  if (al < dal) torna("Il fermo finisce prima di cominciare: controlla le date.", true);
  if ((dalle && !ORA.test(dalle)) || (alle && !ORA.test(alle))) torna("Scrivi le ore come 14:00.", true);
  if (dal === al && dalle && alle && minuti(alle) <= minuti(dalle))
    torna("L'ora di fine deve essere dopo l'ora di inizio.", true);

  const supabase = await creaClientServer();
  const { error } = await supabase.from("fermi_macchina").insert({
    macchina_id: macchina,
    dal,
    al,
    dalle: dalle || null,
    alle: alle || null,
    motivo,
  });
  if (error) torna(spiega(error, "Fermo già presente."), true);

  aggiorna();
  torna("Fermo macchina registrato.");
}

export async function annullaFermo(dati: FormData) {
  await richiediRuolo("titolare");
  const id = testo(dati, "id");
  if (!UUID.test(id)) torna("Fermo non valido.", true);

  const supabase = await creaClientServer();
  const { data, error } = await supabase.from("fermi_macchina").update({ attivo: false }).eq("id", id).select("id");
  if (error) torna(spiega(error, ""), true);
  if (!data?.length) torna("Fermo non trovato o permessi insufficienti.", true);

  aggiorna();
  torna("Fermo macchina tolto.");
}

// ---------------------------------------------------------------------
// Orario di lavoro: dell'azienda (dipendente vuoto) o di una persona.
// Per ogni giorno fino a due fasce (mattina e pomeriggio).
// Prima si inseriscono le fasce nuove, poi si archiviano le vecchie:
// se qualcosa va storto a metà, l'orario di prima resta valido.
// ---------------------------------------------------------------------
export async function salvaOrario(dati: FormData) {
  await richiediRuolo("titolare");
  const dipendente = testo(dati, "dipendente_id");
  const extra = dipendente ? `&orario=${dipendente}` : "";
  if (dipendente && !UUID.test(dipendente)) torna("Persona non valida.", true);
  const usaAziendale = dati.get("usa_aziendale") === "1";

  const nuove: { dipendente_id: string | null; giorno_settimana: number; dalle: string; alle: string }[] = [];
  if (!usaAziendale) {
    for (const g of GIORNI) {
      let fineFasciaPrima = -1;
      for (const n of [1, 2]) {
        const dalle = testo(dati, `g${g.numero}_${n}_dalle`);
        const alle = testo(dati, `g${g.numero}_${n}_alle`);
        if (!dalle && !alle) continue;
        if (!ORA.test(dalle) || !ORA.test(alle))
          torna(`${g.nome}: scrivi tutte e due le ore della fascia (es. 08:00 e 12:30).`, true, extra);
        if (minuti(alle) <= minuti(dalle)) torna(`${g.nome}: l'ora di fine deve essere dopo quella di inizio.`, true, extra);
        if (minuti(dalle) < fineFasciaPrima) torna(`${g.nome}: le due fasce si sovrappongono.`, true, extra);
        fineFasciaPrima = minuti(alle);
        nuove.push({ dipendente_id: dipendente || null, giorno_settimana: g.numero, dalle, alle });
      }
    }
    if (nuove.length === 0 && !dipendente)
      torna("L'orario dell'azienda non può essere vuoto: indica almeno una fascia.", true, extra);
    if (nuove.length === 0) torna("Indica almeno una fascia, oppure scegli «Usa l'orario dell'azienda».", true, extra);
  }

  const supabase = await creaClientServer();
  let vecchie = supabase.from("orari_lavoro").select("id").eq("attivo", true);
  vecchie = dipendente ? vecchie.eq("dipendente_id", dipendente) : vecchie.is("dipendente_id", null);
  const { data: daArchiviare, error: errLettura } = await vecchie;
  if (errLettura) torna("Salvataggio non riuscito. Riprova.", true, extra);

  if (nuove.length) {
    const { error } = await supabase.from("orari_lavoro").insert(nuove);
    if (error) torna(spiega(error, ""), true, extra);
  }
  const ids = (daArchiviare ?? []).map((r) => r.id as string);
  if (ids.length) {
    const { error } = await supabase.from("orari_lavoro").update({ attivo: false }).in("id", ids);
    if (error) torna(spiega(error, ""), true, extra);
  }

  aggiorna();
  if (usaAziendale) torna("Ora questa persona segue l'orario dell'azienda.", false, extra);
  torna(dipendente ? "Orario personale salvato." : "Orario dell'azienda salvato.", false, extra);
}
