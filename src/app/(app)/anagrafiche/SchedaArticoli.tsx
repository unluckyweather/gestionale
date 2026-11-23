// Scheda Articoli (catalogo materiali con costo): elenco a sinistra, articolo scelto a destra.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import Giacenza from "@/components/Giacenza";
import ModuloArticolo from "./ModuloArticolo";
import { indirizzo, pulisciRicerca, SENZA_CATEGORIA } from "./indirizzo";
import { riquadro } from "./stile";
import type { Articolo, Categoria, CodiceIva, Giacenza as RigaGiacenza } from "./tipi";

type Props = {
  q?: string;
  id?: string;
  archiviati: boolean;
  categoria?: string; // id della categoria merceologica, oppure "nessuna"
  categorie: Categoria[]; // tutte (anche archiviate), per la tendina della scheda
  modificabile: boolean;
};

type RigaElenco = Pick<
  Articolo,
  "id" | "codice" | "descrizione" | "unita_misura" | "costo_unitario" | "larghezza_bobina_m" | "lastra_larghezza_cm" | "lastra_altezza_cm" | "attivo"
> & {
  iva: { codice: string } | null;
  fornitore: { denominazione: string } | null;
  categoria: { descrizione: string } | null;
};

export default async function SchedaArticoli({ q, id, archiviati, categoria, categorie, modificabile }: Props) {
  const supabase = await creaClientServer();
  const ricerca = pulisciRicerca(q);

  let query = supabase
    .from("articoli")
    .select(
      "id, codice, descrizione, unita_misura, costo_unitario, larghezza_bobina_m, lastra_larghezza_cm, lastra_altezza_cm, attivo, iva:codici_iva(codice), fornitore:soggetti(denominazione), categoria:categorie_merceologiche(descrizione)"
    )
    .order("descrizione")
    .limit(500);
  if (!archiviati) query = query.eq("attivo", true);
  if (categoria === SENZA_CATEGORIA) query = query.is("categoria_id", null);
  else if (categoria) query = query.eq("categoria_id", categoria);
  if (ricerca) {
    const r = `%${ricerca}%`;
    query = query.or(`descrizione.ilike.${r},codice.ilike.${r}`);
  }

  const nuovo = id === "nuovo";
  const conId = Boolean(id && !nuovo);
  const [risElenco, risScelto, risIva, risFornitori, risGiacenze] = await Promise.all([
    query,
    conId
      ? supabase
          .from("articoli")
          .select(
            "id, codice, descrizione, tipo, unita_misura, costo_unitario, larghezza_bobina_m, bobina_lunghezza_m, lastra_larghezza_cm, lastra_altezza_cm, codice_iva_id, fornitore_id, categoria_id, scorta_minima, note, attivo, aggiornato_il"
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
    // giacenze (somma dei movimenti), calcolate dal database
    supabase.from("magazzino").select("articolo_id, unita, giacenza, in_arrivo, sotto_scorta").limit(5000),
  ]);
  const giacenze = new Map(((risGiacenze.data ?? []) as RigaGiacenza[]).map((g) => [g.articolo_id, g]));

  const elenco = (risElenco.data ?? []) as unknown as RigaElenco[];
  const scelto = (risScelto.data ?? null) as Articolo | null;
  const mostraModulo = nuovo ? modificabile : Boolean(scelto);

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label="Elenco articoli" className={`${riquadro} min-w-0 flex-[3_1_520px] overflow-x-auto`}>
        {elenco.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {ricerca
              ? `Nessun articolo trovato per «${ricerca}»${categoria ? " con questo filtro" : ""}.`
              : categoria === SENZA_CATEGORIA
                ? "Tutti gli articoli hanno una categoria."
                : categoria
                  ? "Nessun articolo con questa categoria."
                : "Nessun articolo inserito."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Descrizione</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3">Fornitore</th>
                <th className="px-4 py-3 text-right">Giacenza</th>
                <th className="px-4 py-3 text-right">Costo</th>
              </tr>
            </thead>
            <tbody>
              {elenco.map((a) => {
                const selezionato = a.id === scelto?.id;
                const g = giacenze.get(a.id);
                return (
                  <tr
                    key={a.id}
                    className={`border-b border-slate-100 ${selezionato ? "bg-blue-50" : "hover:bg-slate-50"} ${a.attivo ? "" : "text-slate-400"}`}
                  >
                    <td className="min-w-44 px-4 py-3">
                      <Link
                        href={indirizzo({ scheda: "articoli", q: ricerca, categoria, id: a.id, archiviati: archiviati ? "1" : undefined })}
                        aria-current={selezionato ? "true" : undefined}
                        className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {a.descrizione}
                      </Link>
                      {a.larghezza_bobina_m && (
                        <span className="ml-2 text-xs text-slate-500">bobina {Number(a.larghezza_bobina_m).toLocaleString("it-IT")} m</span>
                      )}
                      {a.lastra_larghezza_cm && (
                        <span className="ml-2 text-xs text-slate-500">
                          lastra {Number(a.lastra_larghezza_cm).toLocaleString("it-IT")}×{Number(a.lastra_altezza_cm).toLocaleString("it-IT")} cm
                        </span>
                      )}
                      {!a.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                      {a.codice && <div className="text-xs text-slate-500">{a.codice}</div>}
                    </td>
                    <td className="px-4 py-3">{a.categoria?.descrizione}</td>
                    <td className="px-4 py-3">{a.fornitore?.denominazione}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {g && <Giacenza giacenza={g.giacenza} unita={g.unita} sottoScorta={g.sotto_scorta} />}
                      {g && Number(g.in_arrivo) > 0 && (
                        <div className="text-xs text-slate-500">+{Number(g.in_arrivo).toLocaleString("it-IT")} in arrivo</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {euro(a.costo_unitario)} <span className="text-slate-400">/ {a.unita_misura}</span>
                      {a.iva && a.iva.codice !== "22" && <div className="text-xs text-slate-500">IVA {a.iva.codice}</div>}
                    </td>
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
            giacenza={scelto ? (giacenze.get(scelto.id) ?? null) : null}
            codiciIva={(risIva.data ?? []) as CodiceIva[]}
            fornitori={(risFornitori.data ?? []) as { id: string; denominazione: string; attivo: boolean }[]}
            categorie={categorie}
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
