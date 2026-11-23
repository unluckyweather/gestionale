// Storico modifiche di un cliente/fornitore: righe del registro_modifiche della scheda
// e delle sue righe collegate (contatti, sedi, dichiarazioni d'intento, categorie merceologiche).
// Il registro lo legge solo il titolare (regola RLS di 0001).
import { creaClientServer } from "@/lib/supabase/server";
import { dataOra } from "./dati";
import { riquadro } from "./stile";

type Voce = {
  id: string;
  tabella: string;
  azione: "creazione" | "modifica" | "archiviazione";
  quando: string;
  prima: Record<string, unknown> | null;
  dopo: Record<string, unknown> | null;
  autore: { nome_visualizzato: string } | null;
};

const PARTE: Record<string, string> = {
  soggetti: "Scheda",
  contatti_soggetto: "Contatto",
  sedi_soggetto: "Sede",
  dichiarazioni_intento: "Dichiarazione d'intento",
  fornitori_categorie: "Categoria merceologica",
};

const AZIONE: Record<Voce["azione"], string> = {
  creazione: "creato",
  modifica: "modificato",
  archiviazione: "archiviato",
};

// campi tecnici da non elencare tra quelli cambiati
const IGNORATI = new Set(["aggiornato_il", "aggiornato_da", "denominazione"]);

function campiCambiati(v: Voce): string[] {
  if (v.azione !== "modifica" || !v.prima || !v.dopo) return [];
  return Object.keys(v.dopo).filter(
    (k) => !IGNORATI.has(k) && JSON.stringify(v.prima![k]) !== JSON.stringify(v.dopo![k])
  );
}

/** Breve descrizione della riga (per contatti e sedi), es. "Mario Rossi" o "Magazzino". */
function descrizioneRiga(v: Voce): string {
  const r = v.dopo ?? {};
  const testo = [r.persona, r.riferimento, r.email, r.nome, r.comune, r.protocollo].find(
    (x) => typeof x === "string" && x
  );
  return typeof testo === "string" ? ` «${testo}»` : "";
}

export default async function StoricoModifiche({ soggettoId }: { soggettoId: string }) {
  const supabase = await creaClientServer();
  const { data, error } = await supabase
    .from("registro_modifiche")
    .select("id, tabella, azione, quando, prima, dopo, autore:profili(nome_visualizzato)")
    .in("tabella", Object.keys(PARTE))
    .or(`record_id.eq.${soggettoId},dopo->>soggetto_id.eq.${soggettoId}`)
    .order("quando", { ascending: false })
    .limit(100);
  const voci = (data ?? []) as unknown as Voce[];

  return (
    <section id="storico" aria-label="Storico modifiche" className={`${riquadro} min-w-0`}>
      <div className="border-b border-slate-200 p-4">
        <h3 className="font-semibold">Storico modifiche</h3>
        <p className="mt-1 text-sm text-slate-500">Ultime 100 modifiche alla scheda e alle sue righe (contatti, sedi, dichiarazioni).</p>
      </div>
      {error ? (
        <p className="p-4 text-sm text-red-700">Impossibile leggere lo storico.</p>
      ) : voci.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessuna modifica registrata.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {voci.map((v) => {
            const cambiati = campiCambiati(v);
            return (
              <li key={v.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="w-32 shrink-0 text-slate-500">{dataOra(v.quando)}</span>
                <span className="min-w-0 flex-1">
                  <strong className="font-semibold">
                    {PARTE[v.tabella] ?? v.tabella}
                    {v.tabella === "soggetti" ? "" : descrizioneRiga(v)}
                  </strong>{" "}
                  {AZIONE[v.azione]}
                  {v.autore?.nome_visualizzato ? ` da ${v.autore.nome_visualizzato}` : ""}
                  {cambiati.length > 0 && (
                    <span className="block text-xs text-slate-500">Campi cambiati: {cambiati.join(", ").replaceAll("_", " ")}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
