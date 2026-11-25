// Etichette e piccoli calcoli della Produzione (macchine, competenze, orari).
// Usato sia dal server sia dal browser: niente accessi al database qui.

export type TipoMacchina = "macchina" | "postazione";
export type LivelloCompetenza = "principale" | "sa_usarla";

export const TIPI_MACCHINA: { valore: TipoMacchina; etichetta: string }[] = [
  { valore: "macchina", etichetta: "Macchina" },
  { valore: "postazione", etichetta: "Postazione (senza macchina)" },
];

export const LIVELLI: Record<LivelloCompetenza, string> = {
  principale: "Principale",
  sa_usarla: "Sa usarla",
};

/** Clic sulla casella delle competenze: vuota → sa usarla → principale → vuota. */
export function livelloSuccessivo(attuale: LivelloCompetenza | null): LivelloCompetenza | null {
  if (attuale === null) return "sa_usarla";
  if (attuale === "sa_usarla") return "principale";
  return null;
}

/** 1 = lunedì … 7 = domenica (come extract(isodow) del database). */
export const GIORNI: { numero: number; breve: string; nome: string }[] = [
  { numero: 1, breve: "Lun", nome: "Lunedì" },
  { numero: 2, breve: "Mar", nome: "Martedì" },
  { numero: 3, breve: "Mer", nome: "Mercoledì" },
  { numero: 4, breve: "Gio", nome: "Giovedì" },
  { numero: 5, breve: "Ven", nome: "Venerdì" },
  { numero: 6, breve: "Sab", nome: "Sabato" },
  { numero: 7, breve: "Dom", nome: "Domenica" },
];

export type Fascia = { giorno_settimana: number; dalle: string; alle: string };

/** "08:00:00" → "08:00" */
export function ora(valore: string | null | undefined): string {
  return valore ? valore.slice(0, 5) : "";
}

/** "08:00" → 480 minuti */
export function minuti(valore: string): number {
  const [h, m] = valore.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 450 → "7,5 h" */
export function oreTesto(min: number): string {
  const ore = Math.round((min / 60) * 100) / 100;
  return `${ore.toLocaleString("it-IT")} h`;
}

/**
 * Orario in breve, raggruppando i giorni uguali:
 * "Lun–Ven 08:00–12:30 · 13:30–17:00 (8 h)".
 */
export function riassuntoOrario(fasce: Fascia[]): string {
  if (fasce.length === 0) return "Nessun orario";
  const perGiorno = GIORNI.map((g) => {
    const f = fasce
      .filter((x) => x.giorno_settimana === g.numero)
      .sort((a, b) => minuti(a.dalle) - minuti(b.dalle));
    const testo = f.map((x) => `${ora(x.dalle)}–${ora(x.alle)}`).join(" · ");
    const durata = f.reduce((s, x) => s + minuti(x.alle) - minuti(x.dalle), 0);
    return { g, testo, durata };
  }).filter((x) => x.testo);

  // giorni consecutivi con lo stesso orario → "Lun–Ven"
  const gruppi: { da: string; a: string; testo: string; durata: number; ultimo: number }[] = [];
  for (const x of perGiorno) {
    const prec = gruppi[gruppi.length - 1];
    if (prec && prec.testo === x.testo && prec.ultimo === x.g.numero - 1) {
      prec.a = x.g.breve;
      prec.ultimo = x.g.numero;
    } else {
      gruppi.push({ da: x.g.breve, a: x.g.breve, testo: x.testo, durata: x.durata, ultimo: x.g.numero });
    }
  }
  return gruppi
    .map((x) => `${x.da === x.a ? x.da : `${x.da}–${x.a}`} ${x.testo} (${oreTesto(x.durata)})`)
    .join("; ");
}

/** "2026-11-26" → "26/11/2026" */
export function dataIt(valore: string | null | undefined): string {
  if (!valore) return "";
  const [a, m, g] = valore.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

/** Data di oggi in Italia, "2026-11-26" */
export function oggiIt(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(new Date());
}
