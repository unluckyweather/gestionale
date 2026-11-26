// Presenze → «Correggi» (titolare e ufficio): tutte le timbrature di una persona in un
// giorno, anche quelle annullate (barrate, con il motivo e chi l'ha fatto), con
// «Annulla» e il modulo «Aggiungi una timbratura». Indirizzo: …&correggi=<dipendente>
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { spostaGiorno } from "@/lib/programma";
import { distanzaTesto, ETICHETTE_TIMBRATURA, giornoRoma, oraRoma, statoDopo, TIPI_TIMBRATURA, type TipoTimbratura } from "@/lib/timbrature";
import { campo, etichetta, pulsante } from "../anagrafiche/stile";
import { aggiungiTimbratura, annullaTimbratura } from "./azioniCorrezioni";

type Riga = {
  id: string;
  tipo: TipoTimbratura;
  orario: string;
  origine: "telefono" | "ufficio";
  ricevuta_il: string;
  posizione: string | null;
  distanza_m: number | null;
  motivo: string | null;
  annullata_motivo: string | null;
  attivo: boolean;
  aggiornato_il: string;
  creatore: { nome_visualizzato: string } | null;
  modificatore: { nome_visualizzato: string } | null;
};

/** Cosa proporre nel modulo: la timbratura che di solito manca dopo l'ultima */
function proposta(ultima: TipoTimbratura | undefined): TipoTimbratura {
  const s = statoDopo(ultima);
  return s === "dentro" ? "uscita" : s === "pausa" ? "fine_pausa" : "entrata";
}

export default async function PannelloCorrezioni({ dipendente, nome, giorno }: { dipendente: string; nome: string; giorno: string }) {
  const supabase = await creaClientServer();
  const da = new Date(`${spostaGiorno(giorno, -1)}T00:00:00Z`).toISOString();
  const a = new Date(`${spostaGiorno(giorno, 2)}T00:00:00Z`).toISOString();
  const { data, error } = await supabase
    .from("timbrature")
    .select(
      "id, tipo, orario, origine, ricevuta_il, posizione, distanza_m, motivo, annullata_motivo, attivo, aggiornato_il, " +
        "creatore:profili!timbrature_creato_da_fkey(nome_visualizzato), modificatore:profili!timbrature_aggiornato_da_fkey(nome_visualizzato)"
    )
    .eq("dipendente_id", dipendente)
    .gte("orario", da)
    .lt("orario", a)
    .order("orario")
    .order("ricevuta_il");
  if (error) return <p role="alert" className="text-sm text-red-800">Non riesco a leggere le timbrature di {nome}.</p>;

  const righe = ((data ?? []) as unknown as Riga[]).filter((t) => giornoRoma(t.orario) === giorno);
  const attive = righe.filter((t) => t.attivo);
  const chiudi = `/timbrature?scheda=presenze&giorno=${giorno}`;

  return (
    <div className="flex flex-col gap-4 rounded-xl border-2 border-blue-200 bg-blue-50/40 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Correggi le timbrature di {nome}</h3>
        <Link href={chiudi} className="text-sm font-semibold text-blue-700 hover:underline">Chiudi</Link>
      </div>

      {righe.length === 0 ? (
        <p className="text-sm text-slate-600">Nessuna timbratura in questo giorno.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
          {righe.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-3 py-2">
              <div className={`min-w-44 ${t.attivo ? "" : "text-slate-400 line-through"}`}>
                <span className="font-semibold tabular-nums">{oraRoma(t.orario)}</span> {ETICHETTE_TIMBRATURA[t.tipo]}
              </div>
              <div className="flex-1 text-xs text-slate-600">
                {t.origine === "ufficio" ? (
                  <>aggiunta da {t.creatore?.nome_visualizzato ?? "?"}: «{t.motivo}»</>
                ) : (
                  <>
                    dal telefono
                    {t.posizione === "in_zona" && " · in zona"}
                    {t.posizione === "fuori_zona" && ` · fuori zona ${distanzaTesto(t.distanza_m)}`}
                    {t.posizione === "non_disponibile" && " · senza posizione"}
                    {new Date(t.ricevuta_il).getTime() - new Date(t.orario).getTime() > 600000 && ` · arrivata alle ${oraRoma(t.ricevuta_il)} (senza rete)`}
                  </>
                )}
                {!t.attivo && (
                  <div className="text-red-800">
                    annullata da {t.modificatore?.nome_visualizzato ?? "?"} il {new Date(t.aggiornato_il).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} alle {oraRoma(t.aggiornato_il)}: «{t.annullata_motivo}»
                  </div>
                )}
              </div>
              {t.attivo && (
                <form action={annullaTimbratura} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="dipendente_id" value={dipendente} />
                  <input type="hidden" name="giorno" value={giorno} />
                  <label className="sr-only" htmlFor={`motivo-${t.id}`}>Motivo dell&apos;annullamento</label>
                  <input id={`motivo-${t.id}`} name="annullata_motivo" required placeholder="Motivo (es. timbrata due volte)" className={`${campo} w-56`} />
                  <button className="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800 hover:bg-red-50">Annulla</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* key: dopo ogni correzione il modulo riparte con la nuova proposta */}
      <form key={`${attive.length}-${attive.at(-1)?.id ?? ""}`} action={aggiungiTimbratura} className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <input type="hidden" name="dipendente_id" value={dipendente} />
        <input type="hidden" name="giorno" value={giorno} />
        <div className="w-full text-sm font-semibold">Aggiungi una timbratura dimenticata</div>
        <label className={`${etichetta} w-40`}>
          Tipo
          <select name="tipo" defaultValue={proposta(attive.at(-1)?.tipo)} className={campo}>
            {TIPI_TIMBRATURA.map((x) => (
              <option key={x} value={x}>{ETICHETTE_TIMBRATURA[x]}</option>
            ))}
          </select>
        </label>
        <label className={`${etichetta} w-28`}>
          Ora
          <input type="time" name="ora" required className={campo} />
        </label>
        <label className={`${etichetta} min-w-60 flex-1`}>
          Motivo *
          <input name="motivo" required placeholder="es. dimenticata l'uscita, telefono scarico" className={campo} />
        </label>
        <button className={pulsante}>Aggiungi</button>
      </form>
      <p className="text-xs text-slate-500">
        Una timbratura non si modifica: per cambiare un&apos;ora, annulla quella sbagliata e aggiungi quella giusta. Ogni
        correzione resta registrata con chi l&apos;ha fatta e il motivo.
      </p>
    </div>
  );
}
