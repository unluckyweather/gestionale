// Timbrature → «Ferie e permessi»: calendario di due settimane per tutti.
//   - titolare: registra e toglie le assenze, approva o rifiuta le richieste;
//   - gli altri (collegati a un dipendente): chiedono ferie e permessi per sé
//     e vedono lo stato delle loro richieste (0012).
// Calendario dalla vista assenze_elenco (solo approvate; chi non è titolare vede
// «assente» al posto di «malattia», tranne per sé stesso, e le note solo sue).
// Le richieste in attesa si leggono dalla tabella assenze: il titolare le vede
// tutte, gli altri solo le proprie (RLS); nel calendario sono tratteggiate.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, ora } from "@/lib/produzione";
import { pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import ModuloAssenza from "./ModuloAssenza";
import { MieRichieste, RichiesteDaDecidere, periodoTesto, type AvvisiRichiesta, type MiaAssenza, type Richiesta } from "./RichiesteAssenze";
import { togliAssenza } from "./azioni";

type Assenza = {
  id: string;
  dipendente_id: string;
  dal: string;
  al: string;
  dalle: string | null;
  alle: string | null;
  motivo: string;
  note: string | null;
  inAttesa?: boolean;
};
type Persona = { id: string; nome_completo: string; attivo: boolean; io: boolean };

const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const STILI: Record<string, string> = {
  ferie: "bg-purple-200 text-purple-900",
  permesso: "bg-blue-100 text-blue-900",
  malattia: "bg-orange-100 text-orange-900",
  assente: "bg-slate-200 text-slate-800",
};
const NOMI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso", malattia: "Malattia", assente: "Assente" };

/** "2026-11-25" + n giorni (calcolo sulle date, senza fusi orari) */
function piuGiorni(data: string, n: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Lunedì della settimana di quella data */
function lunedi(data: string): string {
  const d = new Date(`${data}T12:00:00Z`);
  return piuGiorni(data, -((d.getUTCDay() + 6) % 7));
}

/** Cosa scrivere nella casella di un giorno */
function casella(a: Assenza, giorno: string): string {
  if (a.dalle && a.alle && a.dal === a.al) return `${ora(a.dalle)}–${ora(a.alle)}`;
  if (a.dalle && giorno === a.dal) return `dalle ${ora(a.dalle)}`;
  if (a.alle && giorno === a.al) return `fino ${ora(a.alle)}`;
  return NOMI[a.motivo] ?? a.motivo;
}

/** Due periodi (giorni ed eventuali ore) si sovrappongono? */
function siToccano(
  a: { dal: string; al: string; dalle: string | null; alle: string | null },
  b: { dal: string; al: string; dalle: string | null; alle: string | null }
): boolean {
  if (a.al < b.dal || b.al < a.dal) return false;
  // a ore nello stesso giorno: confronta anche le ore
  if (a.dal === a.al && b.dal === b.al && a.dalle && a.alle && b.dalle && b.alle) return a.dalle < b.alle && b.dalle < a.alle;
  return true;
}

export default async function SchedaAssenze({ dal, titolare, oggi }: { dal?: string; titolare: boolean; oggi: string }) {
  const inizio = lunedi(dal && /^\d{4}-\d{2}-\d{2}$/.test(dal) ? dal : oggi);
  const fine = piuGiorni(inizio, 13);
  const giorni = Array.from({ length: 14 }, (_, i) => piuGiorni(inizio, i));

  const supabase = await creaClientServer();
  const [risPersone, risAssenze, risAttesa] = await Promise.all([
    supabase.from("dipendenti_elenco").select("id, nome_completo, attivo, io").order("nome").order("cognome"),
    supabase
      .from("assenze_elenco")
      .select("id, dipendente_id, dal, al, dalle, alle, motivo, note")
      .lte("dal", fine)
      .gte("al", inizio)
      .order("dal"),
    // richieste in attesa (titolare: tutte; gli altri: solo le proprie, per la RLS)
    supabase
      .from("assenze")
      .select("id, dipendente_id, tipo, dal, al, dalle, alle, note, creato_il")
      .eq("stato", "richiesta")
      .eq("attivo", true)
      .order("dal"),
  ]);
  if (risAssenze.error) console.error("Lettura delle assenze non riuscita:", risAssenze.error.message);
  if (risAttesa.error) console.error("Lettura delle richieste non riuscita:", risAttesa.error.message);
  const richieste = (risAttesa.data ?? []) as Richiesta[];
  // nel calendario: approvate + richieste in attesa del periodo (tratteggiate)
  const assenze: Assenza[] = [
    ...((risAssenze.data ?? []) as Assenza[]),
    ...richieste
      .filter((r) => r.dal <= fine && r.al >= inizio)
      .map((r) => ({ ...r, motivo: r.tipo, inAttesa: true })),
  ].sort((a, b) => a.dal.localeCompare(b.dal));
  const approvate = assenze.filter((a) => !a.inAttesa);
  // le persone attive, più chi non lo è più ma ha un'assenza nel periodo
  const persone = ((risPersone.data ?? []) as Persona[]).filter(
    (p) => p.attivo || assenze.some((a) => a.dipendente_id === p.id)
  );
  const nome = (id: string) => persone.find((p) => p.id === id)?.nome_completo ?? "";
  const io = ((risPersone.data ?? []) as Persona[]).find((p) => p.io && p.attivo);

  // titolare: avvisi per decidere (lavori nel programma, colleghi già assenti)
  const avvisi: Record<string, AvvisiRichiesta> = {};
  if (titolare && richieste.length) {
    const da = richieste.reduce((m, r) => (r.dal < m ? r.dal : m), richieste[0].dal);
    const a = richieste.reduce((m, r) => (r.al > m ? r.al : m), richieste[0].al);
    const [risLavori, risAltre] = await Promise.all([
      supabase
        .from("assegnazioni")
        .select("dipendente_id, giorno, dalle, alle")
        .eq("attivo", true)
        .in("dipendente_id", [...new Set(richieste.map((r) => r.dipendente_id))])
        .gte("giorno", da)
        .lte("giorno", a),
      supabase.from("assenze_elenco").select("dipendente_id, dal, al, dalle, alle").lte("dal", a).gte("al", da),
    ]);
    const lavori = (risLavori.data ?? []) as { dipendente_id: string; giorno: string; dalle: string; alle: string }[];
    const altre = (risAltre.data ?? []) as { dipendente_id: string; dal: string; al: string; dalle: string | null; alle: string | null }[];
    for (const r of richieste) {
      avvisi[r.id] = {
        lavori: lavori.filter(
          (l) => l.dipendente_id === r.dipendente_id && siToccano(r, { dal: l.giorno, al: l.giorno, dalle: l.dalle, alle: l.alle })
        ).length,
        colleghi: [...new Set(altre.filter((x) => x.dipendente_id !== r.dipendente_id && siToccano(r, x)).map((x) => nome(x.dipendente_id)))].filter(Boolean),
      };
    }
  }

  // chi chiede: le proprie assenze (richieste, approvate, rifiutate), recenti e future
  let mie: MiaAssenza[] = [];
  if (!titolare && io) {
    const { data, error } = await supabase
      .from("assenze")
      .select("id, tipo, dal, al, dalle, alle, note, stato, risposta, deciso_il")
      .eq("dipendente_id", io.id)
      .eq("attivo", true)
      .gte("al", piuGiorni(oggi, -60))
      .order("dal", { ascending: false })
      .limit(30);
    if (error) console.error("Lettura delle tue richieste non riuscita:", error.message);
    mie = (data ?? []) as MiaAssenza[];
  }

  const vai = (d: string) => `/timbrature?scheda=ferie&dal=${d}`;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
      <div className="flex min-w-0 flex-col gap-4">
        <section aria-label="Calendario delle assenze" className={riquadro}>
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-4">
            <h2 className="flex-1 font-semibold">
              Dal {dataIt(inizio)} al {dataIt(fine)}
            </h2>
            <Link href={vai(piuGiorni(inizio, -14))} aria-label="Due settimane prima" className={`${pulsanteSecondario} px-3`}>‹</Link>
            <Link href={vai(oggi)} className={pulsanteSecondario}>Oggi</Link>
            <Link href={vai(piuGiorni(inizio, 14))} aria-label="Due settimane dopo" className={`${pulsanteSecondario} px-3`}>›</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="sticky left-0 bg-white px-3 py-2 text-left font-semibold">Persona</th>
                  {giorni.map((g, i) => (
                    <th
                      key={g}
                      className={`px-1 py-2 text-center font-semibold ${g === oggi ? "bg-blue-50 text-blue-800" : i % 7 >= 5 ? "bg-slate-50" : ""}`}
                    >
                      {GIORNI_BREVI[i % 7]}
                      <br />
                      {g.slice(8, 10)}/{g.slice(5, 7)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {persone.length === 0 && (
                  <tr>
                    <td colSpan={15} className="p-4 text-sm text-slate-500">Nessun dipendente.</td>
                  </tr>
                )}
                {persone.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <th scope="row" className="sticky left-0 bg-white px-3 py-2 text-left text-sm font-semibold whitespace-nowrap">
                      {p.nome_completo}
                      {p.io && <span className="font-normal text-slate-500"> (tu)</span>}
                    </th>
                    {giorni.map((g, i) => {
                      const qui = assenze.filter((a) => a.dipendente_id === p.id && a.dal <= g && a.al >= g);
                      return (
                        <td
                          key={g}
                          className={`px-1 py-1.5 text-center ${g === oggi ? "bg-blue-50/60" : i % 7 >= 5 ? "bg-slate-50" : ""}`}
                        >
                          {qui.length === 0 ? (
                            <span className="text-slate-300">·</span>
                          ) : (
                            <span className="flex flex-col gap-0.5">
                              {qui.map((a) => (
                                <span
                                  key={a.id}
                                  title={`${NOMI[a.motivo] ?? a.motivo}${a.inAttesa ? " · richiesta in attesa" : ""}${a.note ? ` · ${a.note}` : ""}`}
                                  className={`inline-block min-w-12 rounded px-1 py-0.5 font-bold whitespace-nowrap ${
                                    a.inAttesa ? "border border-dashed border-amber-500 bg-white text-amber-900" : STILI[a.motivo] ?? STILI.assente
                                  }`}
                                >
                                  {casella(a, g)}
                                </span>
                              ))}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-slate-200 p-4 text-xs text-slate-600">
            {(titolare ? ["ferie", "permesso", "malattia"] : ["ferie", "permesso", "assente"]).map((m) => (
              <span key={m} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 rounded ${STILI[m]}`} />
                {NOMI[m]}
              </span>
            ))}
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-dashed border-amber-500 bg-white" />
              {titolare ? "Richiesta da decidere" : "Tua richiesta in attesa"}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded border border-blue-200 bg-blue-50" />
              Oggi
            </span>
          </div>
        </section>

        {/* Elenco delle assenze del periodo (il titolare le può togliere) */}
        <section aria-label="Assenze del periodo" className={riquadro}>
          <h2 className="border-b border-slate-200 p-4 font-semibold">Assenze in queste due settimane · {approvate.length}</h2>
          {approvate.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nessuna assenza.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {approvate.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                  <strong className="min-w-36">{nome(a.dipendente_id)}</strong>
                  <span className={`rounded px-2 py-0.5 text-xs font-bold ${STILI[a.motivo] ?? STILI.assente}`}>
                    {NOMI[a.motivo] ?? a.motivo}
                  </span>
                  <span>{periodoTesto(a)}</span>
                  {a.note && <span className="text-slate-500">{a.note}</span>}
                  {titolare && (
                    <form action={togliAssenza} className="ml-auto">
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="settimana" value={inizio} />
                      <button className={pulsanteSecondario}>Togli</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* colonna di destra; su telefono, per chi chiede, viene prima del calendario */}
      {titolare ? (
        <div className="flex flex-col gap-4">
          <RichiesteDaDecidere richieste={richieste} nome={nome} avvisi={avvisi} settimana={inizio} />
          <ModuloAssenza persone={persone.filter((p) => p.attivo)} oggi={oggi} settimana={inizio} />
        </div>
      ) : io ? (
        <div className="order-first flex flex-col gap-4 xl:order-none">
          <ModuloAssenza richiesta oggi={oggi} settimana={inizio} />
          <MieRichieste assenze={mie} settimana={inizio} />
        </div>
      ) : (
        <p className={`${riquadro} p-4 text-sm text-slate-600`}>
          Il tuo account non è collegato a un dipendente, quindi non puoi chiedere ferie o permessi. Chiedi al titolare di collegarlo.
        </p>
      )}
    </div>
  );
}
