// Fasi di preventivi e modelli: dal database alla bozza del modulo, costi aggiornati, totali.
// Funzioni "pure" (niente React): le usano le pagine nel browser e il server.
import { calcolaMateriale, centesimiOre, intero, perCampo } from "./calcoli";
import type { ArticoloScelto, BozzaFase, Cliente, FaseSalvata, Formato, TariffaScelta } from "./tipi";

let contatore = 0;
export const nuovaChiave = () => `n${++contatore}`;
export const s = (v: string | null | undefined) => v ?? "";

export function bozzaFasi(fasi: FaseSalvata[]): BozzaFase[] {
  return fasi.map((f) => ({
    chiave: f.id,
    id: f.id,
    titolo: f.titolo,
    descrizione_cliente: s(f.descrizione_cliente),
    ore: f.ore_fase.map((r) => ({
      chiave: r.id,
      id: r.id,
      tariffa_id: r.tariffa_id,
      ore: perCampo(r.ore, 0, 2),
      persone: r.persone ? String(r.persone) : "",
      costo_orario: perCampo(r.costo_orario, 2, 2),
    })),
    materiali: f.materiali_fase.map((r) => ({
      chiave: r.id,
      id: r.id,
      articolo_id: r.articolo_id,
      descrizione: r.descrizione,
      unita_misura: r.unita_misura,
      formato: (r.addebito_lastra ? "lastra" : r.larghezza_m !== null ? "bobina" : "normale") as Formato,
      larghezza_m: perCampo(r.larghezza_m, 0, 3),
      metri_lineari: perCampo(r.metri_lineari, 0, 3),
      quantita: perCampo(r.quantita, 0, 3),
      costo_unitario: perCampo(r.costo_unitario, 2, 4),
      addebito_lastra: r.addebito_lastra ?? "lastre_intere",
      lastra_larghezza_cm: perCampo(r.lastra_larghezza_cm, 0, 1),
      lastra_altezza_cm: perCampo(r.lastra_altezza_cm, 0, 1),
      costo_lastra: perCampo(r.costo_lastra, 2, 4),
      pezzo_larghezza_cm: perCampo(r.pezzo_larghezza_cm, 0, 1),
      pezzo_altezza_cm: perCampo(r.pezzo_altezza_cm, 0, 1),
      pezzi: r.pezzi ? String(r.pezzi) : "",
      margine_taglio_cm: perCampo(r.margine_taglio_cm ?? 0, 0, 1),
      scarto_percentuale: perCampo(r.scarto_percentuale ?? 10, 0, 2),
    })),
  }));
}

/** Campi di partenza di un nuovo materiale (scarto predefinito 10%, margine di taglio 0). */
export const materialeVuoto = {
  unita_misura: "pz",
  formato: "normale" as Formato,
  larghezza_m: "",
  metri_lineari: "",
  quantita: "",
  costo_unitario: "",
  addebito_lastra: "lastre_intere" as const,
  lastra_larghezza_cm: "",
  lastra_altezza_cm: "",
  costo_lastra: "",
  pezzo_larghezza_cm: "",
  pezzo_altezza_cm: "",
  pezzi: "",
  margine_taglio_cm: "0",
  scarto_percentuale: "10",
};

export const faseVuota = (): BozzaFase => ({ chiave: nuovaChiave(), titolo: "", descrizione_cliente: "", ore: [], materiali: [] });

/** Etichette uniche per i suggerimenti (due clienti con lo stesso nome restano distinguibili). */
export function etichetteUniche<T>(elenco: T[], testo: (x: T) => string): Map<string, T> {
  const mappa = new Map<string, T>();
  for (const x of elenco) {
    let e = testo(x);
    for (let n = 2; mappa.has(e); n++) e = `${testo(x)} (${n})`;
    mappa.set(e, x);
  }
  return mappa;
}

export const etichettaCliente = (c: Cliente) =>
  [c.denominazione, c.nome_breve, c.comune].filter(Boolean).join(" · ") + (c.attivo ? "" : " (archiviato)");
export const etichettaArticolo = (a: ArticoloScelto) => (a.codice ? `${a.codice} · ${a.descrizione}` : a.descrizione);

/**
 * Copia delle fasi per un preventivo o modello NUOVO: senza id (il database le crea nuove)
 * e con chiavi nuove per la pagina.
 */
export function copiaFasi(fasi: BozzaFase[]): BozzaFase[] {
  return fasi.map(({ id: _f, ...f }) => ({
    ...f,
    chiave: nuovaChiave(),
    ore: f.ore.map(({ id: _o, ...r }) => ({ ...r, chiave: nuovaChiave() })),
    materiali: f.materiali.map(({ id: _m, ...r }) => ({ ...r, chiave: nuovaChiave() })),
  }));
}

/**
 * Costi aggiornati a OGGI: costo orario dalla tariffa, costo dei materiali (o prezzo della lastra)
 * dal catalogo. I materiali scritti a mano, o non più nel catalogo, tengono il loro costo.
 */
export function aggiornaCosti(fasi: BozzaFase[], tariffe: TariffaScelta[], articoli: ArticoloScelto[]): BozzaFase[] {
  const tariffa = new Map(tariffe.map((t) => [t.id, t]));
  const articolo = new Map(articoli.map((a) => [a.id, a]));
  return fasi.map((f) => ({
    ...f,
    ore: f.ore.map((r) => {
      const t = tariffa.get(r.tariffa_id);
      return t ? { ...r, costo_orario: perCampo(t.costo_orario, 2, 2) } : r;
    }),
    materiali: f.materiali.map((r) => {
      const a = r.articolo_id ? articolo.get(r.articolo_id) : undefined;
      if (!a) return r;
      const costo = perCampo(a.costo_unitario, 2, 4);
      return r.formato === "lastra" ? { ...r, costo_lastra: costo } : { ...r, costo_unitario: costo };
    }),
  }));
}

/** Ore e costi (in centesimi) di ogni fase e del totale, con le stesse regole del database. */
export function calcolaFasi(fasi: BozzaFase[]) {
  const perFase = fasi.map((f) => ({
    ore: f.ore.reduce((somma, r) => somma + (intero(r.ore, 2) ?? 0), 0) / 100,
    costoOre: f.ore.reduce((somma, r) => somma + centesimiOre(r.ore, r.costo_orario), 0),
    costoMateriali: f.materiali.reduce((somma, r) => somma + calcolaMateriale(r).centesimi, 0),
  }));
  return {
    perFase,
    totale: {
      ore: Math.round(perFase.reduce((x, f) => x + f.ore, 0) * 100) / 100,
      costoOre: perFase.reduce((x, f) => x + f.costoOre, 0),
      costoMateriali: perFase.reduce((x, f) => x + f.costoMateriali, 0),
    },
  };
}
