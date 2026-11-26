// Dashboard → «La mia giornata», per chi è collegato a un dipendente (qualunque ruolo):
// sono dentro o fuori, ore lavorate oggi, pulsante per timbrare, i miei lavori di oggi.
// Le timbrature si fanno nella scheda «Timbra» (lì c'è anche la coda senza rete).
// Sotto, le proprie richieste di ferie e permessi: in attesa o decise negli ultimi 7 giorni (0012).
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt, ora } from "@/lib/produzione";
import { contaMinuti, durataTesto, giornoRoma, oraRoma, statoDopo, type TipoTimbratura } from "@/lib/timbrature";
import { pulsante, riquadro } from "../anagrafiche/stile";
import { periodoTesto } from "../timbrature/RichiesteAssenze";

type MiaRichiesta = { id: string; tipo: string; dal: string; al: string; dalle: string | null; alle: string | null; stato: "richiesta" | "approvata" | "rifiutata" };
const NOMI: Record<string, string> = { ferie: "Ferie", permesso: "Permesso" };
const STATI_RICHIESTA: Record<MiaRichiesta["stato"], { testo: string; stile: string }> = {
  richiesta: { testo: "in attesa", stile: "bg-amber-100 text-amber-900" },
  approvata: { testo: "approvata", stile: "bg-green-100 text-green-900" },
  rifiutata: { testo: "rifiutata", stile: "bg-red-100 text-red-900" },
};

type LavoroOggi = { id: string; dalle: string; alle: string; titolo: string; macchina: string | null; commessa_numero: string | null; cliente: string | null; stato_lavoro: string };

export default async function MiaGiornata({ dipendente }: { dipendente: string }) {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  const da = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

  const settimanaFa = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  const [risTimbrature, risLavori, risRichieste] = await Promise.all([
    supabase
      .from("timbrature")
      .select("tipo, orario")
      .eq("dipendente_id", dipendente)
      .eq("attivo", true)
      .gte("orario", da)
      .order("orario")
      .order("ricevuta_il"),
    supabase
      .from("programma")
      .select("id, dalle, alle, titolo, macchina, commessa_numero, cliente, stato_lavoro")
      .eq("giorno", oggi)
      .eq("dipendente_id", dipendente)
      .order("dalle"),
    // solo quelle chieste dall'app (deciso_il pieno = decisa dal titolare); la malattia non si chiede
    supabase
      .from("assenze")
      .select("id, tipo, dal, al, dalle, alle, stato")
      .eq("dipendente_id", dipendente)
      .eq("attivo", true)
      .neq("tipo", "malattia")
      .or(`stato.eq.richiesta,deciso_il.gte.${settimanaFa}`)
      .order("dal"),
  ]);

  const timbrature = ((risTimbrature.data ?? []) as { tipo: TipoTimbratura; orario: string }[]).filter((t) => giornoRoma(t.orario) === oggi);
  const ultima = timbrature.at(-1);
  const stato = statoDopo(ultima?.tipo);
  const minuti = contaMinuti(timbrature, new Date()).lavoro;
  const lavori = (risLavori.data ?? []) as LavoroOggi[];
  const richieste = (risRichieste.data ?? []) as MiaRichiesta[];

  const frase = !ultima
    ? "Oggi non hai ancora timbrato."
    : stato === "dentro"
      ? `Sei in servizio (ultima timbratura alle ${oraRoma(ultima.orario)}).`
      : stato === "pausa"
        ? `Sei in pausa dalle ${oraRoma(ultima.orario)}.`
        : `Sei uscito alle ${oraRoma(ultima.orario)}.`;
  const colore = stato === "dentro" ? "bg-green-500" : stato === "pausa" ? "bg-amber-500" : "bg-slate-400";

  return (
    <section className={`${riquadro} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">La mia giornata</h2>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-700">
            <span aria-hidden className={`inline-block h-2.5 w-2.5 rounded-full ${colore}`} />
            {frase}
            {minuti > 0 && <span className="text-slate-500">· {durataTesto(minuti)} lavorate</span>}
          </p>
        </div>
        <Link href="/timbrature?scheda=timbra" className={`${pulsante} inline-flex items-center`}>
          Timbra
        </Link>
      </div>

      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-600">I miei lavori di oggi</h3>
          <Link href="/produzione?scheda=mio" className="text-sm font-semibold text-blue-700 hover:underline">
            Il mio programma →
          </Link>
        </div>
        {lavori.length === 0 ? (
          <p className="text-sm text-slate-500">Nessun lavoro nel programma di oggi.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {lavori.map((l) => (
              <li key={l.id} className="flex gap-3 py-2">
                <span className="tabular-nums text-slate-600">
                  {ora(l.dalle)}–{ora(l.alle)}
                </span>
                <span className="flex-1">
                  {l.titolo}
                  <span className="text-slate-500">
                    {l.macchina ? ` · ${l.macchina}` : ""}
                    {l.commessa_numero ? ` · ${l.commessa_numero}` : ""}
                    {l.cliente ? ` · ${l.cliente}` : ""}
                  </span>
                </span>
                {l.stato_lavoro === "finito" && <span className="text-xs font-semibold text-green-800">finito</span>}
                {l.stato_lavoro === "in_corso" && <span className="text-xs font-semibold text-blue-800">in corso</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {richieste.length > 0 && (
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-600">Le mie richieste di ferie e permessi</h3>
            <Link href="/timbrature?scheda=ferie" className="text-sm font-semibold text-blue-700 hover:underline">
              Ferie e permessi →
            </Link>
          </div>
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {richieste.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  {NOMI[r.tipo] ?? r.tipo} <span className="text-slate-500">· {periodoTesto(r)}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATI_RICHIESTA[r.stato].stile}`}>{STATI_RICHIESTA[r.stato].testo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
