// Richieste di ferie e permessi (0012), dentro Timbrature → «Ferie e permessi».
//   RichiesteDaDecidere → titolare: Approva / Rifiuta, con gli avvisi utili per decidere
//   MieRichieste        → chi chiede: stato delle proprie richieste, «Ritira» se in attesa
import { dataIt, ora } from "@/lib/produzione";
import { campo, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { decidiRichiesta, ritiraRichiesta } from "./azioni";

export type Richiesta = {
  id: string;
  dipendente_id: string;
  tipo: string;
  dal: string;
  al: string;
  dalle: string | null;
  alle: string | null;
  note: string | null;
  creato_il: string;
};
export type MiaAssenza = Omit<Richiesta, "dipendente_id" | "creato_il"> & {
  stato: "richiesta" | "approvata" | "rifiutata";
  risposta: string | null;
  deciso_il: string | null;
};
/** Avvisi già calcolati per una richiesta */
export type AvvisiRichiesta = { lavori: number; colleghi: string[] };

const NOMI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia" };
const STATI: Record<MiaAssenza["stato"], { testo: string; stile: string }> = {
  richiesta: { testo: "In attesa", stile: "bg-amber-100 text-amber-900" },
  approvata: { testo: "Approvata", stile: "bg-green-100 text-green-900" },
  rifiutata: { testo: "Rifiutata", stile: "bg-red-100 text-red-900" },
};

export function periodoTesto(a: { dal: string; al: string; dalle: string | null; alle: string | null }): string {
  const giorni = a.dal === a.al ? dataIt(a.dal) : `dal ${dataIt(a.dal)} al ${dataIt(a.al)}`;
  return a.dalle && a.alle && a.dal === a.al ? `${giorni}, ${ora(a.dalle)}–${ora(a.alle)}` : giorni;
}

export function RichiesteDaDecidere({
  richieste,
  nome,
  avvisi,
  settimana,
}: {
  richieste: Richiesta[];
  nome: (id: string) => string;
  avvisi: Record<string, AvvisiRichiesta>;
  settimana: string;
}) {
  return (
    <section aria-label="Richieste da decidere" className={`${riquadro} ${richieste.length ? "border-amber-300" : ""}`}>
      <h2 className="border-b border-slate-200 p-4 font-semibold">
        Richieste da decidere{richieste.length > 0 && <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{richieste.length}</span>}
      </h2>
      {richieste.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {richieste.map((r) => {
            const av = avvisi[r.id] ?? { lavori: 0, colleghi: [] };
            return (
              <li key={r.id} className="flex flex-col gap-2 p-4 text-sm">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <strong>{nome(r.dipendente_id)}</strong>
                  <span className="font-semibold">{NOMI[r.tipo] ?? r.tipo}</span>
                  <span>{periodoTesto(r)}</span>
                </div>
                {r.note && <p className="text-slate-600">«{r.note}»</p>}
                <p className="text-xs text-slate-500">Chiesta il {dataIt(r.creato_il.slice(0, 10))}</p>
                {(av.lavori > 0 || av.colleghi.length > 0) && (
                  <ul className="flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {av.lavori > 0 && (
                      <li>⚠ In quei giorni ha {av.lavori} {av.lavori === 1 ? "lavoro" : "lavori"} nel programma</li>
                    )}
                    {av.colleghi.length > 0 && <li>⚠ Già assenti in quei giorni: {av.colleghi.join(", ")}</li>}
                  </ul>
                )}
                <form action={decidiRichiesta} className="flex flex-col gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="settimana" value={settimana} />
                  <input name="risposta" placeholder="Nota per la persona (facoltativa, es. il motivo del rifiuto)" aria-label="Nota per la persona" className={campo} />
                  <div className="flex gap-2">
                    <button name="esito" value="approva" className={`${pulsante} flex-1`}>Approva</button>
                    <button name="esito" value="rifiuta" className={`${pulsanteSecondario} flex-1 justify-center text-red-700`}>Rifiuta</button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MieRichieste({ assenze, settimana }: { assenze: MiaAssenza[]; settimana: string }) {
  return (
    <section aria-label="Le mie richieste" className={riquadro}>
      <h2 className="border-b border-slate-200 p-4 font-semibold">Le mie ferie e permessi</h2>
      {assenze.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessuna richiesta.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {assenze.map((a) => (
            <li key={a.id} className="flex flex-col gap-1.5 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${STATI[a.stato].stile}`}>{STATI[a.stato].testo}</span>
                <strong>{NOMI[a.tipo] ?? a.tipo}</strong>
                <span>{periodoTesto(a)}</span>
              </div>
              {a.note && <p className="text-slate-600">{a.note}</p>}
              {a.risposta && (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
                  <span className="text-xs font-semibold text-slate-500">Risposta del titolare: </span>
                  {a.risposta}
                </p>
              )}
              {a.stato === "richiesta" && (
                <form action={ritiraRichiesta}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="settimana" value={settimana} />
                  <button className={pulsanteSecondario}>Ritira la richiesta</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
