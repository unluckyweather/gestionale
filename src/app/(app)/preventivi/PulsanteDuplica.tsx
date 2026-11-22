"use client";
// Pulsante "Duplica" dell'anteprima nell'elenco: chiede con quali costi, poi crea la nuova bozza
// e apre la sua pagina.
import { useState, useTransition } from "react";
import { pulsanteSecondario } from "../anagrafiche/stile";
import { duplicaPreventivo } from "./azioni";
import { useConferma } from "./Conferma";

export default function PulsanteDuplica({ id, numero }: { id: string; numero: string }) {
  const { chiediScelta, finestra } = useConferma();
  const [occupato, avvia] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);

  async function duplica() {
    const costi = await chiediScelta(`Creo una nuova bozza copiando il preventivo ${numero}. Il prezzo corretto a mano non si copia. Con quali costi?`, [
      { valore: "attuali", etichetta: "Aggiorna ai costi di oggi", descrizione: "Tariffe orarie e catalogo materiali attuali" },
      { valore: "originali", etichetta: "Tieni i costi di questo preventivo", descrizione: "Copia esatta di ore e materiali" },
    ]);
    if (costi !== "attuali" && costi !== "originali") return;
    setErrore(null);
    avvia(async () => {
      const esito = await duplicaPreventivo(id, costi);
      if (esito?.errore) setErrore(esito.errore);
    });
  }

  return (
    <>
      {finestra}
      <button type="button" onClick={duplica} disabled={occupato} className={`${pulsanteSecondario} flex-[1_1_120px] justify-center disabled:opacity-50`}>
        {occupato ? "Un momento…" : "Duplica"}
      </button>
      {errore && <p role="alert" className="basis-full text-xs text-red-700">{errore}</p>}
    </>
  );
}
