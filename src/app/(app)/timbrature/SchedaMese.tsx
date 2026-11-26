// Timbrature → «Ore del mese».
//   - titolare, ufficio, contabilità: tutte le persone con i totali del mese, export CSV
//     per il consulente; toccando una persona, il dettaglio giorno per giorno;
//   - gli altri: le proprie ore del mese, giorno per giorno («Le mie ore del mese»).
// Indirizzo: /timbrature?scheda=mese&mese=2026-11[&persona=<dipendente>]
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt } from "@/lib/produzione";
import { giornoSettimana } from "@/lib/programma";
import { durataTesto } from "@/lib/timbrature";
import { pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { leggiMese, meseValido, spostaMese, type GiornoMese, type TotaliMese } from "./datiMese";

const NOME_MESE = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
const GIORNI_BREVI = ["", "lun", "mar", "mer", "gio", "ven", "sab", "dom"];

function titoloMese(mese: string): string {
  return NOME_MESE.format(new Date(`${mese}-15T12:00:00Z`));
}

/** +45 min / −1 h 30 min */
function differenza(min: number): string {
  if (min === 0) return "0";
  return `${min > 0 ? "+" : "−"}${durataTesto(Math.abs(min))}`;
}

export default async function SchedaMese({
  mese: richiesto,
  persona: richiesta,
  uffici,
  mio,
}: {
  mese?: string;
  persona?: string;
  uffici: boolean;
  mio: string | null;
}) {
  const mese = meseValido(richiesto);
  const persona = uffici ? richiesta : mio ?? undefined;
  const link = (m: string, p?: string) => `/timbrature?scheda=mese&mese=${m}${p ? `&persona=${p}` : ""}`;

  if (!uffici && !mio) {
    return (
      <p className={`${riquadro} p-4 text-sm text-slate-600`}>
        Il tuo account non è collegato a un dipendente, quindi non hai ore tue. Il collegamento lo fa il titolare.
      </p>
    );
  }

  const supabase = await creaClientServer();
  const dati = await leggiMese(supabase, mese, persona);
  if (dati.errore) {
    return <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">Non riesco a leggere le timbrature del mese.</p>;
  }

  const scelta = persona ? dati.righe.find((r) => r.persona.id === persona) : undefined;
  const oggi = oggiIt();

  return (
    <div className="flex flex-col gap-4">
      {/* mese */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={link(spostaMese(mese, -1), persona)} aria-label="Mese precedente" className={`${pulsanteSecondario} px-4 text-lg`}>‹</Link>
        <div className="min-w-44 text-center text-lg font-bold capitalize">{titoloMese(mese)}</div>
        <Link href={link(spostaMese(mese, 1), persona)} aria-label="Mese successivo" className={`${pulsanteSecondario} px-4 text-lg`}>›</Link>
        {mese !== oggi.slice(0, 7) && <Link href={link(oggi.slice(0, 7), persona)} className={pulsanteSecondario}>Questo mese</Link>}
        {uffici && (
          <div className="ml-auto flex flex-wrap gap-2">
            <a href={`/timbrature/export?mese=${mese}&tipo=giorni`} className={pulsanteSecondario}>Scarica giorno per giorno (CSV)</a>
            <a href={`/timbrature/export?mese=${mese}&tipo=totali`} className={pulsanteSecondario}>Scarica i totali (CSV)</a>
          </div>
        )}
      </div>

      {scelta ? (
        <>
          {uffici && (
            <Link href={link(mese)} className="self-start text-sm font-semibold text-blue-700 hover:underline">← Tutte le persone</Link>
          )}
          <h2 className="text-lg font-semibold">{uffici ? scelta.persona.nome_completo : "Le mie ore del mese"}</h2>
          <Totali t={scelta.totali} />
          <TabellaGiorni giorni={scelta.giorni} oggi={oggi} />
        </>
      ) : (
        <section className={riquadro}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <th className="px-4 py-3">Persona</th>
                  <th className="px-4 py-3 text-right">Giorni</th>
                  <th className="px-4 py-3 text-right">Ore lavorate</th>
                  <th className="px-4 py-3 text-right">Previste</th>
                  <th className="px-4 py-3 text-right">Differenza</th>
                  <th className="px-4 py-3 text-right">Ferie</th>
                  <th className="px-4 py-3 text-right">Permessi</th>
                  <th className="px-4 py-3 text-right">Malattia / assente</th>
                  <th className="px-4 py-3 text-right">Da controllare</th>
                </tr>
              </thead>
              <tbody>
                {dati.righe.map(({ persona: p, totali: t }) => (
                  <tr key={p.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={link(mese, p.id)} className="font-semibold text-blue-700 hover:underline">{p.nome_completo}</Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.giorniLavorati}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{durataTesto(t.minutiLavorati)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{durataTesto(t.minutiPrevisti)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${t.minutiLavorati - t.minutiPrevisti < 0 ? "text-red-800" : "text-green-800"}`}>
                      {differenza(t.minutiLavorati - t.minutiPrevisti)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.giorniFerie || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.minutiPermesso ? durataTesto(t.minutiPermesso) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{t.giorniMalattia || "—"}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${t.giorniAnomalie ? "font-semibold text-red-800" : ""}`}>{t.giorniAnomalie || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Previste = orario di lavoro meno ferie, permessi e malattia, fino a oggi. Ferie e malattia in giorni, permessi in
        ore. «Da controllare» = giorni con uscita mancante, ordine sbagliato, fuori zona, non timbrati o timbrati in un
        giorno di assenza. Lo straordinario e i conteggi del contratto li fa il consulente.
      </p>
    </div>
  );
}

function Totali({ t }: { t: TotaliMese }) {
  const caselle = [
    { etichetta: "Ore lavorate", valore: durataTesto(t.minutiLavorati) },
    { etichetta: "Previste fino a oggi", valore: durataTesto(t.minutiPrevisti) },
    { etichetta: "Differenza", valore: differenza(t.minutiLavorati - t.minutiPrevisti) },
    { etichetta: "Ferie", valore: t.giorniFerie ? `${t.giorniFerie} gg` : "—" },
    { etichetta: "Permessi", valore: t.minutiPermesso ? durataTesto(t.minutiPermesso) : "—" },
  ];
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
      {caselle.map((c) => (
        <div key={c.etichetta} className={`${riquadro} p-4`}>
          <div className="text-sm text-slate-500">{c.etichetta}</div>
          <div className="text-xl font-bold tabular-nums">{c.valore}</div>
        </div>
      ))}
    </section>
  );
}

function TabellaGiorni({ giorni, oggi }: { giorni: GiornoMese[]; oggi: string }) {
  return (
    <section className={riquadro}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th className="px-3 py-2">Giorno</th>
              <th className="px-3 py-2">Entrata</th>
              <th className="px-3 py-2">Uscita</th>
              <th className="px-3 py-2 text-right">Pausa</th>
              <th className="px-3 py-2 text-right">Ore</th>
              <th className="px-3 py-2 text-right">Previste</th>
              <th className="px-3 py-2">Assenza e avvisi</th>
            </tr>
          </thead>
          <tbody>
            {giorni.map((g) => {
              const gs = giornoSettimana(g.giorno);
              const riposo = g.minutiPrevisti === 0 && !g.assenza && !g.minutiLavorati;
              return (
                <tr
                  key={g.giorno}
                  className={`border-b border-slate-100 last:border-0 ${g.giorno === oggi ? "bg-blue-50" : riposo ? "bg-slate-50 text-slate-400" : !g.passato ? "text-slate-400" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                    <span className="inline-block w-8">{GIORNI_BREVI[gs]}</span> {g.giorno.slice(8, 10)}/{g.giorno.slice(5, 7)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{g.entrata ?? ""}</td>
                  <td className="px-3 py-2 tabular-nums">{g.uscita ?? ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{g.minutiPausa ? durataTesto(g.minutiPausa) : ""}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{g.minutiLavorati ? durataTesto(g.minutiLavorati) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{g.minutiPrevisti ? durataTesto(g.minutiPrevisti) : ""}</td>
                  <td className="px-3 py-2 text-xs">
                    {g.assenza && <span className="mr-2 font-semibold text-purple-800">{g.assenza}</span>}
                    {g.avvisi.map((a) => (
                      <span key={a} className={`mr-2 ${["corretta", "senza posizione", "arrivata dopo"].includes(a) ? "text-slate-500" : "font-semibold text-red-800"}`}>
                        {a}
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
