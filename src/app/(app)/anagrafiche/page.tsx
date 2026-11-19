// Anagrafiche: clienti, fornitori, catalogo materiali (articoli), codici IVA, pagamenti, banche e categorie.
// Vedono la scheda titolare, ufficio e contabilità.
// Modificano: clienti/fornitori/articoli/categorie → titolare e ufficio;
//             codici IVA, pagamenti, banche aziendali → titolare e contabilità.
// (I dipendenti si gestiscono in Impostazioni.)
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { creaClientServer } from "@/lib/supabase/server";
import SchedaSoggetti from "./SchedaSoggetti";
import SchedaArticoli from "./SchedaArticoli";
import SchedaTabelle from "./SchedaTabelle";
import { indirizzo } from "./indirizzo";
import { campo, pulsante, pulsanteSecondario } from "./stile";

type Chiave = "clienti" | "fornitori" | "articoli" | "tabelle";

const SCHEDE: { chiave: Chiave; etichetta: string; nuovo?: string; cerca?: string }[] = [
  { chiave: "clienti", etichetta: "Clienti", nuovo: "Nuovo cliente", cerca: "Nome, nome breve, P.IVA, comune, email…" },
  { chiave: "fornitori", etichetta: "Fornitori", nuovo: "Nuovo fornitore", cerca: "Nome, nome breve, P.IVA, comune, email…" },
  { chiave: "articoli", etichetta: "Articoli", nuovo: "Nuovo articolo", cerca: "Codice o descrizione…" },
  { chiave: "tabelle", etichetta: "Codici IVA, pagamenti e banche" },
];

type Parametri = {
  scheda?: string;
  q?: string;
  id?: string;
  archiviati?: string;
  storico?: string;
  ok?: string;
  errore?: string;
};

export default async function Anagrafiche({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/anagrafiche");
  const p = await searchParams;

  const scheda = SCHEDE.find((s) => s.chiave === p.scheda) ?? SCHEDE[0];
  const modificabile = io.ruolo === "titolare" || io.ruolo === "ufficio";
  const modificaFiscali = io.ruolo === "titolare" || io.ruolo === "contabilita";
  const archiviati = p.archiviati === "1";
  const soggetti = scheda.chiave === "clienti" || scheda.chiave === "fornitori";
  // la scheda di un cliente/fornitore occupa tutta la pagina: niente ricerca né "archiviati"
  const schedaAperta = soggetti && Boolean(p.id);

  // numeri accanto ai nomi delle schede (solo righe attive)
  const supabase = await creaClientServer();
  const conta = (tabella: string, tipi?: string[]) => {
    let q = supabase.from(tabella).select("id", { count: "exact", head: true }).eq("attivo", true);
    if (tipi) q = q.in("tipo", tipi);
    return q;
  };
  const [nClienti, nFornitori, nArticoli] = await Promise.all([
    conta("soggetti", ["cliente", "entrambi"]),
    conta("soggetti", ["fornitore", "entrambi"]),
    conta("articoli"),
  ]);
  const numeri: Partial<Record<Chiave, number | null>> = {
    clienti: nClienti.count,
    fornitori: nFornitori.count,
    articoli: nArticoli.count,
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold">Anagrafiche</h1>
          <p className="mt-1 text-sm text-slate-500">
            Clienti, fornitori e catalogo materiali usati nelle altre schede
          </p>
        </div>
        {scheda.cerca && !schedaAperta && (
          <form action="/anagrafiche" role="search" className="flex gap-2">
            <input type="hidden" name="scheda" value={scheda.chiave} />
            {archiviati && <input type="hidden" name="archiviati" value="1" />}
            <input
              type="search"
              name="q"
              defaultValue={p.q ?? ""}
              aria-label={`Cerca in ${scheda.etichetta.toLowerCase()}`}
              placeholder={scheda.cerca}
              className={`${campo} w-72 max-w-full`}
            />
            <button className={pulsanteSecondario}>Cerca</button>
          </form>
        )}
        {scheda.nuovo && modificabile && !schedaAperta && (
          <Link href={indirizzo({ scheda: scheda.chiave, id: "nuovo" })} className={`${pulsante} inline-flex items-center`}>
            + {scheda.nuovo}
          </Link>
        )}
      </header>

      {p.ok && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{p.ok}</p>
      )}
      {p.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{p.errore}</p>
      )}

      <nav aria-label="Tipo di anagrafica" className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-300">
        {SCHEDE.map((s) => {
          const attiva = s.chiave === scheda.chiave;
          const numero = numeri[s.chiave];
          return (
            <Link
              key={s.chiave}
              href={indirizzo({ scheda: s.chiave })}
              aria-current={attiva ? "page" : undefined}
              className={`border-b-[3px] px-4 py-3 text-sm whitespace-nowrap ${
                attiva
                  ? "border-blue-600 font-bold text-slate-900"
                  : "border-transparent font-semibold text-slate-600 hover:text-slate-900"
              }`}
            >
              {s.etichetta}
              {typeof numero === "number" && <span className="font-normal text-slate-500"> · {numero}</span>}
            </Link>
          );
        })}
      </nav>

      {(soggetti || scheda.chiave === "articoli") && !schedaAperta && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {p.q && (
            <Link href={indirizzo({ scheda: scheda.chiave, archiviati: archiviati ? "1" : undefined })} className="text-blue-700 hover:underline">
              × Togli la ricerca «{p.q}»
            </Link>
          )}
          <Link
            href={indirizzo({ scheda: scheda.chiave, q: p.q, archiviati: archiviati ? undefined : "1" })}
            className="text-slate-500 hover:text-slate-800 hover:underline"
          >
            {archiviati ? "Nascondi gli archiviati" : "Mostra anche gli archiviati"}
          </Link>
        </div>
      )}

      {soggetti && (
        <SchedaSoggetti
          scheda={scheda.chiave as "clienti" | "fornitori"}
          q={p.q}
          id={p.id}
          archiviati={archiviati}
          storico={p.storico === "1"}
          modificabile={modificabile}
          vedeStorico={io.ruolo === "titolare"}
        />
      )}
      {scheda.chiave === "articoli" && (
        <SchedaArticoli q={p.q} id={p.id} archiviati={archiviati} modificabile={modificabile} />
      )}
      {scheda.chiave === "tabelle" && (
        <SchedaTabelle modificaFiscali={modificaFiscali} modificaCategorie={modificabile} />
      )}
    </div>
  );
}
