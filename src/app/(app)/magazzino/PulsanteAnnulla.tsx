"use client";
// «Annulla» accanto a un movimento (solo titolare e ufficio), con conferma dentro la pagina.
import { useRef } from "react";
import { useConferma } from "../preventivi/Conferma";
import { annullaMovimento } from "./azioni";

export default function PulsanteAnnulla({ id, articoloId, descrizione }: { id: string; articoloId: string; descrizione: string }) {
  const modulo = useRef<HTMLFormElement>(null);
  const { chiedi, finestra } = useConferma();

  return (
    <>
    {/* la finestra di conferma ha un suo <form>: deve stare FUORI da questo */}
    <form ref={modulo} action={annullaMovimento}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="articolo_id" value={articoloId} />
      <button
        type="button"
        onClick={async () => {
          if (await chiedi(`Annullare il movimento «${descrizione}»? Resterà nello storico, barrato, e la giacenza verrà ricalcolata.`, "Sì, annullalo"))
            modulo.current?.requestSubmit();
        }}
        className="rounded-md px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
      >
        Annulla
      </button>
    </form>
    {finestra}
    </>
  );
}
