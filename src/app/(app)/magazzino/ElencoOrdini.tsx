// Magazzino → Ordini d'acquisto: elenco con ricerca (numero o fornitore) e filtro per stato.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { STATI_ORDINE, eStatoOrdine, type StatoOrdine } from "@/lib/magazzino";
import { pulisciRicerca } from "../anagrafiche/indirizzo";
import { campo, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { EtichettaStatoOrdine, Messaggi, Schede, Titolo, dataItaliana, indirizzo } from "./comuni";

type Parametri = { q?: string; stato?: string; archiviati?: string; ok?: string; errore?: string };

type RigaOrdine = {
  id: string;
  numero: string;
  data: string;
  consegna_prevista: string | null;
  stato: StatoOrdine;
  attivo: boolean;
  fornitore: { denominazione: string } | null;
};

export default async function ElencoOrdini({ p, modificabile }: { p: Parametri; modificabile: boolean }) {
  const ricerca = pulisciRicerca(p.q);
  const stato = eStatoOrdine(p.stato) ? p.stato : undefined;
  const archiviati = p.archiviati === "1";
  const filtri = { scheda: "ordini", q: ricerca || undefined, archiviati: archiviati ? "1" : undefined };

  const supabase = await creaClientServer();

  // ricerca: numero dell'ordine (es. "3/26") oppure nome del fornitore
  let filtro: string | undefined;
  if (ricerca) {
    const { data: fornitori } = await supabase
      .from("soggetti")
      .select("id")
      .in("tipo", ["fornitore", "entrambi"])
      .or(`denominazione.ilike.%${ricerca}%,nome_breve.ilike.%${ricerca}%`)
      .limit(200);
    const ids = (fornitori ?? []).map((f) => f.id as string);
    filtro = `numero.ilike.%${ricerca}%` + (ids.length ? `,soggetto_id.in.(${ids.join(",")})` : "");
  }

  const conta = (s?: StatoOrdine) => {
    let q = supabase.from("ordini_acquisto").select("id", { count: "exact", head: true });
    if (!archiviati) q = q.eq("attivo", true);
    if (s) q = q.eq("stato", s);
    if (filtro) q = q.or(filtro);
    return q;
  };

  let query = supabase
    .from("ordini_acquisto")
    .select("id, numero, data, consegna_prevista, stato, attivo, fornitore:soggetti(denominazione)")
    .order("anno", { ascending: false })
    .order("progressivo", { ascending: false })
    .limit(300);
  if (!archiviati) query = query.eq("attivo", true);
  if (stato) query = query.eq("stato", stato);
  if (filtro) query = query.or(filtro);

  const [risElenco, ...conteggi] = await Promise.all([query, conta(), ...STATI_ORDINE.map((s) => conta(s.valore))]);
  const elenco = (risElenco.data ?? []) as unknown as RigaOrdine[];

  const ids = elenco.map((o) => o.id);
  const { data: totali } = ids.length
    ? await supabase.from("ordini_acquisto_riepilogo").select("ordine_id, imponibile").in("ordine_id", ids)
    : { data: [] };
  const tot = new Map((totali ?? []).map((t) => [t.ordine_id as string, t as { imponibile: number }]));

  const filtriStato = [
    { valore: undefined, etichetta: "Tutti", numero: conteggi[0].count },
    ...STATI_ORDINE.map((s, i) => ({ valore: s.valore, etichetta: s.etichetta, numero: conteggi[i + 1].count })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <Titolo />
        <form action="/magazzino" role="search" className="flex gap-2">
          <input type="hidden" name="scheda" value="ordini" />
          {stato && <input type="hidden" name="stato" value={stato} />}
          {archiviati && <input type="hidden" name="archiviati" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={ricerca}
            aria-label="Cerca ordini"
            placeholder="Numero o fornitore"
            className={`${campo} w-64 max-w-full`}
          />
          <button className={pulsanteSecondario}>Cerca</button>
        </form>
        {modificabile && (
          <Link href={indirizzo({ scheda: "ordini", id: "nuovo" })} className={`${pulsante} inline-flex items-center`}>
            + Nuovo ordine
          </Link>
        )}
      </header>

      <Messaggi ok={p.ok} errore={p.errore} />
      <Schede attiva="ordini" ordini />

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {filtriStato.map((f) => {
          const attivo = f.valore === stato;
          return (
            <Link
              key={f.etichetta}
              href={indirizzo({ ...filtri, stato: f.valore })}
              aria-current={attivo ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold ${
                attivo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.etichetta}
              {typeof f.numero === "number" && <span className="font-normal">· {f.numero}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {ricerca && (
          <Link href={indirizzo({ scheda: "ordini", stato, archiviati: filtri.archiviati })} className="text-blue-700 hover:underline">
            × Togli la ricerca «{ricerca}»
          </Link>
        )}
        <Link
          href={indirizzo({ scheda: "ordini", stato, q: filtri.q, archiviati: archiviati ? undefined : "1" })}
          className="text-slate-500 hover:text-slate-800 hover:underline"
        >
          {archiviati ? "Nascondi gli archiviati" : "Mostra anche gli archiviati"}
        </Link>
      </div>

      <section aria-label="Elenco ordini" className={`${riquadro} overflow-x-auto`}>
        {elenco.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            {ricerca
              ? `Nessun ordine trovato per «${ricerca}».`
              : stato
                ? "Nessun ordine in questo stato."
                : "Nessun ordine d'acquisto. Si crea con «+ Nuovo ordine» oppure con «Ordina» dalla scheda di un articolo."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Numero</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Fornitore</th>
                <th className="px-4 py-3">Stato</th>
                <th className="px-4 py-3">Consegna prevista</th>
                <th className="px-4 py-3 text-right">Imponibile</th>
              </tr>
            </thead>
            <tbody>
              {elenco.map((o) => {
                const t = tot.get(o.id);
                const inRitardo =
                  o.consegna_prevista &&
                  (o.stato === "inviato" || o.stato === "ricevuto_parziale") &&
                  o.consegna_prevista < new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
                return (
                  <tr key={o.id} className={`border-b border-slate-100 hover:bg-slate-50 ${o.attivo ? "" : "text-slate-400"}`}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={indirizzo({ scheda: "ordini", id: o.id })}
                        className="font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                      >
                        {o.numero}
                      </Link>
                      {!o.attivo && <span className="ml-2 text-xs">(archiviato)</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{dataItaliana(o.data)}</td>
                    <td className="px-4 py-3">{o.fornitore?.denominazione}</td>
                    <td className="px-4 py-3"><EtichettaStatoOrdine stato={o.stato} /></td>
                    <td className={`px-4 py-3 whitespace-nowrap ${inRitardo ? "font-semibold text-red-700" : ""}`}>
                      {dataItaliana(o.consegna_prevista)}
                      {inRitardo && <span className="ml-1 text-xs">(in ritardo)</span>}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">{t ? euro(t.imponibile) : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
