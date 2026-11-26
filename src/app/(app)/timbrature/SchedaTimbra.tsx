// Timbrature → «Timbra»: la timbratura dal telefono (0013), per chi è collegato a un dipendente.
// Indirizzo: /timbrature?scheda=timbra
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt, ora } from "@/lib/produzione";
import { distanzaTesto, ETICHETTE_TIMBRATURA, giornoRoma, oraRoma, type Timbratura } from "@/lib/timbrature";
import { riquadro } from "../anagrafiche/stile";
import PulsantiTimbra from "./PulsantiTimbra";

type LavoroOggi = { id: string; dalle: string; alle: string; titolo: string; macchina: string | null; commessa_numero: string | null; stato_lavoro: string };

export default async function SchedaTimbra({ dipendente }: { dipendente: string }) {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  // le ultime 36 ore bastano per avere tutto «oggi» in ora italiana
  const da = new Date(Date.now() - 36 * 3600 * 1000).toISOString();

  const [risTimbrature, risControllo, risLavori] = await Promise.all([
    supabase
      .from("timbrature")
      .select("id, tipo, orario, origine, ricevuta_il, posizione, distanza_m, id_locale")
      .eq("dipendente_id", dipendente)
      .eq("attivo", true)
      .gte("orario", da)
      .order("orario")
      .order("ricevuta_il"),
    supabase.rpc("controllo_posizione_attivo"),
    supabase
      .from("programma")
      .select("id, dalle, alle, titolo, macchina, commessa_numero, stato_lavoro")
      .eq("giorno", oggi)
      .eq("dipendente_id", dipendente)
      .order("dalle"),
  ]);

  if (risTimbrature.error) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
        Non riesco a leggere le timbrature. Se è la prima volta, manca la migrazione 0013 sul database.
      </p>
    );
  }

  const timbrature = ((risTimbrature.data ?? []) as (Timbratura & { id_locale: string | null })[]).filter((t) => giornoRoma(t.orario) === oggi);
  const lavori = (risLavori.data ?? []) as LavoroOggi[];

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <PulsantiTimbra dipendente={dipendente} timbrature={timbrature} controllo={risControllo.data === true} />

      <section className={`${riquadro} p-4`}>
        <h2 className="mb-2 text-sm font-semibold">Oggi</h2>
        {timbrature.length === 0 ? (
          <p className="text-sm text-slate-500">Nessuna timbratura.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {timbrature.map((t) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2">
                <span>{ETICHETTE_TIMBRATURA[t.tipo]}</span>
                <span className="flex flex-wrap items-baseline gap-2">
                  {t.posizione === "fuori_zona" && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-900">fuori zona · {distanzaTesto(t.distanza_m)}</span>
                  )}
                  {t.posizione === "non_disponibile" && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">senza posizione</span>
                  )}
                  {t.origine === "ufficio" && <span className="text-xs text-slate-500">corretta dall&apos;ufficio</span>}
                  <strong className="tabular-nums">{oraRoma(t.orario)}</strong>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">Una timbratura sbagliata la corregge l&apos;ufficio: avvisalo.</p>
      </section>

      <section className={`${riquadro} p-4`}>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">I miei lavori di oggi</h2>
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
                <span className="tabular-nums text-slate-600">{ora(l.dalle)}–{ora(l.alle)}</span>
                <span className="flex-1">
                  {l.titolo}
                  <span className="text-slate-500">
                    {l.macchina ? ` · ${l.macchina}` : ""}
                    {l.commessa_numero ? ` · ${l.commessa_numero}` : ""}
                  </span>
                </span>
                {l.stato_lavoro === "finito" && <span className="text-xs font-semibold text-green-800">finito</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
