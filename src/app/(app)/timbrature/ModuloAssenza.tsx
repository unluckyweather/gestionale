"use client";
// Modulo delle assenze: ferie e malattia a giorni, permesso a ore.
//   - titolare: «Nuova assenza» per qualsiasi persona (nasce approvata);
//   - richiesta (tutti gli altri collegati a un dipendente): «Chiedi ferie o
//     permesso» per sé, senza malattia; la decide il titolare (0012).
import { useState } from "react";
import { campo, etichetta, pulsante, riquadro } from "../anagrafiche/stile";
import { chiediAssenza, salvaAssenza } from "./azioni";

type Persona = { id: string; nome_completo: string };
type Tipo = "ferie" | "permesso" | "malattia";

const TIPI: { valore: Tipo; etichetta: string }[] = [
  { valore: "ferie", etichetta: "Ferie" },
  { valore: "permesso", etichetta: "Permesso" },
  { valore: "malattia", etichetta: "Malattia" },
];

type Props = { oggi: string; settimana: string } & ({ richiesta?: false; persone: Persona[] } | { richiesta: true });

export default function ModuloAssenza(props: Props) {
  const { oggi, settimana } = props;
  const [tipo, setTipo] = useState<Tipo>("ferie");
  const aOre = tipo === "permesso";
  const titolo = props.richiesta ? "Chiedi ferie o permesso" : "Nuova assenza";
  const tipi = props.richiesta ? TIPI.filter((t) => t.valore !== "malattia") : TIPI;

  return (
    <section aria-label={titolo} className={`${riquadro} flex flex-col gap-4 p-4`}>
      <h2 className="font-semibold">{titolo}</h2>
      <form action={props.richiesta ? chiediAssenza : salvaAssenza} className="flex flex-col gap-4">
        <input type="hidden" name="settimana" value={settimana} />
        <input type="hidden" name="tipo" value={tipo} />
        {!props.richiesta && (
          <label className={etichetta}>
            Persona
            <select name="dipendente_id" required defaultValue="" className={campo}>
              <option value="" disabled>Scegli…</option>
              {props.persone.map((p) => (
                <option key={p.id} value={p.id}>{p.nome_completo}</option>
              ))}
            </select>
          </label>
        )}

        <div role="radiogroup" aria-label="Tipo di assenza" className="flex gap-1 rounded-xl bg-slate-200 p-1">
          {tipi.map((t) => (
            <button
              key={t.valore}
              type="button"
              role="radio"
              aria-checked={tipo === t.valore}
              onClick={() => setTipo(t.valore)}
              className={`min-h-10 flex-1 rounded-lg text-sm font-semibold ${
                tipo === t.valore ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"
              }`}
            >
              {t.etichetta}
            </button>
          ))}
        </div>

        {aOre ? (
          <div className="grid grid-cols-3 gap-3">
            <label className={etichetta}>
              Giorno
              <input type="date" name="giorno" required defaultValue={oggi} className={campo} />
            </label>
            <label className={etichetta}>
              Dalle
              <input type="time" name="dalle" defaultValue="08:00" className={campo} />
            </label>
            <label className={etichetta}>
              Alle
              <input type="time" name="alle" defaultValue="10:00" className={campo} />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <label className={etichetta}>
              Dal
              <input type="date" name="dal" required defaultValue={oggi} className={campo} />
            </label>
            <label className={etichetta}>
              Al (compreso)
              <input type="date" name="al" className={campo} />
            </label>
          </div>
        )}
        {aOre && <p className="-mt-2 text-xs text-slate-500">Ore vuote = permesso per tutto il giorno.</p>}
        {!aOre && <p className="-mt-2 text-xs text-slate-500">«Al» vuoto = un giorno solo.</p>}

        <label className={etichetta}>
          Note
          <input name="note" placeholder={props.richiesta ? "facoltative, le legge il titolare" : "facoltative"} className={campo} />
        </label>
        {props.richiesta ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            La richiesta va al titolare. Finché non la approva, nel programma risulti presente. Per la malattia avvisa il titolare.
          </p>
        ) : (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Nel programma del giorno questa persona risulterà assente. {tipo === "malattia" && "Il motivo «malattia» lo vedete solo tu e la persona: agli altri compare «assente»."}
          </p>
        )}
        <button className={pulsante}>{props.richiesta ? "Invia la richiesta" : "Salva assenza"}</button>
      </form>
    </section>
  );
}
