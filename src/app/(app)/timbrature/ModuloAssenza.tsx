"use client";
// Modulo «Nuova assenza» (solo titolare): ferie e malattia a giorni, permesso a ore.
import { useState } from "react";
import { campo, etichetta, pulsante, riquadro } from "../anagrafiche/stile";
import { salvaAssenza } from "./azioni";

type Persona = { id: string; nome_completo: string };
type Tipo = "ferie" | "permesso" | "malattia";

const TIPI: { valore: Tipo; etichetta: string }[] = [
  { valore: "ferie", etichetta: "Ferie" },
  { valore: "permesso", etichetta: "Permesso" },
  { valore: "malattia", etichetta: "Malattia" },
];

export default function ModuloAssenza({ persone, oggi, settimana }: { persone: Persona[]; oggi: string; settimana: string }) {
  const [tipo, setTipo] = useState<Tipo>("ferie");
  const aOre = tipo === "permesso";

  return (
    <section aria-label="Nuova assenza" className={`${riquadro} flex flex-col gap-4 p-4`}>
      <h2 className="font-semibold">Nuova assenza</h2>
      <form action={salvaAssenza} className="flex flex-col gap-4">
        <input type="hidden" name="settimana" value={settimana} />
        <input type="hidden" name="tipo" value={tipo} />
        <label className={etichetta}>
          Persona
          <select name="dipendente_id" required defaultValue="" className={campo}>
            <option value="" disabled>Scegli…</option>
            {persone.map((p) => (
              <option key={p.id} value={p.id}>{p.nome_completo}</option>
            ))}
          </select>
        </label>

        <div role="radiogroup" aria-label="Tipo di assenza" className="flex gap-1 rounded-xl bg-slate-200 p-1">
          {TIPI.map((t) => (
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
          <input name="note" placeholder="facoltative" className={campo} />
        </label>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Nel programma del giorno questa persona risulterà assente. {tipo === "malattia" && "Il motivo «malattia» lo vedete solo tu e la persona: agli altri compare «assente»."}
        </p>
        <button className={pulsante}>Salva assenza</button>
      </form>
    </section>
  );
}
