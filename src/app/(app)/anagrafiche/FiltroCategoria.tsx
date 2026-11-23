"use client";
// Menu "Categoria" dell'elenco clienti/fornitori. Sta dentro il modulo di ricerca:
// appena si sceglie una voce il modulo parte da solo, così ricerca e "archiviati" restano.
import { campo } from "./stile";
import { SENZA_CATEGORIA } from "./indirizzo";
import type { Categoria } from "./tipi";

export default function FiltroCategoria({ categorie, scelta }: { categorie: Categoria[]; scelta?: string }) {
  return (
    <select
      name="categoria"
      defaultValue={scelta ?? ""}
      aria-label="Filtra per categoria"
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={`${campo} w-48 max-w-full`}
    >
      <option value="">Tutte le categorie</option>
      <option value={SENZA_CATEGORIA}>Senza categoria</option>
      {categorie.map((c) => (
        <option key={c.id} value={c.id}>
          {c.descrizione}
          {c.attivo ? "" : " (archiviata)"}
        </option>
      ))}
    </select>
  );
}
