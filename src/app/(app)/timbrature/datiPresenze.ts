// Presenze di un giorno: stato di ogni persona (presente, in pausa, non timbrato, assente…)
// e avvisi. Usato da Timbrature → «Presenze» e dalla Dashboard («Presenti oggi»),
// così contano allo stesso modo. Solo per chi legge le timbrature di tutti
// (titolare, ufficio, contabilità): agli operai il database dà solo le proprie.
import type { SupabaseClient } from "@supabase/supabase-js";
import { oggiIt } from "@/lib/produzione";
import { durata, fasceDi, periodoNelGiorno, spostaGiorno, togli, type FasciaOrario, type Intervallo } from "@/lib/programma";
import { distanzaTesto, giornoRoma, statoDopo, type Timbratura, type TipoTimbratura } from "@/lib/timbrature";

export type Persona = { id: string; nome_completo: string };
export type RigaTimbratura = Timbratura & { dipendente_id: string };
export type GiornoPersona = {
  dipendente_id: string;
  ultima: TipoTimbratura;
  minuti_lavorati: number;
  minuti_pausa: number;
  sequenza_errata: boolean;
  uscita_mancante: boolean;
  fuori_zona: boolean;
  distanza_max_m: number | null;
  posizione_mancante: boolean;
  arrivate_dopo: boolean;
  corrette: boolean;
};
export type AssenzaPresenze = { dipendente_id: string; dal: string; al: string; dalle: string | null; alle: string | null; motivo: string };

export type StatoPresenza = "presente" | "pausa" | "uscito" | "uscita_mancante" | "non_timbrato" | "non_ancora" | "assente" | "riposo" | "futuro";

export const STATI_PRESENZA: Record<StatoPresenza, { testo: string; stile: string }> = {
  presente: { testo: "Presente", stile: "bg-green-100 text-green-900" },
  pausa: { testo: "In pausa", stile: "bg-amber-100 text-amber-900" },
  uscito: { testo: "Uscito", stile: "bg-slate-100 text-slate-700" },
  uscita_mancante: { testo: "Manca l'uscita", stile: "bg-red-100 text-red-900" },
  non_timbrato: { testo: "Non timbrato", stile: "bg-red-100 text-red-900" },
  non_ancora: { testo: "Non ancora entrato", stile: "bg-slate-100 text-slate-700" },
  assente: { testo: "Assente", stile: "bg-purple-100 text-purple-900" },
  riposo: { testo: "Giorno di riposo", stile: "bg-slate-50 text-slate-500" },
  futuro: { testo: "—", stile: "text-slate-400" },
};

/** Minuti dalla mezzanotte, adesso, in Italia */
export function minutiAdesso(): number {
  const [h, m] = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" })
    .format(new Date())
    .split(":")
    .map(Number);
  return h * 60 + m;
}

export async function leggiPresenze(supabase: SupabaseClient, giorno: string) {
  const oggi = oggiIt();
  // un giorno in più per parte: poi si tiene solo il giorno italiano giusto
  const da = new Date(`${spostaGiorno(giorno, -1)}T00:00:00Z`).toISOString();
  const a = new Date(`${spostaGiorno(giorno, 2)}T00:00:00Z`).toISOString();

  const [risPersone, risTimbrature, risGiorno, risAssenze, risOrari] = await Promise.all([
    supabase.from("dipendenti_elenco").select("id, nome_completo").eq("attivo", true).order("nome").order("cognome"),
    supabase
      .from("timbrature")
      .select("id, dipendente_id, tipo, orario, origine, ricevuta_il, posizione, distanza_m")
      .eq("attivo", true)
      .gte("orario", da)
      .lt("orario", a)
      .order("orario")
      .order("ricevuta_il"),
    supabase.from("timbrature_giorno").select("*").eq("giorno", giorno),
    supabase.from("assenze_elenco").select("dipendente_id, dal, al, dalle, alle, motivo").lte("dal", giorno).gte("al", giorno),
    supabase.from("orari_lavoro").select("dipendente_id, giorno_settimana, dalle, alle").eq("attivo", true),
  ]);

  if (risTimbrature.error || risGiorno.error) return { errore: true as const, righe: [] };

  const persone = (risPersone.data ?? []) as Persona[];
  const timbrature = ((risTimbrature.data ?? []) as RigaTimbratura[]).filter((t) => giornoRoma(t.orario) === giorno);
  const riepilogo = new Map(((risGiorno.data ?? []) as GiornoPersona[]).map((g) => [g.dipendente_id, g]));
  const assenze = (risAssenze.data ?? []) as AssenzaPresenze[];
  const orari = (risOrari.data ?? []) as FasciaOrario[];
  const adesso = giorno === oggi ? minutiAdesso() : giorno < oggi ? 24 * 60 : -1;

  const righe = persone.map((p) => {
    const mie = timbrature.filter((t) => t.dipendente_id === p.id);
    const g = riepilogo.get(p.id);
    const fasce = fasceDi(p.id, giorno, orari);
    const assenzeMie = assenze.filter((x) => x.dipendente_id === p.id);
    const fuori: Intervallo[] = assenzeMie.map((x) => periodoNelGiorno(x, giorno)).filter((x): x is Intervallo => !!x);
    const daLavorare = togli(fasce, fuori);
    const previsti = durata(daLavorare);
    const tuttoAssente = fasce.length > 0 && previsti === 0 && assenzeMie.length > 0;

    let stato: StatoPresenza;
    if (g) {
      const s = statoDopo(g.ultima);
      stato = g.uscita_mancante ? "uscita_mancante" : s === "dentro" ? "presente" : s === "pausa" ? "pausa" : "uscito";
    } else if (tuttoAssente) stato = "assente";
    else if (!fasce.length) stato = "riposo";
    else if (adesso < 0) stato = "futuro";
    else if (daLavorare.length && adesso < daLavorare[0].da + 15) stato = "non_ancora";
    else stato = "non_timbrato";

    const avvisi: { testo: string; grave: boolean }[] = [];
    if (g?.uscita_mancante) avvisi.push({ testo: "manca l'uscita", grave: true });
    if (g?.sequenza_errata) avvisi.push({ testo: "timbrature in ordine sbagliato", grave: true });
    if (g?.fuori_zona) avvisi.push({ testo: `fuori zona${g.distanza_max_m ? ` (${distanzaTesto(g.distanza_max_m)})` : ""}`, grave: true });
    if (g?.posizione_mancante) avvisi.push({ testo: "senza posizione", grave: false });
    if (g?.arrivate_dopo) avvisi.push({ testo: "arrivata dopo (senza rete)", grave: false });
    if (g?.corrette) avvisi.push({ testo: "corretta dall'ufficio", grave: false });
    if (g && tuttoAssente) avvisi.push({ testo: "ha timbrato in un giorno di assenza", grave: true });

    return { p, mie, g, stato, previsti, fasce, assenzeMie, avvisi };
  });

  return { errore: false as const, righe };
}

export type RigaPresenze = Awaited<ReturnType<typeof leggiPresenze>>["righe"][number];

/** Quante persone sono in uno degli stati indicati */
export function contaStati(righe: RigaPresenze[], stati: StatoPresenza[]): number {
  return righe.filter((r) => stati.includes(r.stato)).length;
}

/** Persone con un avviso grave o non timbrate */
export function daControllare(righe: RigaPresenze[]): number {
  return righe.filter((r) => r.avvisi.some((x) => x.grave) || r.stato === "non_timbrato").length;
}
