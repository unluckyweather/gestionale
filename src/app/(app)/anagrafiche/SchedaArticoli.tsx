// Scheda Articoli (catalogo materiali con costo): elenco a sinistra, articolo scelto a destra.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import ModuloArticolo from "./ModuloArticolo";
import { indirizzo, pulisciRicerca } from "./indirizzo";
import { riquadro } from "./stile";
import { ETICHETTE_TIPO_ARTICOLO, type Articolo, type CodiceIva } from "./tipi";

type Props = { q?: string; id?: string; archiviati: boolean; modificabile: boolean };

type RigaElenco = Pick<
  Articolo,
  "id" | "codice" | "descrizione" | "tipo" | "unita_misura" | "costo_unitario" | "larghezza_bobina_m" | "attivo"
> & {
  iva: { codice: string } | null;
  fornitore: { denominazione: string } | null;
};

export default async function SchedaArticoli({ q, id, archiviati, modificabile }: Props) {
  const supabase = await creaClientServer();
  const ricerca = pulisciRicerca(q);

  let query = supabase
    .from("articoli")
    .select(
      "id, codice, descrizione, tipo, unita_misura, costo_unitario, larghezza_bobina_m, attivo, iva:codici_iva(codice), fornitore:soggetti(denominazione)"
    )
    .order("descrizione")
    .limit(500);
  if (!archiviati) query = query.eq("attivo", true);
  if (ricerca) {
    const r = `%${ricerca}%`;
    query = query.or(`descrizione.ilike.${r},codice.ilike.${r}`);
  }

  const nuovo = id === "nuovo";
  const conId = Boolean(id && !nuovo);
  const [risElenco, risScelto, risIva, risFornitori] = await Promise.all([
    query,
    conId
      ? supabase
          .from("articoli")
          .select(
            "id, codice, descrizione, tipo, unita_misura, costo_unitario, larghezza_bobina_m, codice_iva_id, fornitore_id, note, attivo, aggiornato_il"
          )
          .eq("id", id!)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("codici_iva")
      .select("id, codice, descrizione, aliquota, natura, attivo")
      .order("aliquota", { ascending: false })
      .order("codice"),
    supabase
      .from("soggetti")
      .select("id, denominazione, attivo")
      .in("tipo", ["fornitore", "entrambi"])
      .order("denominazione")
      .limit(2000),
  ]);

  const elenco = (risElenco.data ?? []) as unknown as RigaElenco[];
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
                <th className="px-4 py-3">Fornitore</th>
                <th className="px-4 py-3 text-right">Costo</th>
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
                      {a.tipo !== "articolo" && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{ETICHETTE_TIPO_ARTICOLO[a.tipo]}</span>
                      )}
                      {a.larghezza_bobina_m && (
                        <span className="ml-2 text-xs text-slate-500">bobina {Number(a.larghezza_bobina_m).toLocaleString("it-IT")} m</span>
                      )}
                      {!a.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                    </td>
                    <td className="px-4 py-3">{a.fornitore?.denominazione}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {euro(a.costo_unitario)} <span className="text-slate-400">/ {a.unita_misura}</span>
                    </td>
                    <td className="px-4 py-3 text-right">{a.iva?.codice}</td>
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

      {/* su telefono la scheda scelta compare sopra l'elenco */}
      <section
        aria-label="Scheda articolo"
        className={`${riquadro} min-w-0 flex-[2_1_340px] ${mostraModulo ? "order-first lg:order-none" : ""}`}
      >
        {mostraModulo ? (
          <ModuloArticolo
            key={scelto ? `${scelto.id}-${scelto.aggiornato_il}` : "nuovo"}
            articolo={scelto}
            codiciIva={(risIva.data ?? []) as CodiceIva[]}
            fornitori={(risFornitori.data ?? []) as { id: string; denominazione: string; attivo: boolean }[]}
            modificabile={modificabile}
          />
        ) : (
          <p className="p-6 text-sm text-slate-500">
            {conId ? "Articolo non trovato." : "Scegli un articolo dall'elenco per vedere la scheda."}
          </p>
        )}
      </section>
    </div>
  );
}
