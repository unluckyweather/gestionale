// Dashboard → «Ore previste e ore reali» (titolare, ufficio, contabilità), per le commesse in corso.
// Previste: somma delle ore dei lavori (commesse_elenco). Fatte: calcolo automatico di lib/oreReali.ts
// (programma dei lavori iniziati o finiti ∩ tempo timbrato dentro). Nessun dato salvato.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt } from "@/lib/produzione";
import { minutiReali, trattiDentro, type RigaProgramma, type TimbraturaPersona } from "@/lib/oreReali";
import { spostaGiorno } from "@/lib/programma";
import { riquadro } from "../anagrafiche/stile";

type Commessa = { id: string; numero: string; cliente: string; ore_previste: number; avanzamento: number; lavori: number; lavori_finiti: number };
type Lavoro = { id: string; commessa_id: string; stato: "da_fare" | "in_corso" | "finito" };
type Riga = RigaProgramma & { lavoro_id: string };

const QUANTE = 8;

/** 7.5 → "7,5 h" */
function ore(h: number): string {
  return `${(Math.round(h * 10) / 10).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} h`;
}

function Andamento({ c, fatte }: { c: Commessa; fatte: number }) {
  const previste = Number(c.ore_previste);
  let testo: string;
  let stile: string;
  if (previste > 0 && fatte > previste + 0.05) {
    testo = `Sforato di ${ore(fatte - previste)}`;
    stile = "bg-red-100 text-red-900";
  } else if (c.lavori > 0 && c.lavori_finiti === c.lavori && fatte === 0) {
    // finita, ma nessuno era timbrato negli orari del programma: non si può dire
    testo = "Finita · ore non rilevate";
    stile = "bg-slate-100 text-slate-700";
  } else if (c.lavori > 0 && c.lavori_finiti === c.lavori) {
    testo = "Nei tempi";
    stile = "bg-green-100 text-green-900";
  } else if (fatte === 0 && c.avanzamento === 0) {
    testo = "Non iniziata";
    stile = "bg-slate-100 text-slate-700";
  } else {
    testo = `In corso · ${c.avanzamento}%`;
    stile = "bg-blue-100 text-blue-900";
  }
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${stile}`}>{testo}</span>;
}

export default async function OrePreviste() {
  const supabase = await creaClientServer();
  const oggi = oggiIt();

  const { data: datiCommesse } = await supabase
    .from("commesse_elenco")
    .select("id, numero, cliente, ore_previste, avanzamento, lavori, lavori_finiti")
    .eq("attivo", true)
    .neq("stato", "completata")
    .order("anno")
    .order("progressivo");
  const commesse = (datiCommesse ?? []) as Commessa[];
  const idCommesse = commesse.map((c) => c.id);

  // lavori iniziati o finiti e le loro righe del programma fino a oggi
  let lavori: Lavoro[] = [];
  let righe: Riga[] = [];
  let timbrature: TimbraturaPersona[] = [];
  if (idCommesse.length) {
    const { data } = await supabase
      .from("lavori")
      .select("id, commessa_id, stato")
      .eq("attivo", true)
      .in("commessa_id", idCommesse)
      .in("stato", ["in_corso", "finito"]);
    lavori = (data ?? []) as Lavoro[];
  }
  if (lavori.length) {
    const { data } = await supabase
      .from("programma")
      .select("lavoro_id, dipendente_id, giorno, dalle, alle")
      .in("lavoro_id", lavori.map((l) => l.id))
      .lte("giorno", oggi);
    righe = ((data ?? []) as Riga[]).filter((r) => r.dipendente_id);
  }
  if (righe.length) {
    const persone = [...new Set(righe.map((r) => r.dipendente_id as string))];
    const primo = righe.reduce((m, r) => (r.giorno < m ? r.giorno : m), oggi);
    const { data } = await supabase
      .from("timbrature")
      .select("dipendente_id, tipo, orario")
      .eq("attivo", true)
      .in("dipendente_id", persone)
      .gte("orario", new Date(`${spostaGiorno(primo, -1)}T00:00:00Z`).toISOString())
      .order("orario")
      .order("ricevuta_il");
    timbrature = (data ?? []) as TimbraturaPersona[];
  }

  const tratti = trattiDentro(timbrature, new Date(), oggi);
  const commessaDi = new Map(lavori.map((l) => [l.id, l.commessa_id]));
  const minutiPerCommessa = new Map<string, number>();
  for (const r of righe) {
    const c = commessaDi.get(r.lavoro_id);
    if (!c) continue;
    minutiPerCommessa.set(c, (minutiPerCommessa.get(c) ?? 0) + minutiReali(r, tratti));
  }

  // prima le commesse già iniziate, poi le altre
  const elenco = commesse
    .map((c) => ({ c, fatte: (minutiPerCommessa.get(c.id) ?? 0) / 60 }))
    .sort((x, y) => Number(y.fatte > 0 || y.c.avanzamento > 0) - Number(x.fatte > 0 || x.c.avanzamento > 0));

  return (
    <section className={`${riquadro} min-w-0 flex-[2_1_440px]`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold">Ore previste e ore reali</h2>
        <span className="text-xs text-slate-500">Fatte = ore del programma in cui la persona era timbrata</span>
      </div>
      {elenco.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">Nessuna commessa in corso.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-2.5">Commessa</th>
                <th className="px-3 py-2.5 text-right">Previste</th>
                <th className="px-3 py-2.5 text-right">Fatte</th>
                <th className="px-3 py-2.5">Andamento</th>
              </tr>
            </thead>
            <tbody>
              {elenco.slice(0, QUANTE).map(({ c, fatte }) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-3">
                    <Link href={`/produzione?id=${c.id}`} className="font-semibold text-blue-700 hover:underline">
                      {c.numero}
                    </Link>{" "}
                    <span className="text-slate-600">· {c.cliente}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{Number(c.ore_previste) > 0 ? ore(Number(c.ore_previste)) : "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{ore(fatte)}</td>
                  <td className="px-3 py-3">
                    <Andamento c={c} fatte={fatte} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
