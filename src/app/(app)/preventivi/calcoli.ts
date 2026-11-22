// Calcoli del preventivo mentre si scrive: STESSE regole della vista preventivi_riepilogo (0003).
//   costo riga ore       = arrotonda(ore × costo orario, 2)
//   costo riga materiale = arrotonda(quantità × costo unitario, 2)
//   bobina: quantità     = arrotonda(larghezza × metri lineari, 3) in m²
//   costo totale         = somma delle righe già arrotondate
//   prezzo calcolato     = arrotonda(costo × (1 + ricarico/100), 2)
//   prezzo               = prezzo al cliente se scritto, altrimenti il calcolato
//   margine % sul prezzo = arrotonda(margine / prezzo × 100, 1)
//   IVA                  = arrotonda(prezzo × aliquota/100, 2)
// Per non avere gli errori dei numeri con la virgola del computer (0,1 + 0,2 = 0,30000000000000004)
// i conti si fanno in numeri interi: centesimi, millesimi… come fa il database.
import { leggiNumero } from "@/lib/validazioni";

/** Testo del campo → numero intero con quei decimali (es. "1,5" con 2 decimali → 150). null se vuoto o sbagliato. */
export function intero(testo: string, decimali: number): number | null {
  const n = leggiValore(testo);
  if (n === null) return null;
  return Math.round(n * 10 ** decimali);
}

/**
 * Come leggiNumero, ma "1.330" (punto ogni 3 cifre, senza virgola) vale milletrecentotrenta, non 1,33:
 * nei prezzi è facile scriverlo così. null se vuoto, sbagliato o negativo.
 */
export function leggiValore(testo: string): number | null {
  const t = testo.trim();
  const n = leggiNumero(/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, "") : t);
  if (n === null || n < 0) return null;
  return n;
}

/** Bobina: m² con 3 decimali, oppure null se manca un dato. */
export function quantitaBobina(larghezza: string, metri: string): number | null {
  const l = intero(larghezza, 3);
  const m = intero(metri, 3);
  if (l === null || m === null) return null;
  return Math.round((l * m) / 1000) / 1000;
}

/** Costo di una riga di ore, in centesimi. */
export function centesimiOre(ore: string, costoOrario: string): number {
  const o = intero(ore, 2) ?? 0;
  const c = intero(costoOrario, 2) ?? 0;
  return Math.round((o * c) / 100);
}

/** Costo di una riga di materiale, in centesimi (quantità già in numero se bobina). */
export function centesimiMateriale(quantita: string | number, costoUnitario: string): number {
  const q = typeof quantita === "number" ? Math.round(quantita * 1000) : (intero(quantita, 3) ?? 0);
  const c = intero(costoUnitario, 4) ?? 0;
  return Math.round((q * c) / 100000);
}

export type Totali = {
  ore: number;
  costoOre: number; // tutti gli importi in centesimi
  costoMateriali: number;
  costo: number;
  prezzoCalcolato: number;
  prezzo: number;
  margine: number;
  marginePercentuale: number | null;
  iva: number;
  totale: number;
};

export function totali(
  righe: { ore: number; costoOre: number; costoMateriali: number },
  ricarico: string,
  prezzoCliente: string,
  aliquota: number
): Totali {
  const costo = righe.costoOre + righe.costoMateriali;
  const r = intero(ricarico, 2) ?? 0;
  const prezzoCalcolato = Math.round((costo * (10000 + r)) / 10000);
  const scritto = intero(prezzoCliente, 2);
  const prezzo = scritto ?? prezzoCalcolato;
  const margine = prezzo - costo;
  const iva = Math.round((prezzo * Math.round(aliquota * 100)) / 10000);
  return {
    ore: righe.ore,
    costoOre: righe.costoOre,
    costoMateriali: righe.costoMateriali,
    costo,
    prezzoCalcolato,
    prezzo,
    margine,
    marginePercentuale: prezzo > 0 ? Math.round((margine / prezzo) * 1000) / 10 : null,
    iva,
    totale: prezzo + iva,
  };
}

/** Centesimi → euro per euro() di validazioni.ts */
export const inEuro = (centesimi: number) => centesimi / 100;

/** Numero → testo per un campo: 2 → "2"; 1.5 → "1,5"; 45 con min 2 → "45,00" (senza punto delle migliaia). */
export function perCampo(valore: number | string | null | undefined, minDecimali = 0, maxDecimali = 4): string {
  if (valore === null || valore === undefined || valore === "") return "";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: minDecimali,
    maximumFractionDigits: maxDecimali,
    useGrouping: false,
  }).format(Number(valore));
}
