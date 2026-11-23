"use client";
// Scheda di un articolo del catalogo: ciò che acquistiamo, con il suo costo.
// (Il campo "tipo" del database non si mostra più: gli articoli nuovi restano "articolo".)
// Non è un listino di vendita: il costo serve ai preventivi a fasi (costo + ricarico).
import { useActionState } from "react";
import Link from "next/link";
import GiacenzaBadge from "@/components/Giacenza";
import { salvaArticolo, type StatoModulo } from "./azioni";
import { campo, etichetta, pulsante, pulsanteSecondario } from "./stile";
import { numeroPerCampo } from "@/lib/validazioni";
import { quantitaConUnita } from "@/lib/magazzino";
import { UNITA_MISURA, type Articolo, type Categoria, type CodiceIva, type Giacenza } from "./tipi";

type Fornitore = { id: string; denominazione: string; attivo: boolean };

type Props = {
  articolo: Articolo | null; // null = nuovo
  giacenza: Giacenza | null; // dalla vista "magazzino"
  codiciIva: CodiceIva[];
  fornitori: Fornitore[];
  categorie: Categoria[];
  modificabile: boolean;
};

export default function ModuloArticolo({ articolo, giacenza, codiciIva, fornitori, categorie, modificabile }: Props) {
  const [stato, azione, inCorso] = useActionState<StatoModulo, FormData>(salvaArticolo, {});

  const v = (nome: string, salvato: string): string => (stato.valori ? (stato.valori[nome] ?? "") : salvato);
  const attivo = stato.valori ? stato.valori.attivo === "on" : (articolo?.attivo ?? true);

  // nelle tendine: le voci attive, più quella già scelta anche se archiviata
  const ivaVisibili = codiciIva.filter((c) => c.attivo || c.id === articolo?.codice_iva_id);
  const fornitoriVisibili = fornitori.filter((f) => f.attivo || f.id === articolo?.fornitore_id);
  const categorieVisibili = categorie.filter((c) => c.attivo || c.id === articolo?.categoria_id);
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

      {articolo && giacenza && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <span>
            In magazzino:{" "}
            <strong>
              <GiacenzaBadge giacenza={giacenza.giacenza} unita={giacenza.unita} sottoScorta={giacenza.sotto_scorta} />
            </strong>
          </span>
          {Number(giacenza.in_arrivo) > 0 && (
            <span className="text-slate-500">in arrivo {quantitaConUnita(giacenza.in_arrivo, giacenza.unita)}</span>
          )}
          <Link href={`/magazzino?id=${articolo.id}`} className="ml-auto text-blue-700 hover:underline">
            Movimenti →
          </Link>
        </div>
      )}
      {articolo && articolo.attivo && modificabile && (
        <Link
          href={`/magazzino?scheda=ordini&id=nuovo&articolo=${articolo.id}`}
          className={`${pulsanteSecondario} justify-center`}
        >
          + Ordina al fornitore
        </Link>
      )}

      <input type="hidden" name="id" value={articolo?.id ?? ""} />

      <fieldset disabled={!modificabile || inCorso} className="grid grid-cols-2 gap-3">
        <label className={`${etichetta} col-span-2`}>
          Codice
          <input name="codice" defaultValue={v("codice", articolo?.codice ?? "")} placeholder="facoltativo" className={campo} />
        </label>
        <label className={`${etichetta} col-span-2`}>
          Descrizione *
          <input name="descrizione" defaultValue={v("descrizione", articolo?.descrizione ?? "")} required className={campo} />
        </label>
        <label className={`${etichetta} col-span-2`}>
          Categoria merceologica
          <select name="categoria_id" defaultValue={v("categoria_id", articolo?.categoria_id ?? "")} className={campo}>
            <option value="">— nessuna —</option>
            {categorieVisibili.map((c) => (
              <option key={c.id} value={c.id}>{c.descrizione}{c.attivo ? "" : " (archiviata)"}</option>
            ))}
          </select>
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
          Lunghezza bobina (m)
          <input
            name="bobina_lunghezza_m"
            inputMode="decimal"
            defaultValue={v("bobina_lunghezza_m", articolo?.bobina_lunghezza_m ? numeroPerCampo(articolo.bobina_lunghezza_m) : "")}
            placeholder="es. 50"
            className={campo}
          />
        </label>
        <p className="col-span-2 -mt-1 self-end text-xs text-slate-500">
          Per i materiali in bobina, nei preventivi: m² = larghezza bobina × metri lineari. In magazzino e negli ordini si
          contano le <strong>bobine intere</strong>: con la lunghezza, il costo di una bobina si calcola da solo.
        </p>
        <label className={etichetta}>
          Lastra: larghezza (cm)
          <input
            name="lastra_larghezza_cm"
            inputMode="decimal"
            defaultValue={v("lastra_larghezza_cm", articolo?.lastra_larghezza_cm ? String(articolo.lastra_larghezza_cm).replace(".", ",") : "")}
            placeholder="solo materiali a lastra"
            className={campo}
          />
        </label>
        <label className={etichetta}>
          Lastra: altezza (cm)
          <input
            name="lastra_altezza_cm"
            inputMode="decimal"
            defaultValue={v("lastra_altezza_cm", articolo?.lastra_altezza_cm ? String(articolo.lastra_altezza_cm).replace(".", ",") : "")}
            placeholder="es. 205"
            className={campo}
          />
        </label>
        <p className="col-span-2 -mt-1 text-xs text-slate-500">
          Per i materiali a lastra (es. 305 × 205 cm) il costo unitario è il <strong>prezzo della lastra intera</strong> e
          l&apos;unità di misura «lastra». Nei preventivi si calcola quante lastre servono per i pezzi, oppure i soli m² usati.
          Un articolo è in bobina oppure a lastra, non tutte e due.
        </p>
        <label className={`${etichetta} col-span-2`}>
          Scorta minima
          <input
            name="scorta_minima"
            inputMode="decimal"
            defaultValue={v("scorta_minima", articolo?.scorta_minima != null ? String(articolo.scorta_minima).replace(".", ",") : "")}
            placeholder="facoltativa: sotto questa quantità compare l'avviso"
            className={campo}
          />
        </label>
        <p className="col-span-2 -mt-1 text-xs text-slate-500">
          In <strong>lastre</strong> per i materiali a lastra, in <strong>bobine</strong> per quelli in bobina, altrimenti
          nell&apos;unità di misura dell&apos;articolo.
        </p>
        <label className={`${etichetta} col-span-2`}>
          Codice IVA
          <select name="codice_iva_id" defaultValue={v("codice_iva_id", articolo?.codice_iva_id ?? iva22)} className={campo}>
            {ivaVisibili.map((c) => (
              <option key={c.id} value={c.id}>{c.codice} – {c.descrizione}</option>
            ))}
          </select>
        </label>
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
