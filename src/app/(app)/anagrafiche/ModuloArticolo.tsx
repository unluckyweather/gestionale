"use client";
// Scheda di un articolo, lavorazione o servizio, con i prezzi per listino.
import { useActionState } from "react";
import { salvaArticolo, type StatoModulo } from "./azioni";
import { campo, etichetta, pulsante } from "./stile";
import { euro, numeroPerCampo } from "@/lib/validazioni";
import {
  ALIQUOTE_IVA,
  ETICHETTE_TIPO_ARTICOLO,
  type Articolo,
  type Listino,
  type PrezzoListino,
  type TipoArticolo,
} from "./tipi";

type Props = {
  articolo: Articolo | null; // null = nuovo
  listini: Listino[]; // solo quelli attivi
  prezzi: PrezzoListino[]; // prezzi attivi di questo articolo
  modificabile: boolean;
};

export default function ModuloArticolo({ articolo, listini, prezzi, modificabile }: Props) {
  const [stato, azione, inCorso] = useActionState<StatoModulo, FormData>(salvaArticolo, {});

  const v = (nome: string, salvato: string): string =>
    stato.valori ? (stato.valori[nome] ?? "") : salvato;

  const prezzoDi = (listinoId: string) => prezzi.find((p) => p.listino_id === listinoId)?.prezzo ?? null;
  const attivo = stato.valori ? stato.valori.attivo === "on" : (articolo?.attivo ?? true);
  // dopo un errore su un articolo nuovo già salvato, il server restituisce il suo id
  const id = stato.valori?.id || articolo?.id || "";

  return (
    <form action={azione} className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-semibold">{articolo ? articolo.descrizione : "Nuovo articolo"}</h2>

      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>
      )}
      {!modificabile && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Sola lettura per il tuo ruolo.</p>
      )}

      <input type="hidden" name="id" value={id} />

      <fieldset disabled={!modificabile || inCorso} className="grid grid-cols-2 gap-3">
        <label className={etichetta}>
          Codice
          <input name="codice" defaultValue={v("codice", articolo?.codice ?? "")} placeholder="facoltativo" className={campo} />
        </label>
        <label className={etichetta}>
          Tipo
          <select name="tipo" defaultValue={v("tipo", articolo?.tipo ?? "articolo")} className={campo}>
            {(Object.keys(ETICHETTE_TIPO_ARTICOLO) as TipoArticolo[]).map((t) => (
              <option key={t} value={t}>{ETICHETTE_TIPO_ARTICOLO[t]}</option>
            ))}
          </select>
        </label>
        <label className={`${etichetta} col-span-2`}>
          Descrizione *
          <input name="descrizione" defaultValue={v("descrizione", articolo?.descrizione ?? "")} required className={campo} />
        </label>
        <label className={etichetta}>
          Unità di misura
          <input name="unita_misura" defaultValue={v("unita_misura", articolo?.unita_misura ?? "pz")} required placeholder="pz, m, mq, h…" className={campo} />
        </label>
        <label className={etichetta}>
          Aliquota IVA
          <select name="aliquota_iva" defaultValue={v("aliquota_iva", String(articolo?.aliquota_iva ?? 22))} className={campo}>
            {ALIQUOTE_IVA.map((a) => (
              <option key={a} value={a}>{a}%</option>
            ))}
          </select>
        </label>
        <label className={`${etichetta} col-span-2`}>
          Prezzo base (€, IVA esclusa)
          <input
            name="prezzo_base"
            inputMode="decimal"
            defaultValue={v("prezzo_base", numeroPerCampo(articolo?.prezzo_base ?? 0))}
            className={campo}
          />
          <span className="font-normal text-slate-400">Fino a 4 decimali, es. 0,035 per prezzi al pezzo molto bassi.</span>
        </label>

        <h3 className="col-span-2 mt-2 text-sm font-semibold text-slate-700">Prezzi per listino</h3>
        {listini.length === 0 ? (
          <p className="col-span-2 text-sm text-slate-500">
            Nessun listino: i clienti pagano il prezzo base. I listini si creano in «Pagamenti e listini».
          </p>
        ) : (
          <>
            <p className="col-span-2 -mt-2 text-xs text-slate-500">Lascia vuoto per usare il prezzo base.</p>
            {listini.map((l) => (
              <label key={l.id} className={etichetta}>
                {l.nome}
                <input
                  name={`prezzo_${l.id}`}
                  inputMode="decimal"
                  defaultValue={v(`prezzo_${l.id}`, numeroPerCampo(prezzoDi(l.id)))}
                  placeholder={articolo ? euro(articolo.prezzo_base) : "prezzo base"}
                  className={campo}
                />
              </label>
            ))}
          </>
        )}

        <label className={`${etichetta} col-span-2`}>
          Note
          <textarea name="note" defaultValue={v("note", articolo?.note ?? "")} rows={2} className={campo} />
        </label>

        {articolo && (
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="attivo" defaultChecked={attivo} className="h-4 w-4" />
            Attivo (togli la spunta per archiviarlo)
          </label>
        )}
      </fieldset>

      {modificabile && (
        <button className={pulsante} disabled={inCorso}>
          {inCorso ? "Salvataggio…" : articolo ? "Salva modifiche" : "Aggiungi"}
        </button>
      )}
    </form>
  );
}
