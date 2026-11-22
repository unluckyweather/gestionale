"use client";
// Finestra di conferma disegnata dentro la pagina (elemento <dialog>).
// Sostituisce window.confirm/prompt, che alcuni browser (es. quello integrato nell'app Claude)
// non mostrano: rispondono "Annulla" da soli e l'azione non parte mai.
//
// Uso:  const { chiedi, chiediScelta, chiediTesto, finestra } = useConferma();
//       if (await chiedi("Archiviare il preventivo?", "Archivia")) { … }                → sì / no
//       const s = await chiediScelta("Costi?", [{ valore: "a", etichetta: "…" }, …]);   → valore o null
//       const nome = await chiediTesto("Nome del modello", { iniziale: "…" });          → testo o null
//       … e nel JSX: {finestra}
import { useRef, useState } from "react";

type Scelta = { valore: string; etichetta: string; descrizione?: string };
type Domanda = { testo: string; scelte: Scelta[]; campo?: { etichetta: string; iniziale: string } };

export function useConferma() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const risposta = useRef<((valore: string | null) => void) | null>(null);
  const [domanda, setDomanda] = useState<Domanda>({ testo: "", scelte: [] });
  const [scritto, setScritto] = useState("");

  function apri(d: Domanda): Promise<string | null> {
    risposta.current?.(null); // una domanda precedente rimasta aperta vale "Annulla"
    setDomanda(d);
    setScritto(d.campo?.iniziale ?? "");
    dialogo.current?.showModal();
    return new Promise((risolvi) => (risposta.current = risolvi));
  }

  function chiudi(valore: string | null) {
    if (dialogo.current?.open) dialogo.current.close();
    risposta.current?.(valore);
    risposta.current = null;
  }

  /** Sì / no. */
  const chiedi = async (testo: string, conferma = "Conferma") =>
    (await apri({ testo, scelte: [{ valore: "si", etichetta: conferma }] })) === "si";

  /** Più risposte possibili: restituisce il valore scelto, o null per "Annulla". */
  const chiediScelta = (testo: string, scelte: Scelta[]) => apri({ testo, scelte });

  /** Un testo da scrivere (es. un nome): restituisce il testo, o null per "Annulla". */
  async function chiediTesto(testo: string, opzioni: { etichetta?: string; iniziale?: string; conferma?: string } = {}) {
    const r = await apri({
      testo,
      scelte: [{ valore: "ok", etichetta: opzioni.conferma ?? "Conferma" }],
      campo: { etichetta: opzioni.etichetta ?? testo, iniziale: opzioni.iniziale ?? "" },
    });
    return r === "ok" ? scrittoRef.current.trim() : null;
  }
  // il testo scritto, letto alla chiusura (lo stato React arriverebbe in ritardo)
  const scrittoRef = useRef("");
  scrittoRef.current = scritto;

  const piuScelte = domanda.scelte.length > 1;
  const finestra = (
    <dialog
      ref={dialogo}
      onCancel={() => chiudi(null)} // tasto Esc
      onClick={(e) => e.target === dialogo.current && chiudi(null)} // clic fuori dal riquadro
      aria-labelledby="testo-conferma"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <form
        method="dialog"
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          // Invio nel campo di testo = conferma
          e.preventDefault();
          if (domanda.campo && scritto.trim()) chiudi(domanda.scelte[0]?.valore ?? null);
        }}
      >
        <p id="testo-conferma" className="text-sm text-slate-800">{domanda.testo}</p>
        {domanda.campo && (
          <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
            {domanda.campo.etichetta}
            <input
              autoFocus
              value={scritto}
              onChange={(e) => setScritto(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 focus:outline-none"
            />
          </label>
        )}
        <div className={piuScelte ? "flex flex-col gap-2" : "flex flex-wrap justify-end gap-2"}>
          {domanda.scelte.map((s, i) => (
            <button
              key={s.valore}
              type="button"
              disabled={Boolean(domanda.campo) && !scritto.trim()}
              onClick={() => chiudi(s.valore)}
              className={
                piuScelte
                  ? `flex min-h-11 flex-col items-start rounded-lg border px-4 py-2 text-left text-sm font-semibold ${
                      i === 0 ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    }`
                  : "order-last min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              }
            >
              {s.etichetta}
              {s.descrizione && <span className={`text-xs font-normal ${i === 0 ? "text-blue-100" : "text-slate-500"}`}>{s.descrizione}</span>}
            </button>
          ))}
          <button
            type="button"
            autoFocus={!domanda.campo}
            onClick={() => chiudi(null)}
            className={`min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${piuScelte ? "self-end" : ""}`}
          >
            Annulla
          </button>
        </div>
      </form>
    </dialog>
  );

  return { chiedi, chiediScelta, chiediTesto, finestra };
}
