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
import type { BozzaMateriale } from "./tipi";

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

// ---------------------------------------------------------------------
// Materiali: normale, bobina, lastra — STESSE regole di normalizza_materiale_fase (0004)
// ---------------------------------------------------------------------

/** Divisione tra interi positivi arrotondata alla metà in su (come round() del database), senza errori di virgola. */
function divTonda(numeratore: number, denominatore: number): number {
  return Math.floor((2 * numeratore + denominatore) / (2 * denominatore));
}

/** Quanti pezzi stanno in una lastra (misure in decimi di cm): tutti dritti o tutti ruotati, il migliore. */
export function pezziPerLastra(lastraL: number, lastraH: number, pezzoL: number, pezzoH: number, margine: number): number {
  const n = (spazio: number, pezzo: number) => Math.floor((spazio + margine) / (pezzo + margine));
  return Math.max(n(lastraL, pezzoL) * n(lastraH, pezzoH), n(lastraL, pezzoH) * n(lastraH, pezzoL));
}

export type CalcoloMateriale = {
  centesimi: number; // costo della riga
  quantita: number | null; // null = dati mancanti
  unita: string;
  costoUnitario: number | null;
  spiegazione?: string; // es. "8 pezzi per lastra → 2 lastre (6 posti liberi)"
  avviso?: string; // es. pezzo che non entra
};

export function calcolaMateriale(r: BozzaMateriale): CalcoloMateriale {
  if (r.formato === "bobina") {
    const q = quantitaBobina(r.larghezza_m, r.metri_lineari);
    return {
      centesimi: q === null ? 0 : centesimiMateriale(q, r.costo_unitario),
      quantita: q,
      unita: "m2",
      costoUnitario: leggiValore(r.costo_unitario),
    };
  }
  if (r.formato !== "lastra") {
    return {
      centesimi: centesimiMateriale(r.quantita, r.costo_unitario),
      quantita: leggiValore(r.quantita),
      unita: r.unita_misura,
      costoUnitario: leggiValore(r.costo_unitario),
    };
  }

  const unita = r.addebito_lastra === "lastre_intere" ? "lastra" : "m2";
  const vuoto = { centesimi: 0, quantita: null, unita, costoUnitario: null };
  const L = intero(r.lastra_larghezza_cm, 1);
  const H = intero(r.lastra_altezza_cm, 1);
  const a = intero(r.pezzo_larghezza_cm, 1);
  const b = intero(r.pezzo_altezza_cm, 1);
  const pezzi = intero(r.pezzi, 0);
  const margine = intero(r.margine_taglio_cm, 1) ?? 0;
  const prezzo = intero(r.costo_lastra, 4); // prezzo della lastra in decimillesimi di euro
  if (!L || !H || !a || !b || !pezzi || prezzo === null) {
    return { ...vuoto, spiegazione: "Scrivi misure della lastra, prezzo, misure del pezzo e numero di pezzi." };
  }
  const perLastra = pezziPerLastra(L, H, a, b, margine);
  if (perLastra < 1) return { ...vuoto, avviso: "Il pezzo non entra nella lastra." };
  const lastre = Math.ceil(pezzi / perLastra);
  const liberi = lastre * perLastra - pezzi;
  const pezziTesto = `${perLastra} ${perLastra === 1 ? "pezzo" : "pezzi"} per lastra → ${lastre} ${lastre === 1 ? "lastra" : "lastre"}`;

  if (r.addebito_lastra === "lastre_intere") {
    return {
      centesimi: divTonda(lastre * 1000 * prezzo, 100000),
      quantita: lastre,
      unita,
      costoUnitario: prezzo / 10000,
      spiegazione: `${pezziTesto}${liberi ? ` (${liberi} ${liberi === 1 ? "posto libero" : "posti liberi"})` : ""}`,
    };
  }
  // m² usati: pezzi × misura + scarto, al costo al m² della lastra
  const scarto = intero(r.scarto_percentuale, 2) ?? 0;
  const q1000 = divTonda(a * b * pezzi * (10000 + scarto), 10_000_000); // m² con 3 decimali
  const costoM2 = divTonda(prezzo * 1_000_000, L * H); // €/m² con 4 decimali
  const m2Netti = (a * b * pezzi) / 1_000_000;
  return {
    centesimi: divTonda(q1000 * costoM2, 100000),
    quantita: q1000 / 1000,
    unita,
    costoUnitario: costoM2 / 10000,
    spiegazione:
      `${perCampo(m2Netti, 2, 3)} m² dei pezzi + ${perCampo(scarto / 100, 0, 2)}% di scarto = ${perCampo(q1000 / 1000, 2, 3)} m²` +
      ` a ${perCampo(costoM2 / 10000, 2, 4)} €/m² · a lastre intere sarebbero ${lastre} ${lastre === 1 ? "lastra" : "lastre"}`,
  };
}
