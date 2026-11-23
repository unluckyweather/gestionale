"use client";
// Registra un movimento per l'articolo scelto: carico (+), scarico (−)
// oppure inventario (si scrive la quantità contata). Li registrano tutti, anche gli operai.
import { useActionState, useState } from "react";
import { registraMovimento, type StatoMovimento } from "./azioni";
import { campo, etichetta, pulsante } from "../anagrafiche/stile";
import { quantitaConUnita, unita as unitaPlurale } from "@/lib/magazzino";

type Props = {
  articoloId: string;
  unita: string;
  giacenza: number;
  oggi: string; // "2026-11-23"
  inventario: boolean; // può registrare l'inventario (rettifica)?
};

const TIPI = [
  { valore: "carico", etichetta: "Carico", spiega: "Materiale entrato in magazzino" },
  { valore: "scarico", etichetta: "Scarico", spiega: "Materiale usato o uscito" },
  { valore: "rettifica", etichetta: "Inventario", spiega: "Scrivi quanto ce n'è davvero" },
];

export default function ModuloMovimento({ articoloId, unita, giacenza, oggi, inventario }: Props) {
  const [stato, azione, inCorso] = useActionState<StatoMovimento, FormData>(registraMovimento, {});
  const [tipo, setTipo] = useState(stato.valori?.tipo ?? "scarico");
  const v = (nome: string, iniziale = "") => stato.valori?.[nome] ?? iniziale;
  const tipi = TIPI.filter((t) => inventario || t.valore !== "rettifica");

  return (
    <form action={azione} noValidate className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-slate-700">Registra un movimento</h3>
      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{stato.errore}</p>
      )}
      <input type="hidden" name="articolo_id" value={articoloId} />

      <fieldset disabled={inCorso} className="flex flex-col gap-3">
        <legend className="sr-only">Tipo di movimento</legend>
        <div className={`grid gap-2 ${tipi.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tipi.map((t) => (
            <label
              key={t.valore}
              className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-3 py-2 text-sm ${
                tipo === t.valore ? "border-blue-600 bg-blue-50 font-semibold text-blue-900" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              <input
                type="radio"
                name="tipo"
                value={t.valore}
                checked={tipo === t.valore}
                onChange={() => setTipo(t.valore)}
                className="sr-only"
              />
              {t.etichetta}
              <span className="text-xs font-normal text-slate-500">{t.spiega}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className={etichetta}>
            {tipo === "rettifica" ? `Quantità contata (${unitaPlurale(unita, 2)})` : `Quantità (${unitaPlurale(unita, 2)})`}
            <input
              name="quantita"
              inputMode="decimal"
              required
              defaultValue={v("quantita")}
              placeholder={tipo === "rettifica" ? "es. 12" : "es. 20"}
              className={campo}
            />
          </label>
          <label className={etichetta}>
            Data
            <input type="date" name="data" max={oggi} defaultValue={v("data", oggi)} className={campo} />
          </label>
        </div>
        {tipo === "rettifica" && (
          <p className="-mt-1 text-xs text-slate-500">
            Oggi risultano {quantitaConUnita(giacenza, unita)}: la differenza diventa un movimento di rettifica.
            Serve anche per la quantità iniziale.
          </p>
        )}
        <label className={etichetta}>
          Note
          <input
            name="note"
            defaultValue={v("note")}
            placeholder={tipo === "scarico" ? "es. commessa, cliente, lavoro" : "facoltative"}
            className={campo}
          />
        </label>
        <button className={pulsante} disabled={inCorso}>
          {inCorso ? "Registrazione…" : "Registra"}
        </button>
      </fieldset>
    </form>
  );
}
