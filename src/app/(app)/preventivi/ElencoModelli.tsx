// Elenco dei modelli di lavorazione. Costo e prezzo sono INDICATIVI e calcolati con le tariffe
// e il catalogo di OGGI: è quello che succede quando il modello viene usato in un preventivo.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { riquadro } from "../anagrafiche/stile";
import { aggiornaCosti, bozzaFasi, calcolaFasi } from "./bozze";
import { inEuro, perCampo, totali } from "./calcoli";
import { indirizzo, ore } from "./comuni";
import { leggiFasi, leggiTariffeArticoli } from "./letture";
import type { ModelloSalvato } from "./tipi";

export default async function ElencoModelli({ archiviati }: { archiviati: boolean }) {
  const supabase = await creaClientServer();
  let query = supabase
    .from("modelli_lavorazione")
    .select("id, nome, descrizione, ricarico_percentuale, note, attivo, aggiornato_il")
    .order("nome");
  if (!archiviati) query = query.eq("attivo", true);
  const [{ data, error }, scelte] = await Promise.all([query, leggiTariffeArticoli(supabase)]);
  const modelli = (data ?? []) as ModelloSalvato[];
  const fasi = modelli.length ? await leggiFasi(supabase, { modelli: modelli.map((m) => m.id) }) : [];

  if (error || fasi === null || scelte === null) {
    return <p role="alert" className={`${riquadro} p-6 text-sm text-red-800`}>Impossibile leggere i modelli. Riprova tra poco.</p>;
  }

  const righe = modelli.map((m) => {
    const sue = fasi.filter((f) => f.modello_id === m.id);
    const { totale } = calcolaFasi(aggiornaCosti(bozzaFasi(sue), scelte.tariffe, scelte.articoli));
    const t = totali(totale, perCampo(m.ricarico_percentuale, 0, 2), "", 0);
    return { ...m, fasi: sue.length, ore: t.ore, costo: t.costo, prezzo: t.prezzoCalcolato };
  });

  return (
    <section aria-label="Elenco modelli" className={`${riquadro} min-w-0 overflow-x-auto`}>
      {righe.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          Nessun modello. Crealo con «+ Nuovo modello», oppure da un preventivo già fatto con «Salva come modello».
        </p>
      ) : (
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th className="px-4 py-3">Modello</th>
              <th className="px-4 py-3 text-right">Fasi</th>
              <th className="px-4 py-3 text-right">Ore</th>
              <th className="px-4 py-3 text-right">Costo oggi</th>
              <th className="px-4 py-3 text-right">Prezzo indicativo</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((m) => (
              <tr key={m.id} className={`border-b border-slate-100 hover:bg-slate-50 ${m.attivo ? "" : "text-slate-400"}`}>
                <td className="px-4 py-3">
                  <Link href={indirizzo({ scheda: "modelli", id: m.id })} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                    {m.nome}
                  </Link>
                  {!m.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                  {m.descrizione && <span className="block text-xs text-slate-500">{m.descrizione}</span>}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{m.fasi}</td>
                <td className="px-4 py-3 text-right tabular-nums">{ore(m.ore)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{euro(inEuro(m.costo))}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                  {euro(inEuro(m.prezzo))}
                  <span className="block text-xs text-slate-500">ricarico {perCampo(m.ricarico_percentuale, 0, 2)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
