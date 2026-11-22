// Riquadro a destra dell'elenco: fasi con ore e costo, poi i totali del preventivo scelto.
// Tutti i numeri arrivano dalle viste fasi_riepilogo e preventivi_riepilogo (calcolati dal database).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { euro } from "@/lib/validazioni";
import { pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import PulsanteDuplica from "./PulsanteDuplica";
import { EtichettaStato, dataItaliana, indirizzo, ore, percento, type Stato } from "./comuni";

type Client = Awaited<ReturnType<typeof creaClientServer>>;

type Preventivo = {
  id: string;
  numero: string;
  oggetto: string;
  data: string;
  valido_fino: string | null;
  stato: Stato;
  attivo: boolean;
  prezzo_cliente: number | null;
  cliente: { denominazione: string } | null;
};

type Totali = {
  ore_previste: number;
  costo_totale: number;
  prezzo_calcolato: number;
  prezzo: number;
  margine: number;
  margine_percentuale: number | null;
  iva: number;
  totale: number;
};

type Props = {
  supabase: Client;
  id: string;
  modificabile: boolean;
  chiudi: string; // indirizzo dell'elenco senza il preventivo scelto
};

export default async function AnteprimaPreventivo({ supabase, id, modificabile, chiudi }: Props) {
  const [risPreventivo, risTotali, risFasi, risCostiFasi] = await Promise.all([
    supabase
      .from("preventivi")
      .select("id, numero, oggetto, data, valido_fino, stato, attivo, prezzo_cliente, cliente:soggetti(denominazione)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("preventivi_riepilogo")
      .select("ore_previste, costo_totale, prezzo_calcolato, prezzo, margine, margine_percentuale, iva, totale")
      .eq("preventivo_id", id)
      .maybeSingle(),
    supabase
      .from("fasi_preventivo")
      .select("id, titolo")
      .eq("preventivo_id", id)
      .eq("attivo", true)
      .order("ordine"),
    supabase.from("fasi_riepilogo").select("fase_id, ore, costo").eq("preventivo_id", id),
  ]);

  const p = risPreventivo.data as unknown as Preventivo | null;
  if (!p) {
    return (
      <section aria-label="Anteprima preventivo" className={`${riquadro} flex-[2_1_340px] p-5 text-sm text-slate-600`}>
        Preventivo non trovato.{" "}
        <Link href={chiudi} className="text-blue-700 hover:underline">Chiudi</Link>
      </section>
    );
  }

  const t = risTotali.data as Totali | null;
  const fasi = (risFasi.data ?? []) as { id: string; titolo: string }[];
  const costi = new Map((risCostiFasi.data ?? []).map((c) => [c.fase_id as string, c]));
  // accettati e rifiutati non si modificano più (lo impone anche il database)
  const bloccato = p.stato === "accettato" || p.stato === "rifiutato" || !p.attivo;

  return (
    <section
      aria-label="Anteprima preventivo"
      // su schermi stretti l'anteprima va sopra l'elenco (altrimenti finirebbe in fondo, fuori vista)
      className={`${riquadro} order-first flex min-w-0 flex-[2_1_340px] flex-col gap-4 p-5 lg:order-none`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">Preventivo</div>
          <h2 className="mt-0.5 text-xl font-semibold">{p.numero}</h2>
          <div className="mt-1 text-sm text-slate-700">
            {p.cliente?.denominazione ?? "—"} · {p.oggetto}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Del {dataItaliana(p.data)}
            {p.valido_fino && ` · valido fino al ${dataItaliana(p.valido_fino)}`}
            {!p.attivo && " · archiviato"}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <EtichettaStato stato={p.stato} />
          <Link href={chiudi} aria-label="Chiudi l'anteprima" className="text-xs text-slate-500 hover:text-slate-800 hover:underline">
            Chiudi ×
          </Link>
        </div>
      </div>

      {fasi.length === 0 ? (
        <p className="text-sm text-slate-500">Nessuna fase inserita.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <th className="py-2 pr-2">Fase</th>
              <th className="px-2 py-2 text-right">Ore</th>
              <th className="py-2 pl-2 text-right">Costo</th>
            </tr>
          </thead>
          <tbody>
            {fasi.map((f, i) => {
              const c = costi.get(f.id);
              return (
                <tr key={f.id} className="border-b border-slate-100">
                  <td className="py-2.5 pr-2">{i + 1} · {f.titolo}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{ore(c?.ore)}</td>
                  <td className="py-2.5 pl-2 text-right whitespace-nowrap tabular-nums">{euro(c?.costo ?? 0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {t && (
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Costo totale ({ore(t.ore_previste)} h)</dt>
            <dd className="tabular-nums">{euro(t.costo_totale)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">
              Prezzo al cliente
              {p.prezzo_cliente !== null && <span className="text-xs"> (corretto a mano, calcolato {euro(t.prezzo_calcolato)})</span>}
            </dt>
            <dd className="tabular-nums">{euro(t.prezzo)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Margine</dt>
            <dd className={`font-semibold tabular-nums ${Number(t.margine) < 0 ? "text-red-700" : "text-green-800"}`}>
              {euro(t.margine)} · {percento(t.margine_percentuale)}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">IVA</dt>
            <dd className="tabular-nums">{euro(t.iva)}</dd>
          </div>
          <div className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-2 text-lg font-bold">
            <dt>Totale IVA inclusa</dt>
            <dd className="tabular-nums">{euro(t.totale)}</dd>
          </div>
        </dl>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href={indirizzo({ id: p.id })} className={`${pulsante} flex flex-[1_1_100%] items-center justify-center`}>
          {modificabile && !bloccato ? "Apri e modifica" : "Apri"}
        </Link>
        {modificabile && <PulsanteDuplica id={p.id} numero={p.numero} />}
        {["Scarica PDF", "Invia via email"].map((testo) => (
          <button
            key={testo}
            type="button"
            disabled
            title="In arrivo nei prossimi passi"
            className={`${pulsanteSecondario} flex-[1_1_120px] justify-center disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {testo}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">
        PDF ed email sono in arrivo. Ore, costi e margine restano interni: il cliente vedrà solo fasi e prezzo.
      </p>
    </section>
  );
}
