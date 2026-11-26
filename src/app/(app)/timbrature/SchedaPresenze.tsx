// Timbrature → «Presenze»: chi c'è, chi è in pausa, chi non ha timbrato, in un giorno.
// Per titolare, ufficio e contabilità (gli operai non la vedono: leggono solo le proprie).
// Indirizzo: /timbrature?scheda=presenze&giorno=<data>
// Dati: timbrature del giorno (tabella), riepilogo e anomalie dalla vista timbrature_giorno
// (0013), assenze approvate (assenze_elenco), orari di lavoro (orari_lavoro).
import { Fragment } from "react";
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { giornoSettimana, hhmm, periodoNelGiorno, spostaGiorno, testoIntervalli } from "@/lib/programma";
import { distanzaTesto, durataTesto, ETICHETTE_TIMBRATURA, oraRoma } from "@/lib/timbrature";
import { pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import PannelloCorrezioni from "./PannelloCorrezioni";
import { contaStati, daControllare as quantiDaControllare, leggiPresenze, STATI_PRESENZA as STATI, type RigaTimbratura as Riga, type StatoPresenza as Stato } from "./datiPresenze";

const MOTIVI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", assente: "Assente" };
const NOMI_GIORNO = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

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

export default async function SchedaPresenze({
  giorno: richiesto,
  correggi,
  puoCorreggere,
}: {
  giorno?: string;
  correggi?: string;
  puoCorreggere: boolean;
}) {
  const oggi = oggiIt();
  const giorno = richiesto && /^\d{4}-\d{2}-\d{2}$/.test(richiesto) ? richiesto : oggi;
  const supabase = await creaClientServer();

  const { errore, righe } = await leggiPresenze(supabase, giorno);
  if (errore) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
        Non riesco a leggere le timbrature. Se è la prima volta, manca la migrazione 0013 sul database.
      </p>
    );
  }

  const conta = (s: Stato[]) => contaStati(righe, s);
  const daControllare = quantiDaControllare(righe);
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
                const aperto = puoCorreggere && correggi === p.id;
                return (
                  <Fragment key={p.id}>
                  <tr className={`border-b border-slate-100 align-top last:border-0 ${aperto ? "bg-blue-50/60" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-semibold">{p.nome_completo}</span>
                        {puoCorreggere && !aperto && giorno <= oggi && (
                          <Link href={`${link(giorno)}&correggi=${p.id}`} className="text-xs font-semibold text-blue-700 hover:underline">
                            Correggi
                          </Link>
                        )}
                      </div>
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
                  {aperto && (
                    <tr className="border-b border-slate-100">
                      <td colSpan={7} className="px-4 pb-4">
                        <PannelloCorrezioni dipendente={p.id} nome={p.nome_completo} giorno={giorno} />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {righe.length === 0 && <p className="text-sm text-slate-600">Nessun dipendente attivo.</p>}
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
