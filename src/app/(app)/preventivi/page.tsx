// Preventivi: elenco con ricerca, filtro per stato e anteprima del preventivo scelto.
// Vedono la scheda titolare, ufficio e contabilità; creano e modificano titolare e ufficio
// (lo impone anche il database con la Row Level Security).
// Indirizzi: ?stato=bozza&q=…&archiviati=1&sel=<id> (anteprima) · ?id=<id> o ?id=nuovo (pagina del preventivo).
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import { pulisciRicerca } from "../anagrafiche/indirizzo";
import { campo, pulsante, pulsanteSecondario } from "../anagrafiche/stile";
import ElencoPreventivi, { filtroRicerca } from "./ElencoPreventivi";
import AnteprimaPreventivo from "./AnteprimaPreventivo";
import SchedaPreventivo from "./SchedaPreventivo";
import { STATI, eStato, indirizzo, type Stato } from "./comuni";

type Parametri = {
  stato?: string;
  q?: string;
  archiviati?: string;
  sel?: string;
  id?: string;
  ok?: string;
  errore?: string;
};

export default async function Preventivi({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/preventivi");
  const p = await searchParams;
  const modificabile = io.ruolo === "titolare" || io.ruolo === "ufficio";

  // Pagina del singolo preventivo (o nuovo)
  if (p.id) return <SchedaPreventivo id={p.id} modificabile={modificabile} ok={p.ok} errore={p.errore} />;

  const stato: Stato | null = eStato(p.stato) ? p.stato : null;
  const ricerca = pulisciRicerca(p.q);
  const archiviati = p.archiviati === "1";
  // parametri che restano quando si sceglie una riga o si cambia filtro
  const filtri = { q: ricerca || undefined, archiviati: archiviati ? "1" : undefined };

  const supabase = await creaClientServer();
  const filtro = await filtroRicerca(supabase, ricerca);

  // numeri accanto ai filtri (contano anche ricerca e archiviati, non lo stato)
  const conta = (s?: Stato) => {
    let q = supabase.from("preventivi").select("id", { count: "exact", head: true });
    if (!archiviati) q = q.eq("attivo", true);
    if (s) q = q.eq("stato", s);
    if (filtro) q = q.or(filtro);
    return q;
  };
  const conteggi = await Promise.all([conta(), ...STATI.map((s) => conta(s.valore))]);
  const filtriStato = [
    { valore: undefined, etichetta: "Tutti", numero: conteggi[0].count },
    ...STATI.map((s, i) => ({ valore: s.valore, etichetta: s.etichetta, numero: conteggi[i + 1].count })),
  ];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold">Preventivi</h1>
          <p className="mt-1 text-sm text-slate-500">Lavorazioni su misura: fasi, ore e materiali</p>
        </div>
        <form action="/preventivi" role="search" className="flex gap-2">
          {stato && <input type="hidden" name="stato" value={stato} />}
          {archiviati && <input type="hidden" name="archiviati" value="1" />}
          <input
            type="search"
            name="q"
            defaultValue={ricerca}
            aria-label="Cerca preventivi"
            placeholder="Cliente, numero, oggetto"
            className={`${campo} w-72 max-w-full`}
          />
          <button className={pulsanteSecondario}>Cerca</button>
        </form>
        {modificabile && (
          <Link href={indirizzo({ id: "nuovo" })} className={`${pulsante} inline-flex items-center`}>
            + Nuovo preventivo
          </Link>
        )}
      </header>

      {p.ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{p.ok}</p>}
      {p.errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{p.errore}</p>}

      <nav aria-label="Filtra per stato" className="flex flex-wrap gap-2">
        {filtriStato.map((f) => {
          const attivo = f.valore === (stato ?? undefined);
          return (
            <Link
              key={f.etichetta}
              href={indirizzo({ ...filtri, stato: f.valore })}
              aria-current={attivo ? "page" : undefined}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3.5 text-sm font-semibold ${
                attivo
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
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
          <Link href={indirizzo({ stato: stato ?? undefined, archiviati: filtri.archiviati })} className="text-blue-700 hover:underline">
            × Togli la ricerca «{ricerca}»
          </Link>
        )}
        <Link
          href={indirizzo({ stato: stato ?? undefined, q: filtri.q, archiviati: archiviati ? undefined : "1" })}
          className="text-slate-500 hover:text-slate-800 hover:underline"
        >
          {archiviati ? "Nascondi gli archiviati" : "Mostra anche gli archiviati"}
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <ElencoPreventivi
          supabase={supabase}
          filtro={filtro}
          stato={stato}
          archiviati={archiviati}
          ricerca={ricerca}
          selezionato={p.sel}
          parametri={{ ...filtri, stato: stato ?? undefined }}
        />
        {p.sel && (
          <AnteprimaPreventivo
            supabase={supabase}
            id={p.sel}
            modificabile={modificabile}
            chiudi={indirizzo({ ...filtri, stato: stato ?? undefined })}
          />
        )}
      </div>
    </div>
  );
}
