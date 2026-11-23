// Magazzino: giacenza di ogni articolo (somma dei movimenti) e movimenti.
// La vedono tutti gli utenti attivi; i costi qui non compaiono mai (vista "magazzino").
//   carico e scarico → tutti (anche gli operai, dal telefono)
//   inventario e annullamento di un movimento → titolare e ufficio
// Indirizzo: /magazzino?q=…&avvisi=1&id=<articolo>
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import Giacenza from "@/components/Giacenza";
import { quantita, quantitaConUnita, TIPI_MOVIMENTO, type TipoMovimento } from "@/lib/magazzino";
import { pulisciRicerca } from "../anagrafiche/indirizzo";
import { campo, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import ModuloMovimento from "./ModuloMovimento";
import PulsanteAnnulla from "./PulsanteAnnulla";

type Parametri = { q?: string; id?: string; avvisi?: string; ok?: string; errore?: string };

type RigaMagazzino = {
  articolo_id: string;
  codice: string | null;
  descrizione: string;
  categoria: string | null;
  unita: string;
  giacenza: number;
  in_arrivo: number;
  scorta_minima: number | null;
  sotto_scorta: boolean;
  ultimo_movimento: string | null;
  attivo: boolean;
};

type Movimento = {
  id: string;
  data: string;
  tipo: TipoMovimento;
  quantita: number;
  note: string | null;
  attivo: boolean;
  autore: { nome_visualizzato: string } | null;
  riga: { ordine: { numero: string } | null } | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNE = "articolo_id, codice, descrizione, categoria, unita, giacenza, in_arrivo, scorta_minima, sotto_scorta, ultimo_movimento, attivo";

function indirizzo(p: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  const t = u.toString();
  return t ? `/magazzino?${t}` : "/magazzino";
}

/** "2026-11-23" → "23/11/26" */
function data(valore: string | null): string {
  if (!valore) return "";
  const [a, m, g] = valore.split("-");
  return `${g}/${m}/${a.slice(2)}`;
}

export default async function Magazzino({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/magazzino");
  const p = await searchParams;
  const ricerca = pulisciRicerca(p.q);
  const avvisi = p.avvisi === "1";
  const id = p.id && UUID.test(p.id) ? p.id : undefined;
  const ufficio = io.ruolo === "titolare" || io.ruolo === "ufficio";
  const oggi = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());

  const supabase = await creaClientServer();
  let query = supabase.from("magazzino").select(COLONNE).eq("attivo", true).order("descrizione").limit(1000);
  if (avvisi) query = query.or("sotto_scorta.eq.true,giacenza.lt.0");
  if (ricerca) query = query.or(`descrizione.ilike.%${ricerca}%,codice.ilike.%${ricerca}%`);

  const [risElenco, risAvvisi, risScelto, risMovimenti] = await Promise.all([
    query,
    supabase
      .from("magazzino")
      .select("articolo_id", { count: "exact", head: true })
      .eq("attivo", true)
      .or("sotto_scorta.eq.true,giacenza.lt.0"),
    id ? supabase.from("magazzino").select(COLONNE).eq("articolo_id", id).maybeSingle() : Promise.resolve({ data: null }),
    id
      ? supabase
          .from("movimenti_magazzino")
          .select(
            "id, data, tipo, quantita, note, attivo, autore:profili!movimenti_magazzino_creato_da_fkey(nome_visualizzato), riga:righe_ordine_acquisto(ordine:ordini_acquisto(numero))"
          )
          .eq("articolo_id", id)
          .order("data", { ascending: false })
          .order("creato_il", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);

  const elenco = (risElenco.data ?? []) as RigaMagazzino[];
  const scelto = (risScelto.data ?? null) as RigaMagazzino | null;
  const movimenti = (risMovimenti.data ?? []) as unknown as Movimento[];
  const nAvvisi = risAvvisi.count ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold">Magazzino</h1>
          <p className="mt-1 text-sm text-slate-500">
            Quanto materiale c&apos;è: la giacenza è la somma di carichi, scarichi e inventari
          </p>
        </div>
        <form action="/magazzino" role="search" className="flex gap-2">
          {avvisi && <input type="hidden" name="avvisi" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={ricerca}
            aria-label="Cerca un articolo"
            placeholder="Codice o descrizione…"
            className={`${campo} w-64 max-w-full`}
          />
          <button className={pulsanteSecondario}>Cerca</button>
        </form>
      </header>

      {p.ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{p.ok}</p>}
      {p.errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{p.errore}</p>}

      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <Link
          href={indirizzo({ q: ricerca, avvisi: avvisi ? undefined : "1" })}
          className={`rounded-full px-3 py-1 font-medium ${
            avvisi ? "bg-amber-600 text-white" : nAvvisi ? "bg-amber-100 text-amber-900 hover:bg-amber-200" : "bg-slate-100 text-slate-600"
          }`}
        >
          ⚠ Da riordinare o sotto zero · {nAvvisi}
        </Link>
        {ricerca && (
          <Link href={indirizzo({ avvisi: avvisi ? "1" : undefined })} className="text-blue-700 hover:underline">
            × Togli la ricerca «{ricerca}»
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-label="Giacenze" className={`${riquadro} min-w-0 flex-[3_1_480px] overflow-x-auto`}>
          {elenco.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">
              {ricerca
                ? `Nessun articolo trovato per «${ricerca}».`
                : avvisi
                  ? "Nessun articolo sotto la scorta minima o sotto zero."
                  : "Nessun articolo nel catalogo (si aggiungono da Anagrafiche → Articoli)."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <th className="px-4 py-3">Articolo</th>
                  <th className="px-4 py-3 text-right">Giacenza</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">In arrivo</th>
                  <th className="hidden px-4 py-3 text-right sm:table-cell">Scorta min.</th>
                </tr>
              </thead>
              <tbody>
                {elenco.map((a) => {
                  const selezionato = a.articolo_id === id;
                  return (
                    <tr key={a.articolo_id} className={`border-b border-slate-100 ${selezionato ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                      <td className="px-4 py-3">
                        <Link
                          href={indirizzo({ q: ricerca, avvisi: avvisi ? "1" : undefined, id: a.articolo_id })}
                          aria-current={selezionato ? "true" : undefined}
                          className="font-medium text-slate-900 hover:text-blue-700 hover:underline"
                        >
                          {a.descrizione}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {[a.codice, a.categoria].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Giacenza giacenza={a.giacenza} unita={a.unita} sottoScorta={a.sotto_scorta} />
                      </td>
                      <td className="hidden px-4 py-3 text-right whitespace-nowrap text-slate-600 sm:table-cell">
                        {Number(a.in_arrivo) > 0 ? quantita(a.in_arrivo) : ""}
                      </td>
                      <td className="hidden px-4 py-3 text-right whitespace-nowrap text-slate-600 sm:table-cell">
                        {a.scorta_minima != null ? quantita(a.scorta_minima) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {elenco.length === 1000 && (
            <p className="p-4 text-xs text-slate-500">Mostrati i primi 1000: usa la ricerca per restringere.</p>
          )}
        </section>

        {/* su telefono l'articolo scelto compare sopra l'elenco */}
        <section
          aria-label="Articolo scelto"
          className={`${riquadro} min-w-0 flex-[2_1_340px] ${scelto ? "order-first lg:order-none" : ""}`}
        >
          {!scelto ? (
            <p className="p-6 text-sm text-slate-500">
              {id ? "Articolo non trovato." : "Scegli un articolo dall'elenco per registrare un carico o uno scarico."}
            </p>
          ) : (
            <div className="flex flex-col gap-5 p-5">
              <div>
                <h2 className="text-lg font-semibold">{scelto.descrizione}</h2>
                <p className="text-xs text-slate-500">
                  {[scelto.codice, scelto.categoria, `si conta in ${scelto.unita === "lastra" ? "lastre" : scelto.unita === "bobina" ? "bobine" : scelto.unita}`]
                    .filter(Boolean)
                    .join(" · ")}
                  {!scelto.attivo && " · archiviato"}
                </p>
              </div>

              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">In magazzino</dt>
                  <dd className="mt-1 text-lg font-semibold">
                    <Giacenza giacenza={scelto.giacenza} unita={scelto.unita} sottoScorta={scelto.sotto_scorta} />
                  </dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">In arrivo</dt>
                  <dd className="mt-1 text-lg font-semibold">{quantita(scelto.in_arrivo)}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <dt className="text-xs text-slate-500">Scorta minima</dt>
                  <dd className="mt-1 text-lg font-semibold">{scelto.scorta_minima != null ? quantita(scelto.scorta_minima) : "—"}</dd>
                </div>
              </dl>
              {Number(scelto.giacenza) < 0 && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                  La giacenza è sotto zero: è stato scaricato più materiale di quello registrato.
                  {ufficio ? " Controlla i movimenti o registra un inventario." : " Avvisa l'ufficio."}
                </p>
              )}

              <ModuloMovimento
                key={`${scelto.articolo_id}-${scelto.giacenza}-${p.ok ?? ""}`}
                articoloId={scelto.articolo_id}
                unita={scelto.unita}
                giacenza={Number(scelto.giacenza)}
                oggi={oggi}
                inventario={ufficio}
              />

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">Ultimi movimenti</h3>
                {movimenti.length === 0 ? (
                  <p className="text-sm text-slate-500">Nessun movimento registrato.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 text-sm">
                    {movimenti.map((m) => {
                      const descrizione = `${TIPI_MOVIMENTO[m.tipo]} ${quantitaConUnita(Math.abs(m.quantita), scelto.unita)} del ${data(m.data)}`;
                      return (
                        <li key={m.id} className={`flex items-start gap-3 py-2 ${m.attivo ? "" : "text-slate-400 line-through"}`}>
                          <span className="w-16 shrink-0 text-slate-500">{data(m.data)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="font-medium">{TIPI_MOVIMENTO[m.tipo]}</span>
                            {m.riga?.ordine && <span className="text-slate-500"> · ordine {m.riga.ordine.numero}</span>}
                            {m.note && <span className="block truncate text-xs text-slate-500" title={m.note}>{m.note}</span>}
                            {m.autore && <span className="block text-xs text-slate-400">{m.autore.nome_visualizzato}</span>}
                          </span>
                          <span
                            className={`shrink-0 font-semibold whitespace-nowrap ${
                              !m.attivo ? "" : m.quantita > 0 ? "text-green-700" : "text-red-700"
                            }`}
                          >
                            {m.quantita > 0 ? "+" : ""}
                            {quantita(m.quantita)}
                          </span>
                          {ufficio && m.attivo && (
                            <PulsanteAnnulla id={m.id} articoloId={scelto.articolo_id} descrizione={descrizione} />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
