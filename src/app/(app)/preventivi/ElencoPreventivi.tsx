// Elenco dei preventivi: numero, cliente e oggetto, data, importo (IVA esclusa), stato.
// Gli importi li calcola il database (vista preventivi_riepilogo): mai calcolati qui.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { riquadro } from "../anagrafiche/stile";
import { EtichettaStato, STATI, dataItaliana, indirizzo, type Stato } from "./comuni";

export const LIMITE = 500;

type Client = Awaited<ReturnType<typeof creaClientServer>>;

type Riga = {
  id: string;
  numero: string;
  oggetto: string;
  data: string;
  stato: Stato;
  attivo: boolean;
  cliente: { denominazione: string } | null;
};

/**
 * Filtro di ricerca per numero ("23/26"), oggetto o cliente (nome o nome breve),
 * nel formato di .or(...). null = nessuna ricerca; "" = ricerca senza risultati possibili.
 */
export async function filtroRicerca(supabase: Client, ricerca: string): Promise<string | null> {
  if (!ricerca) return null;
  const r = `%${ricerca}%`;
  const { data: clienti } = await supabase
    .from("soggetti")
    .select("id")
    .or(`denominazione.ilike.${r},nome_breve.ilike.${r}`)
    .limit(200);
  const ids = (clienti ?? []).map((c) => c.id as string);
  const condizioni = [`numero.ilike.${r}`, `oggetto.ilike.${r}`];
  if (ids.length) condizioni.push(`soggetto_id.in.(${ids.join(",")})`);
  return condizioni.join(",");
}

type Props = {
  supabase: Client;
  filtro: string | null;
  stato: Stato | null;
  archiviati: boolean;
  ricerca: string;
  selezionato?: string;
  parametri: Record<string, string | undefined>; // stato, q, archiviati: restano negli indirizzi delle righe
};

export default async function ElencoPreventivi({ supabase, filtro, stato, archiviati, ricerca, selezionato, parametri }: Props) {
  let query = supabase
    .from("preventivi")
    .select("id, numero, oggetto, data, stato, attivo, cliente:soggetti(denominazione)")
    .order("anno", { ascending: false })
    .order("progressivo", { ascending: false })
    .limit(LIMITE);
  if (!archiviati) query = query.eq("attivo", true);
  if (stato) query = query.eq("stato", stato);
  if (filtro) query = query.or(filtro);

  const { data, error } = await query;
  const elenco = (data ?? []) as unknown as Riga[];

  // Importi dalla vista dei totali, a gruppi di 100 (l'elenco di id va nell'indirizzo della richiesta).
  const prezzi = new Map<string, number>();
  const gruppi: string[][] = [];
  for (let i = 0; i < elenco.length; i += 100) gruppi.push(elenco.slice(i, i + 100).map((p) => p.id));
  const risposte = await Promise.all(
    gruppi.map((ids) => supabase.from("preventivi_riepilogo").select("preventivo_id, prezzo").in("preventivo_id", ids))
  );
  for (const r of risposte) for (const t of r.data ?? []) prezzi.set(t.preventivo_id as string, Number(t.prezzo));

  return (
    <section aria-label="Elenco preventivi" className={`${riquadro} min-w-0 flex-[3_1_520px] overflow-x-auto`}>
      {error ? (
        <p role="alert" className="p-6 text-sm text-red-800">
          Impossibile leggere i preventivi. Se il problema resta, controlla che la migrazione 0003 sia applicata.
        </p>
      ) : elenco.length === 0 ? (
        <p className="p-6 text-sm text-slate-500">
          Nessun preventivo
          {stato && ` nello stato «${STATI.find((s) => s.valore === stato)?.etichetta.toLowerCase()}»`}
          {ricerca && ` per «${ricerca}»`}.
        </p>
      ) : (
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th className="px-4 py-3">Numero</th>
              <th className="px-4 py-3">Cliente · oggetto</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3 text-right">Importo</th>
              <th className="px-4 py-3">Stato</th>
            </tr>
          </thead>
          <tbody>
            {elenco.map((p) => {
              const scelto = p.id === selezionato;
              const link = indirizzo({ ...parametri, sel: p.id });
              return (
                <tr
                  key={p.id}
                  className={`border-b border-slate-100 ${scelto ? "bg-blue-50" : "hover:bg-slate-50"} ${p.attivo ? "" : "text-slate-400"}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={link}
                      aria-current={scelto ? "true" : undefined}
                      className={`hover:text-blue-700 hover:underline ${scelto ? "font-bold" : "font-medium"}`}
                    >
                      {p.numero}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={link} className="block hover:text-blue-700">
                      <span className="font-medium">{p.cliente?.denominazione ?? "—"}</span>
                      <span className="block text-xs text-slate-500">
                        {p.oggetto}
                        {!p.attivo && " (archiviato)"}
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{dataItaliana(p.data)}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {prezzi.has(p.id) ? euro(prezzi.get(p.id)) : ""}
                  </td>
                  <td className="px-4 py-3">
                    <EtichettaStato stato={p.stato} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {elenco.length === LIMITE && (
        <p className="p-4 text-xs text-slate-500">Mostrati i {LIMITE} più recenti: usa la ricerca per restringere.</p>
      )}
    </section>
  );
}
