// Dashboard → «Commesse in corso» (titolare, ufficio, contabilità): le commesse non completate,
// prima le urgenti e quelle con la consegna più vicina. Dati: vista commesse_elenco (0010–0011).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { riquadro } from "../anagrafiche/stile";
import { EtichettaStatoCommessa, EtichettaUrgente, type StatoCommessa } from "../produzione/comuni";

type Commessa = {
  id: string;
  numero: string;
  cliente: string;
  descrizione: string;
  data_consegna: string | null;
  stato: StatoCommessa;
  urgente: boolean;
  avanzamento: number;
};

const QUANTE = 8;

export default async function CommesseInCorso() {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  const { data, error } = await supabase
    .from("commesse_elenco")
    .select("id, numero, cliente, descrizione, data_consegna, stato, urgente, avanzamento")
    .eq("attivo", true)
    .neq("stato", "completata")
    .order("urgente", { ascending: false })
    .order("data_consegna", { ascending: true, nullsFirst: false })
    .order("anno")
    .order("progressivo");
  const commesse = (data ?? []) as Commessa[];

  return (
    <section className={`${riquadro} min-w-0 flex-[2_1_440px]`}>
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold">Commesse in corso</h2>
        <Link href="/produzione" className="text-sm font-semibold text-blue-700 hover:underline">
          Vai a Produzione →
        </Link>
      </div>
      {error ? (
        <p className="px-4 pb-4 text-sm text-red-800">Non riesco a leggere le commesse.</p>
      ) : commesse.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">Nessuna commessa in corso.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[460px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-3 py-2.5">Commessa</th>
                <th className="px-3 py-2.5">Cliente</th>
                <th className="px-3 py-2.5">Consegna</th>
                <th className="px-3 py-2.5">Stato</th>
                <th className="px-3 py-2.5 text-right">Fatto</th>
              </tr>
            </thead>
            <tbody>
              {commesse.slice(0, QUANTE).map((c) => {
                const inRitardo = !!c.data_consegna && c.data_consegna < oggi;
                return (
                  <tr key={c.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="px-3 py-3">
                      <Link href={`/produzione?id=${c.id}`} className="font-semibold text-blue-700 hover:underline">
                        {c.numero}
                      </Link>
                      <div className="text-xs text-slate-500">{c.descrizione}</div>
                    </td>
                    <td className="px-3 py-3">{c.cliente}</td>
                    <td className={`px-3 py-3 whitespace-nowrap ${inRitardo ? "font-semibold text-red-700" : ""}`}>
                      {c.data_consegna ? dataIt(c.data_consegna) : "—"}
                      {inRitardo && <div className="text-xs font-normal">in ritardo</div>}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <EtichettaStatoCommessa stato={c.stato} />
                        {c.urgente && <EtichettaUrgente />}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{c.avanzamento}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {commesse.length > QUANTE && (
            <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
              Altre {commesse.length - QUANTE} in{" "}
              <Link href="/produzione" className="text-blue-700 hover:underline">
                Produzione
              </Link>
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}
