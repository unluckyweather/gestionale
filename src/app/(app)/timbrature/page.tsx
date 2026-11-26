// Timbrature (tutti gli utenti attivi), in schede:
//   Timbra            → timbratura dal telefono, per chi è collegato a un dipendente (0013);
//                       si apre su questa
//   Presenze          → chi c'è, chi è in pausa, chi non ha timbrato (titolare, ufficio,
//                       contabilità; ?scheda=presenze&giorno=<data>)
//   Ferie e permessi  → calendario di due settimane; il titolare registra e decide le richieste,
//                       gli altri chiedono per sé (?scheda=ferie&dal=<data>, 0012)
import Link from "next/link";
import { richiediSezione } from "@/lib/utente";
import { oggiIt } from "@/lib/produzione";
import { creaClientServer } from "@/lib/supabase/server";
import SchedaAssenze from "./SchedaAssenze";
import SchedaPresenze from "./SchedaPresenze";
import SchedaTimbra from "./SchedaTimbra";

type Parametri = { scheda?: string; dal?: string; giorno?: string; ok?: string; errore?: string };

const SCHEDE = [
  { chiave: "timbra", etichetta: "Timbra" },
  { chiave: "presenze", etichetta: "Presenze" },
  { chiave: "ferie", etichetta: "Ferie e permessi" },
];

export default async function Timbrature({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/timbrature");
  const p = await searchParams;
  // il dipendente collegato a chi è entrato (vuoto: non timbra, niente scheda «Timbra»)
  const supabase = await creaClientServer();
  const { data: mio } = await supabase.from("dipendenti_elenco").select("id").eq("io", true).eq("attivo", true).maybeSingle();
  // le presenze di tutti le vedono titolare, ufficio e contabilità
  const uffici = io.ruolo !== "operaio";
  const schede = SCHEDE.filter((s) => (s.chiave !== "timbra" || mio) && (s.chiave !== "presenze" || uffici));
  // si apre su «Timbra»; chi non timbra su «Presenze» (o «Ferie e permessi»)
  const scheda = schede.find((s) => s.chiave === p.scheda)?.chiave ?? (mio ? "timbra" : uffici ? "presenze" : "ferie");

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">Timbrature</h1>
        <p className="mt-1 text-sm text-slate-500">Presenze, ferie e permessi</p>
      </header>

      {p.ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{p.ok}</p>}
      {p.errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{p.errore}</p>}

      <nav aria-label="Sezioni delle timbrature" className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-300">
        {schede.map((s) => (
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

      {scheda === "timbra" && mio ? (
        <SchedaTimbra dipendente={mio.id} />
      ) : scheda === "presenze" ? (
        <SchedaPresenze giorno={p.giorno} />
      ) : (
        <SchedaAssenze dal={p.dal} titolare={io.ruolo === "titolare"} oggi={oggiIt()} />
      )}
    </div>
  );
}
