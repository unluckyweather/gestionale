// Piccole funzioni per mostrare le quantità di magazzino (usate da Anagrafiche e Magazzino).
// La giacenza la calcola il database (vista "magazzino" = somma dei movimenti).

const formatoQuantita = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3, useGrouping: "always" });

/** 30 → "30"; 1.5 → "1,5"; -3 → "−3" */
export function quantita(valore: number | string | null | undefined): string {
  if (valore === null || valore === undefined || valore === "") return "";
  return formatoQuantita.format(Number(valore)).replace("-", "−");
}

/** Unità al plurale quando serve: "lastra" → "lastre", "bobina" → "bobine"; le sigle (pz, m2…) restano uguali. */
export function unita(nome: string, valore: number | string): string {
  const uno = Math.abs(Number(valore)) === 1;
  if (nome === "lastra") return uno ? "lastra" : "lastre";
  if (nome === "bobina") return uno ? "bobina" : "bobine";
  return nome;
}

/** "10 lastre", "1 bobina", "100 pz" */
export function quantitaConUnita(valore: number | string, nome: string): string {
  return `${quantita(valore)} ${unita(nome, valore)}`;
}

export type LivelloGiacenza = "negativa" | "sotto_scorta" | "ok";

export function livelloGiacenza(giacenza: number | string, sottoScorta: boolean): LivelloGiacenza {
  if (Number(giacenza) < 0) return "negativa";
  return sottoScorta ? "sotto_scorta" : "ok";
}

export const TIPI_MOVIMENTO = {
  carico: "Carico",
  scarico: "Scarico",
  rettifica: "Rettifica",
} as const;
export type TipoMovimento = keyof typeof TIPI_MOVIMENTO;

// ---------------------------------------------------------------------
// Unità e costo "di magazzino" di un articolo (gli stessi calcoli delle
// funzioni unita_magazzino e costo_unita_magazzino del database, 0007)
// ---------------------------------------------------------------------
export type ArticoloPerMagazzino = {
  unita_misura: string;
  costo_unitario: number | string;
  larghezza_bobina_m: number | string | null;
  bobina_lunghezza_m: number | string | null;
  lastra_larghezza_cm: number | string | null;
};

/** lastra → "lastra"; bobina → "bobina"; altrimenti l'unità dell'articolo. */
export function unitaMagazzino(a: ArticoloPerMagazzino): string {
  if (a.lastra_larghezza_cm != null) return "lastra";
  if (a.larghezza_bobina_m != null) return "bobina";
  return a.unita_misura;
}

/** Costo di un'unità di magazzino; null per una bobina senza lunghezza (va scritto a mano). */
export function costoUnitaMagazzino(a: ArticoloPerMagazzino): number | null {
  if (a.larghezza_bobina_m != null) {
    if (a.bobina_lunghezza_m == null) return null;
    return Math.round(Number(a.costo_unitario) * Number(a.larghezza_bobina_m) * Number(a.bobina_lunghezza_m) * 10000) / 10000;
  }
  return Number(a.costo_unitario);
}

// ---------------------------------------------------------------------
// Ordini d'acquisto
// ---------------------------------------------------------------------
export type StatoOrdine = "bozza" | "inviato" | "ricevuto_parziale" | "ricevuto" | "annullato";

export const STATI_ORDINE: { valore: StatoOrdine; etichetta: string; colori: string }[] = [
  { valore: "bozza", etichetta: "Bozza", colori: "bg-slate-100 text-slate-700" },
  { valore: "inviato", etichetta: "Inviato", colori: "bg-blue-100 text-blue-800" },
  { valore: "ricevuto_parziale", etichetta: "Arrivato in parte", colori: "bg-amber-100 text-amber-900" },
  { valore: "ricevuto", etichetta: "Arrivato", colori: "bg-green-100 text-green-800" },
  { valore: "annullato", etichetta: "Annullato", colori: "bg-red-100 text-red-800" },
];

export function eStatoOrdine(valore: unknown): valore is StatoOrdine {
  return STATI_ORDINE.some((s) => s.valore === valore);
}

/** Righe modificabili solo in bozza o inviato (come nel database). */
export function ordineModificabile(stato: StatoOrdine): boolean {
  return stato === "bozza" || stato === "inviato";
}

/** Importo di una riga, arrotondato al centesimo come nel database. */
export function importoRiga(quantita: number, costo: number): number {
  return Math.round(quantita * costo * 100) / 100;
}
