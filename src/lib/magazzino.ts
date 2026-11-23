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
