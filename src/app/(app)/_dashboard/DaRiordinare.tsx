// Dashboard → «Materiali da riordinare» (tutti i ruoli): articoli sotto la scorta minima
// o sotto zero, con quanto è già in arrivo. Dati: vista magazzino (0007, senza costi).
import Link from "next/link";
import Giacenza from "@/components/Giacenza";
import { creaClientServer } from "@/lib/supabase/server";
import { quantitaConUnita } from "@/lib/magazzino";
import { riquadro } from "../anagrafiche/stile";

type Articolo = {
  articolo_id: string;
  codice: string | null;
  descrizione: string;
  unita: string;
  giacenza: number;
  in_arrivo: number;
  scorta_minima: number | null;
  sotto_scorta: boolean;
};

const QUANTI = 6;

export default async function DaRiordinare() {
  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("magazzino")
    .select("articolo_id, codice, descrizione, unita, giacenza, in_arrivo, scorta_minima, sotto_scorta")
    .eq("attivo", true)
    .or("sotto_scorta.eq.true,giacenza.lt.0")
    .order("giacenza")
    .order("descrizione");
  const articoli = (data ?? []) as Articolo[];

  return (
    <section className={`${riquadro} min-w-0 flex-[1_1_300px] p-4`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Materiali da riordinare</h2>
        <Link href="/magazzino?avvisi=1" className="text-sm font-semibold text-blue-700 hover:underline">
          Magazzino →
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-red-800">Non riesco a leggere il magazzino.</p>
      ) : articoli.length === 0 ? (
        <p className="text-sm text-slate-500">Nessun materiale sotto scorta.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100 text-sm">
          {articoli.slice(0, QUANTI).map((a) => (
            <li key={a.articolo_id} className="flex items-start justify-between gap-3 py-2">
              <Link href={`/magazzino?id=${a.articolo_id}`} className="min-w-0 hover:underline">
                {a.descrizione}
                {a.codice && <span className="block text-xs text-slate-500">{a.codice}</span>}
              </Link>
              <span className="flex-none text-right">
                <Giacenza giacenza={a.giacenza} unita={a.unita} sottoScorta={a.sotto_scorta} />
                <span className="block text-xs text-slate-500">
                  {a.scorta_minima != null && `scorta ${quantitaConUnita(a.scorta_minima, a.unita)}`}
                  {Number(a.in_arrivo) > 0 && <span className="block text-blue-800">in arrivo {quantitaConUnita(a.in_arrivo, a.unita)}</span>}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {articoli.length > QUANTI && (
        <p className="mt-2 text-xs text-slate-500">
          e altri {articoli.length - QUANTI} in{" "}
          <Link href="/magazzino?avvisi=1" className="text-blue-700 hover:underline">
            Magazzino
          </Link>
          .
        </p>
      )}
    </section>
  );
}
