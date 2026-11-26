// Timbrature → «Presenze»: chi c'è, chi è in pausa, chi non ha timbrato, in un giorno.
// Per titolare, ufficio e contabilità (gli operai non la vedono: leggono solo le proprie).
// Indirizzo: /timbrature?scheda=presenze&giorno=<data>
// Dati: timbrature del giorno (tabella), riepilogo e anomalie dalla vista timbrature_giorno
// (0013), assenze approvate (assenze_elenco), orari di lavoro (orari_lavoro).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { durata, fasceDi, giornoSettimana, hhmm, periodoNelGiorno, spostaGiorno, testoIntervalli, togli, type FasciaOrario, type Intervallo } from "@/lib/programma";
import {
  distanzaTesto,
  durataTesto,
  ETICHETTE_TIMBRATURA,
  giornoRoma,
  oraRoma,
  statoDopo,
  type Timbratura,
  type TipoTimbratura,
} from "@/lib/timbrature";
import { pulsanteSecondario, riquadro } from "../anagrafiche/stile";

type Persona = { id: string; nome_completo: string };
type Riga = Timbratura & { dipendente_id: string };
type Giorno = {
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
type Assenza = { dipendente_id: string; dal: string; al: string; dalle: string | null; alle: string | null; motivo: string };

type Stato = "presente" | "pausa" | "uscito" | "uscita_mancante" | "non_timbrato" | "non_ancora" | "assente" | "riposo" | "futuro";

const STATI: Record<Stato, { testo: string; stile: string }> = {
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
const MOTIVI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", assente: "Assente" };
const NOMI_GIORNO = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** Minuti dalla mezzanotte, adesso, in Italia */
function minutiAdesso(): number {
  const [h, m] = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Rome" })
    .format(new Date())
    .split(":")
    .map(Number);
  return h * 60 + m;
}

/** Pause del giorno come testo: "12:30–13:15, 16:00–…" */
function pause(t: Riga[]): string {
  const out: string[] = [];
  t.forEach((x, i) => {
    if (x.tipo !== "inizio_pausa") return;
    const dopo = t[i + 1];
    out.push(`${oraRoma(x.orario)}–${dopo ? oraRoma(dopo.orario) : "…"}`);
  });
  return out.join(", ");
}

export default async function SchedaPresenze({ giorno: richiesto }: { giorno?: string }) {
  const oggi = oggiIt();
  const giorno = richiesto && /^\d{4}-\d{2}-\d{2}$/.test(richiesto) ? richiesto : oggi;
  const supabase = await creaClientServer();

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

  if (risTimbrature.error || risGiorno.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
        Non riesco a leggere le timbrature. Se è la prima volta, manca la migrazione 0013 sul database.
      </p>
    );
  }

  const persone = (risPersone.data ?? []) as Persona[];
  const timbrature = ((risTimbrature.data ?? []) as Riga[]).filter((t) => giornoRoma(t.orario) === giorno);
  const riepilogo = new Map(((risGiorno.data ?? []) as Giorno[]).map((g) => [g.dipendente_id, g]));
  const assenze = (risAssenze.data ?? []) as Assenza[];
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

    let stato: Stato;
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

  const conta = (s: Stato[]) => righe.filter((r) => s.includes(r.stato)).length;
  const daControllare = righe.filter((r) => r.avvisi.some((x) => x.grave) || r.stato === "non_timbrato").length;
  const link = (g: string) => `/timbrature?scheda=presenze&giorno=${g}`;

  return (
    <div className="flex flex-col gap-4">
      {/* giorno */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link(spostaGiorno(giorno, -1))} aria-label="Giorno precedente" className={`${pulsanteSecondario} px-4 text-lg`}>‹</Link>
        <div className="min-w-48 text-center">
          <div className="text-lg font-bold capitalize">{NOMI_GIORNO[giornoSettimana(giorno)]} {dataIt(giorno)}</div>
          <div className="text-xs text-slate-500">{giorno === oggi ? "oggi" : giorno === spostaGiorno(oggi, -1) ? "ieri" : ""}</div>
        </div>
        <Link href={link(spostaGiorno(giorno, 1))} aria-label="Giorno successivo" className={`${pulsanteSecondario} px-4 text-lg`}>›</Link>
        {giorno !== oggi && <Link href={link(oggi)} className={pulsanteSecondario}>Oggi</Link>}
        <form action="/timbrature" className="ml-auto flex items-center gap-2 text-sm">
          <input type="hidden" name="scheda" value="presenze" />
          <label htmlFor="giorno-presenze" className="text-slate-600">Vai al</label>
          <input id="giorno-presenze" type="date" name="giorno" defaultValue={giorno} className="min-h-11 rounded-lg border border-slate-300 px-3" />
          <button className={pulsanteSecondario}>Vai</button>
        </form>
      </div>

      {/* riquadri */}
      <section aria-label="Riepilogo" className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <Numero etichetta="Presenti" valore={conta(["presente"])} colore="text-green-800" />
        <Numero etichetta="In pausa" valore={conta(["pausa"])} colore="text-amber-800" />
        <Numero etichetta="Usciti" valore={conta(["uscito"])} colore="text-slate-700" />
        <Numero etichetta="Non timbrati" valore={conta(["non_timbrato"])} colore="text-red-800" />
        <Numero etichetta="Assenti" valore={conta(["assente"])} colore="text-purple-800" />
        <Numero etichetta="Da controllare" valore={daControllare} colore={daControllare ? "text-red-800" : "text-slate-700"} />
      </section>

      {/* tabella */}
      <section className={riquadro}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Persona</th>
                <th className="px-4 py-3">Entrata</th>
                <th className="px-4 py-3">Pause</th>
                <th className="px-4 py-3">Uscita</th>
                <th className="px-4 py-3">Ore</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Da sapere</th>
              </tr>
            </thead>
            <tbody>
              {righe.map(({ p, mie, g, stato, previsti, fasce, assenzeMie, avvisi }) => {
                const entrata = mie.find((t) => t.tipo === "entrata");
                const uscita = [...mie].reverse().find((t) => t.tipo === "uscita");
                return (
                  <tr key={p.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{p.nome_completo}</div>
                      <div className="text-xs text-slate-500">{fasce.length ? testoIntervalli(fasce) : "riposo"}</div>
                      {mie.length > 0 && (
                        <details className="mt-1 text-xs">
                          <summary className="cursor-pointer text-blue-700">{mie.length} timbrature</summary>
                          <ul className="mt-1 flex flex-col gap-0.5 text-slate-700">
                            {mie.map((t) => (
                              <li key={t.id}>
                                <span className="tabular-nums">{oraRoma(t.orario)}</span> {ETICHETTE_TIMBRATURA[t.tipo]}
                                {t.origine === "ufficio" && " · corretta"}
                                {t.posizione === "fuori_zona" && ` · fuori zona ${distanzaTesto(t.distanza_m)}`}
                                {t.posizione === "in_zona" && " · in zona"}
                                {t.posizione === "non_disponibile" && " · senza posizione"}
                                {new Date(t.ricevuta_il).getTime() - new Date(t.orario).getTime() > 600000 && ` · arrivata alle ${oraRoma(t.ricevuta_il)}`}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{entrata ? oraRoma(entrata.orario) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{pause(mie) || "—"}</td>
                    <td className="px-4 py-3 tabular-nums">{uscita ? oraRoma(uscita.orario) : "—"}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {g ? durataTesto(g.minuti_lavorati) : "—"}
                      {previsti > 0 && <div className="text-xs text-slate-500">su {durataTesto(previsti)}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATI[stato].stile}`}>
                        {stato === "assente" ? MOTIVI[assenzeMie[0]?.motivo] ?? "Assente" : STATI[stato].testo}
                      </span>
                      {stato !== "assente" &&
                        assenzeMie.map((x, i) => {
                          const pezzo = periodoNelGiorno(x, giorno);
                          return (
                            <div key={i} className="mt-1 text-xs text-purple-800">
                              {MOTIVI[x.motivo] ?? "Assente"}
                              {pezzo && !(pezzo.da === 0 && pezzo.a === 1440) ? ` ${hhmm(pezzo.da)}–${hhmm(pezzo.a)}` : ""}
                            </div>
                          );
                        })}
                    </td>
                    <td className="px-4 py-3">
                      <ul className="flex flex-col gap-1 text-xs">
                        {avvisi.map((x) => (
                          <li key={x.testo} className={x.grave ? "font-semibold text-red-800" : "text-slate-600"}>
                            {x.testo}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {persone.length === 0 && <p className="text-sm text-slate-600">Nessun dipendente attivo.</p>}
      <p className="text-xs text-slate-500">
        «Non timbrato»: doveva lavorare (orario meno ferie e permessi) e dopo un quarto d&apos;ora dall&apos;inizio non ha
        timbrato. Le ore di oggi di chi è dentro arrivano fino ad adesso. «Fuori zona» non conta se quel giorno la persona
        ha una posa nel programma.
      </p>
    </div>
  );
}

function Numero({ etichetta, valore, colore }: { etichetta: string; valore: number; colore: string }) {
  return (
    <div className={`${riquadro} p-4`}>
      <div className="text-sm text-slate-500">{etichetta}</div>
      <div className={`text-3xl font-bold ${colore}`}>{valore}</div>
    </div>
  );
}
