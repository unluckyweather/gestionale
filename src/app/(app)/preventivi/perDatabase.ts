// Controlli e conversione dei dati del modulo prima di mandarli al database.
// Li usano i salvataggi di preventivi e modelli e "Duplica" (solo lato server, in azioni.ts).
import type { PostgrestError } from "@supabase/supabase-js";
import { leggiValore } from "./calcoli";
import type { BozzaFase } from "./tipi";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const DATA = /^\d{4}-\d{2}-\d{2}$/;

export class ErroreDati extends Error {}

export const testo = (v: unknown) => String(v ?? "").trim();
export const oNull = (v: unknown) => testo(v) || null;
export const idONull = (v: unknown) => (UUID.test(testo(v)) ? testo(v) : null);

/** Numero scritto nel campo → numero; vuoto → null; sbagliato → errore con il nome del campo. */
export function numero(v: string, campo: string, decimali: number): number | null {
  if (!testo(v)) return null;
  const n = leggiValore(v);
  if (n === null) throw new ErroreDati(`${campo}: «${v}» non è un numero valido (es. 12 o 12,50).`);
  return Math.round(n * 10 ** decimali) / 10 ** decimali;
}

export function spiegaErrore(errore: PostgrestError): string {
  if (errore.code === "P0001") return errore.message; // messaggi scritti nei trigger (es. preventivo bloccato)
  if (errore.code === "23514") return "Controlla i dati: c'è un valore fuori dai limiti (es. numero negativo o validità prima della data).";
  if (errore.code === "23503") return "Un dato scelto non esiste più (cliente, tariffa o articolo): ricarica la pagina.";
  if (errore.code === "42501") return "Non hai i permessi per modificare questo preventivo.";
  return "Salvataggio non riuscito. Riprova.";
}

/**
 * Fasi della bozza → elenco per salva_preventivo / salva_modello.
 * Controlla i dati e lancia ErroreDati con un messaggio chiaro (es. "Fase 2, ore riga 1: scegli la tariffa.").
 */
export function fasiPerDatabase(bozze: BozzaFase[]): unknown[] {
  return (bozze ?? []).map((f, i) => {
    const nomeFase = `Fase ${i + 1}`;
    if (!testo(f.titolo)) throw new ErroreDati(`${nomeFase}: scrivi il titolo.`);
    return {
      id: idONull(f.id),
      titolo: testo(f.titolo),
      descrizione_cliente: oNull(f.descrizione_cliente),
      ore: f.ore.map((r, j) => {
        const dove = `${nomeFase}, ore riga ${j + 1}`;
        if (!idONull(r.tariffa_id)) throw new ErroreDati(`${dove}: scegli la tariffa.`);
        const persone = numero(r.persone, `${dove}, persone`, 0);
        if (persone !== null && (persone < 1 || persone > 99)) throw new ErroreDati(`${dove}: persone da 1 a 99.`);
        return {
          id: idONull(r.id),
          tariffa_id: testo(r.tariffa_id),
          ore: numero(r.ore, `${dove}, ore`, 2) ?? 0,
          persone,
          costo_orario: numero(r.costo_orario, `${dove}, € / ora`, 2), // vuoto → copiato dalla tariffa
        };
      }),
      materiali: f.materiali.map((r, j) => {
        const dove = `${nomeFase}, materiale riga ${j + 1}`;
        const articolo = idONull(r.articolo_id);
        if (!testo(r.descrizione) && !articolo) throw new ErroreDati(`${dove}: scrivi il materiale.`);
        const bobina = r.formato === "bobina";
        const lastra = r.formato === "lastra";
        const larghezza = bobina ? numero(r.larghezza_m, `${dove}, larghezza`, 3) : null;
        const metri = bobina ? numero(r.metri_lineari, `${dove}, metri lineari`, 3) : null;
        if (bobina && (!larghezza || !metri)) throw new ErroreDati(`${dove}: per la bobina servono larghezza e metri lineari.`);

        // lastra: quantità, unità e costo li calcola il database dalle misure
        const cm = (v: string, campo: string) => {
          const n = numero(v, `${dove}, ${campo}`, 1);
          if (!n) throw new ErroreDati(`${dove}: scrivi ${campo} (in cm, maggiore di zero).`);
          return n;
        };
        const datiLastra = lastra
          ? {
              addebito_lastra: r.addebito_lastra === "m2_usati" ? "m2_usati" : "lastre_intere",
              lastra_larghezza_cm: cm(r.lastra_larghezza_cm, "larghezza della lastra"),
              lastra_altezza_cm: cm(r.lastra_altezza_cm, "altezza della lastra"),
              costo_lastra: numero(r.costo_lastra, `${dove}, prezzo della lastra`, 4), // vuoto → dal catalogo
              pezzo_larghezza_cm: cm(r.pezzo_larghezza_cm, "larghezza del pezzo"),
              pezzo_altezza_cm: cm(r.pezzo_altezza_cm, "altezza del pezzo"),
              pezzi: numero(r.pezzi, `${dove}, pezzi`, 0),
              margine_taglio_cm: numero(r.margine_taglio_cm, `${dove}, margine di taglio`, 1) ?? 0,
              scarto_percentuale: numero(r.scarto_percentuale, `${dove}, scarto %`, 2) ?? 10,
            }
          : { addebito_lastra: null };
        if (lastra && !(Number(datiLastra.pezzi) >= 1)) throw new ErroreDati(`${dove}: scrivi quanti pezzi servono.`);
        if (lastra && datiLastra.costo_lastra === null && !articolo)
          throw new ErroreDati(`${dove}: scrivi il prezzo della lastra.`);

        return {
          id: idONull(r.id),
          articolo_id: articolo,
          descrizione: oNull(r.descrizione),
          unita_misura: lastra ? null : oNull(r.unita_misura),
          larghezza_m: larghezza,
          metri_lineari: metri,
          // bobina e lastra: la quantità la calcola il database
          quantita: bobina || lastra ? null : (numero(r.quantita, `${dove}, quantità`, 3) ?? 0),
          // vuoto → copiato dall'articolo; lastra → calcolato dal database
          costo_unitario: lastra ? null : numero(r.costo_unitario, `${dove}, € / unità`, 4),
          ...datiLastra,
        };
      }),
    };
  });
}
