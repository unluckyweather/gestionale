// Timbrature (tutti gli utenti attivi), in schede:
//   Presenze          → in costruzione (chat Timbrature)
//   Ferie e permessi  → calendario di due settimane; le registra il titolare (?scheda=ferie&dal=<data>)
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { oggiIt } from "@/lib/produzione";
import SchedaAssenze from "./SchedaAssenze";

type Parametri = { scheda?: string; dal?: string; ok?: string; errore?: string };

const SCHEDE = [
  { chiave: "presenze", etichetta: "Presenze" },
  { chiave: "ferie", etichetta: "Ferie e permessi" },
];

export default async function Timbrature({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/timbrature");
  const p = await searchParams;
  // finché le presenze non ci sono, si apre su «Ferie e permessi»
  const scheda = p.scheda === "presenze" ? "presenze" : "ferie";

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Timbrature</h1>
        <p className="mt-1 text-sm text-slate-500">Presenze, ferie e permessi</p>
      </header>

      {p.ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{p.ok}</p>}
      {p.errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{p.errore}</p>}

      <nav aria-label="Sezioni delle timbrature" className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-300">
        {SCHEDE.map((s) => (
          <Link
            key={s.chiave}
            href={`/timbrature?scheda=${s.chiave}`}
            aria-current={s.chiave === scheda ? "page" : undefined}
            className={`border-b-[3px] px-4 py-3 text-sm whitespace-nowrap ${
              s.chiave === scheda
                ? "border-blue-600 font-bold text-slate-900"
                : "border-transparent font-semibold text-slate-600 hover:text-slate-900"
            }`}
          >
            {s.etichetta}
          </Link>
        ))}
      </nav>

      {scheda === "presenze" ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Le timbrature da telefono e le presenze sono in costruzione.
        </p>
      ) : (
        <SchedaAssenze dal={p.dal} titolare={io.ruolo === "titolare"} oggi={oggiIt()} />
      )}
    </div>
  );
}
