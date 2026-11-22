"use client";
// Finestra di conferma disegnata dentro la pagina (elemento <dialog>).
// Sostituisce window.confirm, che alcuni browser (es. quello integrato nell'app Claude)
// non mostrano: rispondono "Annulla" da soli e l'azione non parte mai.
//
// Uso:  const { chiedi, finestra } = useConferma();
//       if (await chiedi("Archiviare il preventivo?", "Archivia")) { … }
//       … e nel JSX: {finestra}
import { useRef, useState } from "react";

export function useConferma() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const risposta = useRef<((si: boolean) => void) | null>(null);
  const [testo, setTesto] = useState("");
  const [pulsante, setPulsante] = useState("Conferma");

  function chiedi(domanda: string, conferma = "Conferma"): Promise<boolean> {
    risposta.current?.(false); // una domanda precedente rimasta aperta vale "Annulla"
    setTesto(domanda);
    setPulsante(conferma);
    dialogo.current?.showModal();
    return new Promise((risolvi) => (risposta.current = risolvi));
  }

  function chiudi(si: boolean) {
    if (dialogo.current?.open) dialogo.current.close();
    risposta.current?.(si);
    risposta.current = null;
  }

  const finestra = (
    <dialog
      ref={dialogo}
      onCancel={() => chiudi(false)} // tasto Esc
      onClick={(e) => e.target === dialogo.current && chiudi(false)} // clic fuori dal riquadro
      aria-labelledby="testo-conferma"
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-0 shadow-xl backdrop:bg-slate-900/40"
    >
      <div className="flex flex-col gap-4 p-5">
        <p id="testo-conferma" className="text-sm text-slate-800">{testo}</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => chiudi(false)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={() => chiudi(true)}
            className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {pulsante}
          </button>
        </div>
      </div>
    </dialog>
  );

  return { chiedi, finestra };
}
