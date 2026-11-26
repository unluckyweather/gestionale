// Dashboard → «Pose e installazioni in programma» (tutti i ruoli): i lavori nel programma
// dei prossimi 14 giorni sulle postazioni fuori sede (macchine.fuori_sede), con l'orario,
// la squadra e l'indirizzo. Un lavoro diviso tra più persone lo stesso giorno è una riga sola.
// Dati: vista programma (0010/0012) e tabella macchine (la leggono tutti).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt, ora } from "@/lib/produzione";
import { giornoSettimana, spostaGiorno } from "@/lib/programma";
import { riquadro } from "../anagrafiche/stile";

type Riga = {
  giorno: string;
  dalle: string;
  lavoro_id: string;
  titolo: string;
  commessa_numero: string | null;
  cliente: string | null;
  luogo_posa: string | null;
  persona: string | null;
  mio: boolean;
};

type Posa = Omit<Riga, "persona" | "mio"> & { squadra: string[]; mia: boolean };

const GIORNI = 14;
const QUANTE = 6;
const SIGLE = ["", "LUN", "MAR", "MER", "GIO", "VEN", "SAB", "DOM"];

export default async function PoseInProgramma() {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  const fine = spostaGiorno(oggi, GIORNI - 1);

  const { data: macchine } = await supabase.from("macchine").select("id").eq("fuori_sede", true);
  const postazioni = (macchine ?? []).map((m) => m.id as string);

  let righe: Riga[] = [];
  if (postazioni.length) {
    const { data } = await supabase
      .from("programma")
      .select("giorno, dalle, lavoro_id, titolo, commessa_numero, cliente, luogo_posa, persona, mio")
      .in("macchina_id", postazioni)
      .gte("giorno", oggi)
      .lte("giorno", fine)
      .order("giorno")
      .order("dalle");
    righe = (data ?? []) as Riga[];
  }

  // una riga per lavoro e giorno, con tutta la squadra
  const pose = new Map<string, Posa>();
  for (const r of righe) {
    const chiave = `${r.giorno}|${r.lavoro_id}`;
    const p = pose.get(chiave) ?? { ...r, squadra: [], mia: false };
    if (r.persona && !p.squadra.includes(r.persona)) p.squadra.push(r.persona);
    if (r.mio) p.mia = true;
    if (r.dalle < p.dalle) p.dalle = r.dalle;
    pose.set(chiave, p);
  }
  const elenco = [...pose.values()];

  return (
    <section className={`${riquadro} min-w-0 flex-[1_1_300px] p-4`}>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Pose e installazioni in programma</h2>
        <span className="text-xs text-slate-500">prossimi {GIORNI} giorni</span>
      </div>
      {elenco.length === 0 ? (
        <p className="text-sm text-slate-500">Nessuna posa nel programma.</p>
      ) : (
        <ul className="flex flex-col gap-3.5 text-sm">
          {elenco.slice(0, QUANTE).map((p) => (
            <li key={`${p.giorno}|${p.lavoro_id}`} className="flex gap-3">
              <Link
                href={`/produzione?scheda=programma&giorno=${p.giorno}`}
                aria-label={`Programma del ${p.giorno}`}
                className={`w-12 flex-none rounded-lg py-1.5 text-center text-xs leading-tight font-bold ${p.giorno === oggi ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-800"}`}
              >
                {p.giorno === oggi ? "OGGI" : SIGLE[giornoSettimana(p.giorno)]}
                <br />
                <span className="text-base">{Number(p.giorno.slice(8))}</span>
              </Link>
              <span className="min-w-0">
                <strong>{p.cliente ?? p.titolo}</strong>
                {p.cliente && <span className="text-slate-600"> · {p.titolo}</span>}
                {p.commessa_numero && <span className="text-slate-500"> · {p.commessa_numero}</span>}
                {p.mia && <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-900">ci sei anche tu</span>}
                <br />
                <span className="text-xs text-slate-500">
                  {ora(p.dalle)} · squadra: {p.squadra.length ? p.squadra.join(", ") : <span className="font-semibold text-red-700">da assegnare</span>}
                </span>
                {p.luogo_posa && <span className="block text-xs text-slate-500">{p.luogo_posa}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {elenco.length > QUANTE && <p className="mt-3 text-xs text-slate-500">e altre {elenco.length - QUANTE} nel programma.</p>}
    </section>
  );
}
