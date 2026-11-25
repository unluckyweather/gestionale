// Programma del giorno da stampare o salvare in PDF (foglio A4, senza menu dell'app).
// Per macchina (predefinito) o per persona (?vista=persona). Senza prezzi: lo vedono tutti.
import type { Metadata } from "next";
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, ora } from "@/lib/produzione";
import { giornoSettimana, hhmm, periodoNelGiorno } from "@/lib/programma";
import { avvisi, leggiProgramma, type Assegnazione } from "../../../(app)/produzione/programmaDati";
import BarraStampa from "../../preventivi/[id]/BarraStampa";

type Props = { params: Promise<{ giorno: string }>; searchParams: Promise<{ vista?: string }> };

const NOMI_GIORNO = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { giorno } = await params;
  return { title: `Programma ${dataIt(giorno).replaceAll("/", "-")}` };
}

export default async function StampaProgramma({ params, searchParams }: Props) {
  await richiediSezione("/produzione");
  const { giorno } = await params;
  const { vista } = await searchParams;
  const ritorno = `/produzione?scheda=programma&giorno=${giorno}${vista === "persona" ? "&vista=persona" : ""}`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) {
    return (
      <main className="mx-auto max-w-xl p-8 text-sm text-slate-700">
        <p>Giorno non valido.</p>
        <Link href="/produzione?scheda=programma" className="text-blue-700 hover:underline">← Torna al programma</Link>
      </main>
    );
  }

  const supabase = await creaClientServer();
  const d = await leggiProgramma(supabase, giorno);
  const perPersona = vista === "persona";

  const gruppi: { nome: string; righe: Assegnazione[] }[] = perPersona
    ? [
        ...d.persone.map((p) => ({ nome: p.nome_completo, righe: d.assegnazioni.filter((a) => a.dipendente_id === p.id) })),
        { nome: "Da assegnare", righe: d.assegnazioni.filter((a) => !a.dipendente_id) },
      ]
    : [
        ...d.macchine.map((m) => ({ nome: m.nome, righe: d.assegnazioni.filter((a) => a.macchina_id === m.id) })),
        { nome: "Altro", righe: d.assegnazioni.filter((a) => !a.macchina_id || !d.macchine.some((m) => m.id === a.macchina_id)) },
      ];
  const pieni = gruppi.filter((g) => g.righe.length > 0);
  const nome = (id: string) => d.persone.find((p) => p.id === id)?.nome_completo ?? "";
  const quando = (x: { dal: string; al: string; dalle: string | null; alle: string | null }) => {
    const i = periodoNelGiorno(x, giorno);
    if (!i || (i.da === 0 && i.a === 1440)) return "tutto il giorno";
    if (i.da === 0) return `fino alle ${hhmm(i.a)}`;
    if (i.a === 1440) return `dalle ${hhmm(i.da)}`;
    return `${hhmm(i.da)}–${hhmm(i.a)}`;
  };

  return (
    <div className="min-h-screen bg-slate-200 py-6 print:min-h-0 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 12mm; } @media print { body { background: white; } * { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <BarraStampa ritorno={ritorno} etichetta="← Torna al programma" />
      <article className="mx-auto flex max-w-[210mm] flex-col gap-5 bg-white p-[12mm] text-[10pt] leading-snug text-slate-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-end justify-between gap-4 border-b border-slate-300 pb-3">
          <div>
            <h1 className="text-[16pt] font-bold">Programma di {NOMI_GIORNO[giornoSettimana(giorno)]} {dataIt(giorno)}</h1>
            <p className="text-slate-600">{perPersona ? "Per persona" : "Per macchina"} · {d.assegnazioni.length} lavori</p>
          </div>
          <p className="text-[8.5pt] text-slate-500">Stampato il {dataIt(new Date().toISOString())}</p>
        </header>

        {(d.assenze.length > 0 || d.fermi.length > 0) && (
          <section className="flex flex-wrap gap-x-6 gap-y-1">
            {d.assenze.map((a) => (
              <span key={a.id}><strong>{nome(a.dipendente_id)}</strong>: {a.motivo} {quando(a)}</span>
            ))}
            {d.fermi.map((f) => (
              <span key={f.id}><strong>{d.macchine.find((m) => m.id === f.macchina_id)?.nome}</strong>: ferma ({f.motivo.toLowerCase()}) {quando(f)}</span>
            ))}
          </section>
        )}

        {pieni.length === 0 && <p className="text-slate-600">Nessun lavoro nel programma.</p>}
        {pieni.map((g) => (
          <section key={g.nome} className="break-inside-avoid">
            <h2 className="mb-1 border-b border-slate-400 text-[11.5pt] font-bold">{g.nome}</h2>
            <table className="w-full border-collapse">
              <tbody>
                {g.righe.map((a) => {
                  const problemi = avvisi(a);
                  return (
                    <tr key={a.id} className="border-b border-slate-200 align-top">
                      <td className="w-[24mm] py-1 pr-2 font-semibold whitespace-nowrap tabular-nums">{ora(a.dalle)}–{ora(a.alle)}</td>
                      <td className="py-1 pr-2">
                        <strong>{a.commessa_numero ? `${a.commessa_numero} · ` : ""}{a.titolo}</strong>
                        {a.urgente && <span className="ml-1 font-bold text-red-700">URGENTE</span>}
                        {a.cliente && <span className="text-slate-600"> · {a.cliente}</span>}
                        {a.descrizione && <div className="text-[9pt] text-slate-600">{a.descrizione}</div>}
                        {a.luogo_posa && <div className="text-[9pt]">Posa: {a.luogo_posa}</div>}
                        {a.note && <div className="text-[9pt] text-slate-600">Note: {a.note}</div>}
                        {problemi.length > 0 && <div className="text-[9pt] font-semibold text-orange-800">Da controllare: {problemi.join(", ")}</div>}
                      </td>
                      <td className="w-[38mm] py-1 text-right">{perPersona ? a.macchina ?? "" : a.persona ?? "da assegnare"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
      </article>
    </div>
  );
}
