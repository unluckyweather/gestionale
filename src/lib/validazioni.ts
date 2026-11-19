// Controlli sui dati anagrafici italiani (P.IVA, codice fiscale…) e lettura di numeri scritti "all'italiana".
// Il database fa gli stessi controlli sul formato; qui in più si verifica la cifra di controllo,
// così un errore di battitura viene segnalato subito con un messaggio chiaro.

/** Toglie spazi, punti e l'eventuale "IT" davanti. */
export function pulisciPartitaIva(valore: string): string {
  return valore.toUpperCase().replace(/^\s*IT/, "").replace(/[^0-9]/g, "");
}

/** Vero se è una partita IVA italiana valida (11 cifre + cifra di controllo corretta). */
export function partitaIvaValida(piva: string): boolean {
  if (!/^\d{11}$/.test(piva)) return false;
  let somma = 0;
  for (let i = 0; i < 11; i++) {
    let cifra = Number(piva[i]);
    if (i % 2 === 1) {
      cifra *= 2;
      if (cifra > 9) cifra -= 9;
    }
    somma += cifra;
  }
  return somma % 10 === 0;
}

export function pulisciCodiceFiscale(valore: string): string {
  return valore.toUpperCase().replace(/\s/g, "");
}

// Valori dei caratteri in posizione dispari (1ª, 3ª, …) per il calcolo del carattere di controllo.
const DISPARI: Record<string, number> = {
  "0": 1, "1": 0, "2": 5, "3": 7, "4": 9, "5": 13, "6": 15, "7": 17, "8": 19, "9": 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

/**
 * Vero se è un codice fiscale valido: 16 caratteri (persone) con carattere di controllo corretto,
 * oppure 11 cifre (aziende, stesse regole della partita IVA).
 */
export function codiceFiscaleValido(cf: string): boolean {
  if (/^\d{11}$/.test(cf)) return partitaIvaValida(cf);
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(cf)) return false;
  let somma = 0;
  for (let i = 0; i < 15; i++) {
    const c = cf[i];
    if (i % 2 === 0) somma += DISPARI[c];
    else somma += /\d/.test(c) ? Number(c) : c.charCodeAt(0) - 65;
  }
  return String.fromCharCode(65 + (somma % 26)) === cf[15];
}

export function emailValida(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

/**
 * Legge un numero scritto come lo scrivono le persone: "12,50", "1.234,5", "0,035", "12.5".
 * Restituisce null se il testo non è un numero.
 */
export function leggiNumero(testo: string): number | null {
  let t = testo.trim().replace(/\s|€/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

const formatoEuro = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** 0.035 → "0,035 €"; 12 → "12,00 €" */
export function euro(valore: number | string | null | undefined): string {
  if (valore === null || valore === undefined || valore === "") return "";
  return formatoEuro.format(Number(valore));
}

/** Numero per un campo da modificare: 0.035 → "0,035"; 12 → "12,00" */
export function numeroPerCampo(valore: number | string | null | undefined): string {
  if (valore === null || valore === undefined || valore === "") return "";
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(Number(valore));
}

/** Toglie spazi e mette in maiuscolo: "it60 x054…" → "IT60X054…" */
export function pulisciIban(valore: string): string {
  return valore.toUpperCase().replace(/\s/g, "");
}

/** Vero se l'IBAN ha il formato giusto e i 2 numeri di controllo tornano (calcolo "modulo 97"). */
export function ibanValido(iban: string): boolean {
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("IT") && iban.length !== 27) return false;
  const riordinato = iban.slice(4) + iban.slice(0, 4);
  let resto = 0;
  for (const c of riordinato) {
    const n = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55); // A=10, B=11…
    for (const cifra of n) resto = (resto * 10 + Number(cifra)) % 97;
  }
  return resto === 1;
}

/** Da un IBAN italiano ricava ABI e CAB (posizioni fisse); null se non è italiano o è incompleto. */
export function abiCabDaIban(iban: string): { abi: string; cab: string } | null {
  const i = pulisciIban(iban);
  if (!/^IT[0-9]{2}[A-Z][0-9]{10}[A-Z0-9]{12}$/.test(i)) return null;
  return { abi: i.slice(5, 10), cab: i.slice(10, 15) };
}
