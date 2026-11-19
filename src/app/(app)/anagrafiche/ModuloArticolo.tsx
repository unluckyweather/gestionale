"use client";
// Scheda di un articolo del catalogo materiali (con costo d'acquisto), lavorazione o servizio.
// Non è un listino di vendita: il costo serve ai preventivi a fasi (costo + ricarico).
import { useActionState } from "react";
import { salvaArticolo, type StatoModulo } from "./azioni";
import { campo, etichetta, pulsante } from "./stile";
import { numeroPerCampo } from "@/lib/validazioni";
import {
  ETICHETTE_TIPO_ARTICOLO,
  UNITA_MISURA,
  type Articolo,
  type CodiceIva,
  type TipoArticolo,
} from "./tipi";

type Fornitore = { id: string; denominazione: string; attivo: boolean };

type Props = {
  articolo: Articolo | null; // null = nuovo
  codiciIva: CodiceIva[];
  fornitori: Fornitore[];
  modificabile: boolean;
};

export default function ModuloArticolo({ articolo, codiciIva, fornitori, modificabile }: Props) {
  const [stato, azione, inCorso] = useActionState<StatoModulo, FormData>(salvaArticolo, {});

  const v = (nome: string, salvato: string): string => (stato.valori ? (stato.valori[nome] ?? "") : salvato);
  const attivo = stato.valori ? stato.valori.attivo === "on" : (articolo?.attivo ?? true);

  // nelle tendine: le voci attive, più quella già scelta anche se archiviata
  const ivaVisibili = codiciIva.filter((c) => c.attivo || c.id === articolo?.codice_iva_id);
  const fornitoriVisibili = fornitori.filter((f) => f.attivo || f.id === articolo?.fornitore_id);
  const iva22 = codiciIva.find((c) => c.codice === "22" && c.attivo)?.id ?? "";

  return (
    <form action={azione} noValidate className="flex flex-col gap-4 p-5">
      <h2 className="text-lg font-semibold">{articolo ? articolo.descrizione : "Nuovo articolo"}</h2>

      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>
      )}
      {!modificabile && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">Sola lettura per il tuo ruolo.</p>
      )}

      <input type="hidden" name="id" value={articolo?.id ?? ""} />

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
          Unità di misura *
          <input
            name="unita_misura"
            list="unita-misura"
            defaultValue={v("unita_misura", articolo?.unita_misura ?? "pz")}
            required
            className={campo}
          />
          <datalist id="unita-misura">
            {UNITA_MISURA.map((u) => <option key={u} value={u} />)}
          </datalist>
        </label>
        <label className={etichetta}>
          Costo unitario (€, IVA esclusa)
          <input
            name="costo_unitario"
            inputMode="decimal"
            defaultValue={v("costo_unitario", numeroPerCampo(articolo?.costo_unitario ?? 0))}
            className={campo}
          />
        </label>
        <p className="col-span-2 -mt-1 text-xs text-slate-500">Fino a 4 decimali, es. 0,035 per costi al pezzo molto bassi.</p>
        <label className={etichetta}>
          Larghezza bobina (m)
          <input
            name="larghezza_bobina_m"
            inputMode="decimal"
            defaultValue={v("larghezza_bobina_m", articolo?.larghezza_bobina_m ? numeroPerCampo(articolo.larghezza_bobina_m) : "")}
            placeholder="solo materiali in bobina"
            className={campo}
          />
        </label>
        <label className={etichetta}>
          Codice IVA
          <select name="codice_iva_id" defaultValue={v("codice_iva_id", articolo?.codice_iva_id ?? iva22)} className={campo}>
            {ivaVisibili.map((c) => (
              <option key={c.id} value={c.id}>{c.codice} – {c.descrizione}</option>
            ))}
          </select>
        </label>
        <p className="col-span-2 -mt-1 text-xs text-slate-500">
          Per i materiali in bobina, nei preventivi: m² = larghezza bobina × metri lineari.
        </p>
        <label className={`${etichetta} col-span-2`}>
          Fornitore abituale
          <select name="fornitore_id" defaultValue={v("fornitore_id", articolo?.fornitore_id ?? "")} className={campo}>
            <option value="">— nessuno —</option>
            {fornitoriVisibili.map((f) => (
              <option key={f.id} value={f.id}>{f.denominazione}{f.attivo ? "" : " (archiviato)"}</option>
            ))}
          </select>
        </label>
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
