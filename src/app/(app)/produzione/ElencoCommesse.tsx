// Elenco delle commesse in colonne per stato (come nel mockup), con ricerca e archiviate.
// Lo vedono tutti; titolare e ufficio vedono anche i preventivi accettati da convertire.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { pulisciRicerca } from "../anagrafiche/indirizzo";
import { campo, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import {
  EtichettaUrgente,
  Messaggi,
  STATI_COMMESSA,
  SchedeProduzione,
  indirizzo,
  oreTesto,
  type StatoCommessa,
} from "./comuni";

type Riga = {
  id: string;
  numero: string;
  cliente: string;
  descrizione: string;
  data_consegna: string | null;
  stato: StatoCommessa;
  urgente: boolean;
  lavori: number;
  ore_previste: number;
  avanzamento: number;
};

type Parametri = { q?: string; archiviati?: string; ok?: string; errore?: string };

const MAX_COMPLETATE = 12;

export default async function ElencoCommesse({ p, modificabile }: { p: Parametri; modificabile: boolean }) {
  const supabase = await creaClientServer();
  const archiviati = p.archiviati === "1";
  const q = pulisciRicerca(p.q);
  const oggi = oggiIt();

  let query = supabase
    .from("commesse_elenco")
    .select("id, numero, cliente, descrizione, data_consegna, stato, urgente, lavori, ore_previste, avanzamento")
    .eq("attivo", !archiviati)
    .order("urgente", { ascending: false })
    .order("data_consegna", { ascending: true, nullsFirst: false })
    .order("anno", { ascending: false })
    .order("progressivo", { ascending: false })
    .limit(500);
  if (q) query = query.or(`numero.ilike.%${q}%,cliente.ilike.%${q}%,descrizione.ilike.%${q}%`);

  const [risCommesse, risDaConvertire] = await Promise.all([
    query,
    modificabile && !archiviati && !q
      ? supabase
          .from("preventivi")
          .select("id, numero, oggetto, data, soggetti(denominazione), commesse(id, attivo)")
          .eq("stato", "accettato")
          .eq("attivo", true)
          .order("anno", { ascending: false })
          .order("progressivo", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (risCommesse.error) console.error("Lettura delle commesse non riuscita:", risCommesse.error.message);
  // avanzamento vuoto = nessun lavoro finito (la vista della 0010 non lo trasforma in 0)
  const commesse = ((risCommesse.data ?? []) as Riga[]).map((c) => ({ ...c, avanzamento: Number(c.avanzamento ?? 0) }));
  type PreventivoAccettato = {
    id: string;
    numero: string;
    oggetto: string;
    soggetti: { denominazione: string } | null;
    commesse: { id: string; attivo: boolean }[];
  };
  const daConvertire = ((risDaConvertire.data ?? []) as unknown as PreventivoAccettato[]).filter(
    (x) => !x.commesse.some((c) => c.attivo)
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <h1 className="text-2xl font-semibold">Produzione</h1>
          <p className="mt-1 text-sm text-slate-500">Commesse: il lavoro accettato dai clienti, diviso in lavori da programmare</p>
        </div>
        <form className="flex gap-2" action="/produzione">
          {archiviati && <input type="hidden" name="archiviati" value="1" />}
          <input
            name="q"
            defaultValue={p.q ?? ""}
            aria-label="Cerca nelle commesse"
            placeholder="Numero, cliente o descrizione…"
            className={`${campo} w-64`}
          />
          <button className={pulsanteSecondario}>Cerca</button>
        </form>
        {modificabile && (
          <Link href={indirizzo({ id: "nuova" })} className={`${pulsante} inline-flex items-center`}>
            + Nuova commessa
          </Link>
        )}
      </header>

      <SchedeProduzione attiva="commesse" />
      <Messaggi ok={p.ok} errore={p.errore} />

      {daConvertire.length > 0 && (
        <section aria-label="Preventivi da convertire" className="rounded-xl border border-green-200 bg-green-50 p-4">
          <h2 className="text-sm font-semibold text-green-900">
            Preventivi accettati senza commessa · {daConvertire.length}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {daConvertire.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-3 text-sm">
                <strong>{x.numero}</strong>
                <span>{x.soggetti?.denominazione}</span>
                <span className="text-slate-600">{x.oggetto}</span>
                <Link
                  href={indirizzo({ id: "nuova", preventivo: x.id })}
                  className="ml-auto font-semibold text-green-900 hover:underline"
                >
                  Converti in commessa →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {q && (
          <span>
            Ricerca «{q}» · {commesse.length} {commesse.length === 1 ? "commessa" : "commesse"} ·{" "}
            <Link href={indirizzo({ archiviati: archiviati ? "1" : undefined })} className="text-blue-700 hover:underline">
              togli la ricerca
            </Link>
          </span>
        )}
        <Link
          href={indirizzo({ q: p.q, archiviati: archiviati ? undefined : "1" })}
          className="ml-auto text-blue-700 hover:underline"
        >
          {archiviati ? "← Torna alle commesse attive" : "Vedi le archiviate"}
        </Link>
      </div>

      {archiviati ? (
        <section className={riquadro}>
          {commesse.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nessuna commessa archiviata.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {commesse.map((c) => (
                <li key={c.id}>
                  <Link href={indirizzo({ id: c.id })} className="flex flex-wrap gap-3 p-4 text-sm hover:bg-slate-50">
                    <strong>{c.numero}</strong>
                    <span>{c.cliente}</span>
                    <span className="text-slate-500">{c.descrizione}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section aria-label="Commesse per stato" className="grid gap-4 overflow-x-auto md:grid-cols-2 xl:grid-cols-4">
          {STATI_COMMESSA.map((s) => {
            const tutte = commesse.filter((c) => c.stato === s.valore);
            const elenco = s.valore === "completata" ? tutte.slice(0, MAX_COMPLETATE) : tutte;
            return (
              <div key={s.valore} className="flex min-w-56 flex-col gap-3 rounded-xl bg-slate-200/70 p-3">
                <h2 className="flex justify-between text-sm font-semibold">
                  {s.etichetta} <span className="text-slate-600">{tutte.length}</span>
                </h2>
                {elenco.length === 0 && <p className="text-xs text-slate-500">Nessuna.</p>}
                {elenco.map((c) => (
                  <Scheda key={c.id} c={c} oggi={oggi} />
                ))}
                {tutte.length > elenco.length && (
                  <p className="text-xs text-slate-600">
                    … e altre {tutte.length - elenco.length}: cercale per numero o cliente.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}

function Scheda({ c, oggi }: { c: Riga; oggi: string }) {
  const inRitardo = c.data_consegna && c.data_consegna < oggi && c.stato !== "completata";
  return (
    <Link
      href={indirizzo({ id: c.id })}
      className="flex flex-col gap-1.5 rounded-lg bg-white p-3 text-sm shadow-sm ring-1 ring-slate-200 hover:ring-blue-400"
    >
      <span className="flex items-center justify-between gap-2">
        <strong>{c.numero}</strong>
        {c.urgente && <EtichettaUrgente />}
      </span>
      <span className="font-medium">{c.cliente}</span>
      <span className="line-clamp-2 text-slate-600">{c.descrizione}</span>
      {c.stato !== "da_pianificare" && c.stato !== "completata" && (
        <span className="h-1.5 rounded-full bg-slate-200" aria-label={`Avanzamento ${c.avanzamento}%`}>
          <span className="block h-1.5 rounded-full bg-blue-600" style={{ width: `${c.avanzamento}%` }} />
        </span>
      )}
      <span className="flex flex-wrap gap-x-3 text-xs text-slate-600">
        {c.data_consegna && (
          <span className={inRitardo ? "font-semibold text-red-700" : ""}>
            consegna {dataIt(c.data_consegna)}
            {inRitardo && " · in ritardo"}
          </span>
        )}
        <span>
          {c.lavori} {c.lavori === 1 ? "lavoro" : "lavori"}
          {Number(c.ore_previste) > 0 && ` · ${oreTesto(c.ore_previste)}`}
        </span>
      </span>
    </Link>
  );
}
