// Scheda Clienti o Fornitori: elenco a sinistra, scheda del soggetto scelto a destra.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import ModuloSoggetto from "./ModuloSoggetto";
import { indirizzo, pulisciRicerca } from "./indirizzo";
import { riquadro } from "./stile";
import type { CondizionePagamento, Listino, Soggetto } from "./tipi";

type Props = {
  scheda: "clienti" | "fornitori";
  q?: string;
  id?: string;
  archiviati: boolean;
  modificabile: boolean;
};

type RigaElenco = Pick<
  Soggetto,
  "id" | "tipo" | "ragione_sociale" | "partita_iva" | "citta" | "provincia" | "referente" | "telefono" | "attivo"
>;

export default async function SchedaSoggetti({ scheda, q, id, archiviati, modificabile }: Props) {
  const supabase = await creaClientServer();
  const tipi = scheda === "clienti" ? ["cliente", "entrambi"] : ["fornitore", "entrambi"];
  const ricerca = pulisciRicerca(q);

  let query = supabase
    .from("soggetti")
    .select("id, tipo, ragione_sociale, partita_iva, citta, provincia, referente, telefono, attivo")
    .in("tipo", tipi)
    .order("ragione_sociale")
    .limit(500);
  if (!archiviati) query = query.eq("attivo", true);
  if (ricerca) {
    const r = `%${ricerca}%`;
    query = query.or(`ragione_sociale.ilike.${r},partita_iva.ilike.${r},citta.ilike.${r},referente.ilike.${r}`);
  }

  const nuovo = id === "nuovo";
  const [risElenco, risScelto, risCondizioni, risListini] = await Promise.all([
    query,
    id && !nuovo
      ? supabase
          .from("soggetti")
          .select(
            "id, tipo, ragione_sociale, partita_iva, codice_fiscale, codice_sdi, pec, indirizzo, cap, citta, provincia, email, telefono, referente, condizione_pagamento_id, listino_id, note, attivo, aggiornato_il"
          )
          .eq("id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("condizioni_pagamento").select("id, descrizione, giorni, attivo").order("giorni").order("descrizione"),
    supabase.from("listini").select("id, nome, note, attivo").order("nome"),
  ]);

  const elenco = (risElenco.data ?? []) as RigaElenco[];
  const scelto = (risScelto.data ?? null) as Soggetto | null;
  const mostraModulo = nuovo ? modificabile : Boolean(scelto);
  const parola = scheda === "clienti" ? "cliente" : "fornitore";

  return (
    <div className="flex flex-wrap items-start gap-6">
      <section aria-label={`Elenco ${scheda}`} className={`${riquadro} min-w-0 flex-[3_1_520px] overflow-x-auto`}>
        {elenco.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {ricerca ? `Nessun ${parola} trovato per «${ricerca}».` : `Nessun ${parola} inserito.`}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Ragione sociale</th>
                <th className="px-4 py-3">P.IVA</th>
                <th className="px-4 py-3">Città</th>
                <th className="px-4 py-3">Referente</th>
                <th className="px-4 py-3">Telefono</th>
              </tr>
            </thead>
            <tbody>
              {elenco.map((s) => {
                const selezionato = s.id === scelto?.id;
                return (
                  <tr
                    key={s.id}
                    className={`border-b border-slate-100 ${selezionato ? "bg-blue-50" : "hover:bg-slate-50"} ${s.attivo ? "" : "text-slate-400"}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={indirizzo({ scheda, q: ricerca, id: s.id, archiviati: archiviati ? "1" : undefined })}
                        aria-current={selezionato ? "true" : undefined}
                        className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {s.ragione_sociale}
                      </Link>
                      {s.tipo === "entrambi" && (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                          {scheda === "clienti" ? "anche fornitore" : "anche cliente"}
                        </span>
                      )}
                      {!s.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{s.partita_iva}</td>
                    <td className="px-4 py-3">{s.citta}{s.provincia ? ` (${s.provincia})` : ""}</td>
                    <td className="px-4 py-3">{s.referente}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{s.telefono}</td>
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
        aria-label={`Scheda ${parola}`}
        className={`${riquadro} min-w-0 flex-[2_1_340px] ${mostraModulo ? "order-first lg:order-none" : ""}`}
      >
        {mostraModulo ? (
          <ModuloSoggetto
            key={scelto ? `${scelto.id}-${scelto.aggiornato_il}` : "nuovo"}
            soggetto={scelto}
            scheda={scheda}
            condizioni={(risCondizioni.data ?? []) as CondizionePagamento[]}
            listini={(risListini.data ?? []) as Listino[]}
            modificabile={modificabile}
          />
        ) : (
          <p className="p-6 text-sm text-slate-500">
            {id && !nuovo ? `${parola[0].toUpperCase()}${parola.slice(1)} non trovato.` : `Scegli un ${parola} dall'elenco per vedere la scheda.`}
          </p>
        )}
      </section>
    </div>
  );
}
