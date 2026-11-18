// Scheda Articoli e listini: elenco a sinistra, articolo scelto (con prezzi per listino) a destra.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import ModuloArticolo from "./ModuloArticolo";
import { indirizzo, pulisciRicerca } from "./indirizzo";
import { riquadro } from "./stile";
import { ETICHETTE_TIPO_ARTICOLO, type Articolo, type Listino, type PrezzoListino } from "./tipi";

type Props = { q?: string; id?: string; archiviati: boolean; modificabile: boolean };

type RigaElenco = Pick<
  Articolo,
  "id" | "codice" | "descrizione" | "tipo" | "unita_misura" | "prezzo_base" | "aliquota_iva" | "attivo"
>;

export default async function SchedaArticoli({ q, id, archiviati, modificabile }: Props) {
  const supabase = await creaClientServer();
  const ricerca = pulisciRicerca(q);

  let query = supabase
    .from("articoli")
    .select("id, codice, descrizione, tipo, unita_misura, prezzo_base, aliquota_iva, attivo")
    .order("descrizione")
    .limit(500);
  if (!archiviati) query = query.eq("attivo", true);
  if (ricerca) {
    const r = `%${ricerca}%`;
    query = query.or(`descrizione.ilike.${r},codice.ilike.${r}`);
  }

  const nuovo = id === "nuovo";
  const conId = Boolean(id && !nuovo);
  const [risElenco, risScelto, risPrezzi, risListini] = await Promise.all([
    query,
    conId
      ? supabase
          .from("articoli")
          .select("id, codice, descrizione, tipo, unita_misura, prezzo_base, aliquota_iva, note, attivo, aggiornato_il")
          .eq("id", id!)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    conId
      ? supabase.from("prezzi_listino").select("listino_id, prezzo").eq("articolo_id", id!).eq("attivo", true)
      : Promise.resolve({ data: [] }),
    supabase.from("listini").select("id, nome, note, attivo").eq("attivo", true).order("nome"),
  ]);

  const elenco = (risElenco.data ?? []) as RigaElenco[];
  const scelto = (risScelto.data ?? null) as Articolo | null;
  const mostraModulo = nuovo ? modificabile : Boolean(scelto);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Elenco articoli" className={`${riquadro} min-w-0 flex-[3_1_520px] overflow-x-auto`}>
        {elenco.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {ricerca ? `Nessun articolo trovato per «${ricerca}».` : "Nessun articolo inserito."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Descrizione</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-right">Prezzo base</th>
                <th className="px-4 py-3 text-right">IVA</th>
              </tr>
            </thead>
            <tbody>
              {elenco.map((a) => {
                const selezionato = a.id === scelto?.id;
                return (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-100 ${selezionato ? "bg-blue-50" : "hover:bg-slate-50"} ${a.attivo ? "" : "text-slate-400"}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500">{a.codice}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={indirizzo({ scheda: "articoli", q: ricerca, id: a.id, archiviati: archiviati ? "1" : undefined })}
                        aria-current={selezionato ? "true" : undefined}
                        className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {a.descrizione}
                      </Link>
                      {!a.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                    </td>
                    <td className="px-4 py-3">{ETICHETTE_TIPO_ARTICOLO[a.tipo]}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {euro(a.prezzo_base)} <span className="text-slate-400">/ {a.unita_misura}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{Number(a.aliquota_iva)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {elenco.length === 500 && (
          <p className="p-4 text-xs text-slate-500">Mostrati i primi 500: usa la ricerca per restringere.</p>
        )}
      </section>

      <section
        aria-label="Scheda articolo"
        className={`${riquadro} min-w-0 flex-[2_1_340px] ${mostraModulo ? "order-first lg:order-none" : ""}`}
      >
        {mostraModulo ? (
          <ModuloArticolo
            key={scelto ? `${scelto.id}-${scelto.aggiornato_il}` : "nuovo"}
            articolo={scelto}
            listini={(risListini.data ?? []) as Listino[]}
            prezzi={(risPrezzi.data ?? []) as PrezzoListino[]}
            modificabile={modificabile}
          />
        ) : (
          <p className="p-6 text-sm text-slate-500">
            {conId ? "Articolo non trovato." : "Scegli un articolo dall'elenco per vedere la scheda e i prezzi per listino."}
          </p>
        )}
      </section>
    </div>
  );
}
