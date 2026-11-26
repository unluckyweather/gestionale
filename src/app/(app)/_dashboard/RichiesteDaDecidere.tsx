// Dashboard → «Richieste di ferie da decidere» (solo titolare): le richieste in attesa (0012).
// Si approvano e rifiutano in Timbrature → «Ferie e permessi», dove ci sono anche gli avvisi.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { riquadro } from "../anagrafiche/stile";
import { periodoTesto } from "../timbrature/RichiesteAssenze";

type Richiesta = { id: string; dipendente_id: string; tipo: string; dal: string; al: string; dalle: string | null; alle: string | null };

const NOMI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso" };

export default async function RichiesteDaDecidere() {
  const supabase = await creaClientServer();
  const [risRichieste, risPersone] = await Promise.all([
    supabase.from("assenze").select("id, dipendente_id, tipo, dal, al, dalle, alle").eq("stato", "richiesta").eq("attivo", true).order("dal"),
    supabase.from("dipendenti_elenco").select("id, nome_completo"),
  ]);
  const richieste = (risRichieste.data ?? []) as Richiesta[];
  // senza richieste il riquadro non compare
  if (richieste.length === 0) return null;
  const nomi = new Map((risPersone.data ?? []).map((p) => [p.id as string, p.nome_completo as string]));

  return (
    <section className={`${riquadro} min-w-0 flex-[1_1_300px] border-amber-300 bg-amber-50/40 p-4`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">
          Richieste di ferie da decidere <span className="ml-1 rounded-full bg-amber-200 px-2 py-0.5 text-xs text-amber-900">{richieste.length}</span>
        </h2>
        <Link href="/timbrature?scheda=ferie" className="text-sm font-semibold text-blue-700 hover:underline">
          Decidi →
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-amber-100 text-sm">
        {richieste.map((r) => (
          <li key={r.id} className="py-2">
            <strong>{nomi.get(r.dipendente_id) ?? "—"}</strong> · {NOMI[r.tipo] ?? r.tipo}
            <span className="block text-xs text-slate-600">{periodoTesto(r)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
