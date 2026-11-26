// Etichette e calcoli delle timbrature (0013). Usato sia dal server sia dal browser:
// niente accessi al database qui. Le stesse regole le usa la vista timbrature_giorno.

export type TipoTimbratura = "entrata" | "inizio_pausa" | "fine_pausa" | "uscita";
export type EsitoPosizione = "in_zona" | "fuori_zona" | "non_disponibile";

export const TIPI_TIMBRATURA: TipoTimbratura[] = ["entrata", "inizio_pausa", "fine_pausa", "uscita"];

export const ETICHETTE_TIMBRATURA: Record<TipoTimbratura, string> = {
  entrata: "Entrata",
  inizio_pausa: "Inizio pausa",
  fine_pausa: "Fine pausa",
  uscita: "Uscita",
};

export type Timbratura = {
  id: string;
  tipo: TipoTimbratura;
  orario: string;
  origine: "telefono" | "ufficio";
  ricevuta_il: string;
  posizione: EsitoPosizione | null;
  distanza_m: number | null;
};

/** Dove si trova la persona dopo l'ultima timbratura. */
export type StatoPresenza = "fuori" | "dentro" | "pausa";

export function statoDopo(ultima: TipoTimbratura | null | undefined): StatoPresenza {
  if (ultima === "entrata" || ultima === "fine_pausa") return "dentro";
  if (ultima === "inizio_pausa") return "pausa";
  return "fuori";
}

const FORMATO_ORA = new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
const FORMATO_GIORNO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" });

/** "2026-11-26T07:02:00Z" → "08:02" (ora italiana) */
export function oraRoma(iso: string | Date): string {
  return FORMATO_ORA.format(typeof iso === "string" ? new Date(iso) : iso);
}

/** "2026-11-26T23:30:00Z" → "2026-11-27" (giorno italiano) */
export function giornoRoma(iso: string | Date): string {
  return FORMATO_GIORNO.format(typeof iso === "string" ? new Date(iso) : iso);
}

/**
 * Minuti lavorati e di pausa in un giorno, dalle timbrature in ordine di orario.
 * Lavoro = da entrata/fine pausa alla timbratura dopo; se è l'ultima, fino ad "adesso"
 * (passare null per un giorno già finito: il tratto aperto non conta).
 */
export function contaMinuti(t: { tipo: TipoTimbratura; orario: string }[], adesso: Date | null) {
  let lavoro = 0;
  let pausa = 0;
  for (let i = 0; i < t.length; i++) {
    const dopo = t[i + 1];
    const fine = dopo ? new Date(dopo.orario) : adesso;
    if (!fine) continue;
    const min = Math.max(0, (fine.getTime() - new Date(t[i].orario).getTime()) / 60000);
    if ((t[i].tipo === "entrata" || t[i].tipo === "fine_pausa") && (!dopo || dopo.tipo === "inizio_pausa" || dopo.tipo === "uscita")) lavoro += min;
    if (t[i].tipo === "inizio_pausa") pausa += min;
  }
  return { lavoro: Math.round(lavoro), pausa: Math.round(pausa) };
}

/** 268 → "4 h 28 min"; 45 → "45 min" */
export function durataTesto(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** 3340 → "3,3 km"; 180 → "180 m" */
export function distanzaTesto(m: number | null | undefined): string {
  if (m === null || m === undefined) return "";
  return m >= 1000 ? `${(m / 1000).toLocaleString("it-IT", { maximumFractionDigits: 1 })} km` : `${m} m`;
}
