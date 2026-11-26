// Dati del riepilogo del mese (scheda «Ore del mese» ed export per il consulente).
// Solo lato server. Per ogni persona e ogni giorno: entrata, uscita, pausa, ore lavorate
// (vista timbrature_giorno, 0013), ore previste (orario meno assenze approvate) e assenze.
// Chi non è titolare, ufficio o contabilità legge solo le proprie timbrature (RLS).
import type { SupabaseClient } from "@supabase/supabase-js";
import { oggiIt } from "@/lib/produzione";
import { durata, fasceDi, hhmm, periodoNelGiorno, spostaGiorno, togli, type FasciaOrario, type Intervallo } from "@/lib/programma";
import { oraRoma } from "@/lib/timbrature";

export type Persona = { id: string; nome_completo: string };

export type GiornoMese = {
  giorno: string;
  passato: boolean; // oggi compreso
  entrata: string | null; // "08:02"
  uscita: string | null;
  minutiLavorati: number;
  minutiPausa: number;
  minutiPrevisti: number;
  assenza: string | null; // "Ferie", "Permesso 14:00–16:00"…
  tipiAssenza: { tipo: string; minuti: number; intera: boolean }[];
  avvisi: string[];
};

export type TotaliMese = {
  giorniLavorati: number;
  minutiLavorati: number;
  minutiPrevisti: number; // fino a oggi
  giorniFerie: number;
  minutiPermesso: number;
  giorniMalattia: number; // «assente» se chi legge non vede il motivo
  giorniAnomalie: number;
};

const MOTIVI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", assente: "Assente" };

/** "2026-11" valido, altrimenti il mese di oggi */
export function meseValido(mese: string | undefined): string {
  return mese && /^\d{4}-(0[1-9]|1[0-2])$/.test(mese) ? mese : oggiIt().slice(0, 7);
}

/** Tutti i giorni del mese, "2026-11-01" … "2026-11-30" */
export function giorniDelMese(mese: string): string[] {
  const out: string[] = [];
  for (let g = `${mese}-01`; g.startsWith(mese); g = spostaGiorno(g, 1)) out.push(g);
  return out;
}

/** "2026-11" ± n mesi */
export function spostaMese(mese: string, n: number): string {
  const [a, m] = mese.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export async function leggiMese(supabase: SupabaseClient, mese: string, soloPersona?: string) {
  const giorni = giorniDelMese(mese);
  const primo = giorni[0];
  const ultimo = giorni[giorni.length - 1];
  const oggi = oggiIt();

  let qPersone = supabase.from("dipendenti_elenco").select("id, nome_completo, attivo").order("nome").order("cognome");
  let qGiorni = supabase.from("timbrature_giorno").select("*").gte("giorno", primo).lte("giorno", ultimo);
  let qAssenze = supabase.from("assenze_elenco").select("dipendente_id, dal, al, dalle, alle, motivo").lte("dal", ultimo).gte("al", primo);
  if (soloPersona) {
    qPersone = qPersone.eq("id", soloPersona);
    qGiorni = qGiorni.eq("dipendente_id", soloPersona);
    qAssenze = qAssenze.eq("dipendente_id", soloPersona);
  }
  const [risPersone, risGiorni, risAssenze, risOrari] = await Promise.all([
    qPersone,
    qGiorni,
    qAssenze,
    supabase.from("orari_lavoro").select("dipendente_id, giorno_settimana, dalle, alle").eq("attivo", true),
  ]);
  if (risGiorni.error) return { errore: true as const };

  type RigaVista = {
    dipendente_id: string;
    giorno: string;
    entrata: string | null;
    uscita: string | null;
    minuti_lavorati: number;
    minuti_pausa: number;
    sequenza_errata: boolean;
    uscita_mancante: boolean;
    fuori_zona: boolean;
    posizione_mancante: boolean;
    arrivate_dopo: boolean;
    corrette: boolean;
  };
  const vista = new Map<string, RigaVista>();
  for (const r of (risGiorni.data ?? []) as RigaVista[]) vista.set(`${r.dipendente_id}|${r.giorno}`, r);
  const assenze = (risAssenze.data ?? []) as { dipendente_id: string; dal: string; al: string; dalle: string | null; alle: string | null; motivo: string }[];
  const orari = (risOrari.data ?? []) as FasciaOrario[];

  // le persone attive, più quelle non più attive che hanno timbrato nel mese
  const conTimbrature = new Set([...vista.values()].map((r) => r.dipendente_id));
  const persone = ((risPersone.data ?? []) as (Persona & { attivo: boolean })[]).filter((p) => p.attivo || conTimbrature.has(p.id));

  const righe = persone.map((p) => {
    const mieAssenze = assenze.filter((a) => a.dipendente_id === p.id);
    const giorniPersona: GiornoMese[] = giorni.map((giorno) => {
      const v = vista.get(`${p.id}|${giorno}`);
      const fasce = fasceDi(p.id, giorno, orari);
      const tipiAssenza: GiornoMese["tipiAssenza"] = [];
      const pezzi: Intervallo[] = [];
      const testi: string[] = [];
      for (const a of mieAssenze) {
        const x = periodoNelGiorno(a, giorno);
        if (!x) continue;
        pezzi.push(x);
        const minuti = durata(fasce.map((f) => ({ da: Math.max(f.da, x.da), a: Math.min(f.a, x.a) })));
        const intera = x.da === 0 && x.a === 1440;
        tipiAssenza.push({ tipo: a.motivo, minuti, intera: intera || (fasce.length > 0 && minuti === durata(fasce)) });
        testi.push(`${MOTIVI[a.motivo] ?? a.motivo}${intera ? "" : ` ${hhmm(x.da)}–${hhmm(x.a)}`}`);
      }
      const minutiPrevisti = durata(togli(fasce, pezzi));
      const passato = giorno <= oggi;
      const avvisi: string[] = [];
      if (v?.uscita_mancante) avvisi.push("manca l'uscita");
      if (v?.sequenza_errata) avvisi.push("ordine sbagliato");
      if (v?.fuori_zona) avvisi.push("fuori zona");
      if (v?.posizione_mancante) avvisi.push("senza posizione");
      if (v?.arrivate_dopo) avvisi.push("arrivata dopo");
      if (v?.corrette) avvisi.push("corretta");
      if (!v && passato && giorno < oggi && minutiPrevisti > 0) avvisi.push("non timbrato");
      if (v && tipiAssenza.some((t) => t.intera)) avvisi.push("timbrato in un giorno di assenza");
      return {
        giorno,
        passato,
        entrata: v?.entrata ? oraRoma(v.entrata) : null,
        uscita: v?.uscita ? oraRoma(v.uscita) : null,
        minutiLavorati: v?.minuti_lavorati ?? 0,
        minutiPausa: v?.minuti_pausa ?? 0,
        minutiPrevisti,
        assenza: testi.length ? testi.join(", ") : null,
        tipiAssenza,
        avvisi,
      };
    });

    const totali: TotaliMese = {
      giorniLavorati: giorniPersona.filter((g) => g.minutiLavorati > 0).length,
      minutiLavorati: giorniPersona.reduce((s, g) => s + g.minutiLavorati, 0),
      minutiPrevisti: giorniPersona.filter((g) => g.passato).reduce((s, g) => s + g.minutiPrevisti, 0),
      giorniFerie: giorniPersona.filter((g) => g.tipiAssenza.some((t) => t.tipo === "ferie" && t.intera && t.minuti > 0)).length,
      minutiPermesso: giorniPersona.reduce((s, g) => s + g.tipiAssenza.filter((t) => t.tipo === "permesso").reduce((x, t) => x + t.minuti, 0), 0),
      giorniMalattia: giorniPersona.filter((g) => g.tipiAssenza.some((t) => (t.tipo === "malattia" || t.tipo === "assente") && t.minuti > 0)).length,
      giorniAnomalie: giorniPersona.filter((g) => g.avvisi.some((a) => a !== "corretta" && a !== "senza posizione" && a !== "arrivata dopo")).length,
    };
    return { persona: p, giorni: giorniPersona, totali };
  });

  return { errore: false as const, giorni, righe };
}
