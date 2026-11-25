// Calcoli del programma del giorno (puri, senza database): fasce orarie di una
// persona in un giorno, tempo occupato e tempo libero, chi può fare un lavoro.
// Le stesse regole della funzione fasce_orario() e della vista "programma" (0010).
import { minuti } from "./produzione";

export type Intervallo = { da: number; a: number }; // minuti dalla mezzanotte
export type FasciaOrario = { dipendente_id: string | null; giorno_settimana: number; dalle: string; alle: string };
export type Periodo = { dal: string; al: string; dalle: string | null; alle: string | null };

/** 1 = lunedì … 7 = domenica, da "2026-11-26" */
export function giornoSettimana(giorno: string): number {
  const d = new Date(`${giorno}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** "2026-11-26" ± n giorni */
export function spostaGiorno(giorno: string, n: number): string {
  const d = new Date(`${giorno}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Fasce di lavoro di una persona quel giorno: le sue se ne ha almeno una,
 * altrimenti quelle dell'azienda (persona vuota = azienda).
 */
export function fasceDi(persona: string | null, giorno: string, orari: FasciaOrario[]): Intervallo[] {
  const personali = persona !== null && orari.some((o) => o.dipendente_id === persona);
  const chi = personali ? persona : null;
  const gs = giornoSettimana(giorno);
  return orari
    .filter((o) => o.dipendente_id === chi && o.giorno_settimana === gs)
    .map((o) => ({ da: minuti(o.dalle), a: minuti(o.alle) }))
    .sort((x, y) => x.da - y.da);
}

/** Parte di un periodo (assenza, fermo) che cade in quel giorno, in minuti; null se non lo tocca. */
export function periodoNelGiorno(p: Periodo, giorno: string): Intervallo | null {
  if (giorno < p.dal || giorno > p.al) return null;
  const da = giorno === p.dal && p.dalle ? minuti(p.dalle) : 0;
  const a = giorno === p.al && p.alle ? minuti(p.alle) : 24 * 60;
  return a > da ? { da, a } : null;
}

/** Somma dei minuti di un elenco di intervalli (senza contare due volte le sovrapposizioni). */
export function durata(intervalli: Intervallo[]): number {
  return unisci(intervalli).reduce((s, x) => s + x.a - x.da, 0);
}

/** Unisce gli intervalli che si toccano o si sovrappongono. */
export function unisci(intervalli: Intervallo[]): Intervallo[] {
  const ordinati = [...intervalli].filter((x) => x.a > x.da).sort((x, y) => x.da - y.da);
  const out: Intervallo[] = [];
  for (const x of ordinati) {
    const ultimo = out[out.length - 1];
    if (ultimo && x.da <= ultimo.a) ultimo.a = Math.max(ultimo.a, x.a);
    else out.push({ ...x });
  }
  return out;
}

/** Le fasce meno gli intervalli occupati: il tempo libero. */
export function togli(fasce: Intervallo[], occupati: Intervallo[]): Intervallo[] {
  let libero = unisci(fasce);
  for (const o of unisci(occupati)) {
    libero = libero.flatMap((f) => {
      if (o.a <= f.da || o.da >= f.a) return [f];
      const pezzi: Intervallo[] = [];
      if (o.da > f.da) pezzi.push({ da: f.da, a: o.da });
      if (o.a < f.a) pezzi.push({ da: o.a, a: f.a });
      return pezzi;
    });
  }
  return libero.filter((x) => x.a - x.da >= 15); // meno di un quarto d'ora non conta
}

/** 510 → "08:30" */
export function hhmm(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** [{480,690},{810,1020}] → "08:00–11:30 e 13:30–17:00" */
export function testoIntervalli(x: Intervallo[]): string {
  const parti = x.map((i) => `${hhmm(i.da)}–${hhmm(i.a)}`);
  return parti.length <= 1 ? (parti[0] ?? "") : `${parti.slice(0, -1).join(", ")} e ${parti[parti.length - 1]}`;
}

/** 450 → "7,5 h" */
export function oreDaMinuti(min: number): string {
  return `${(Math.round((min / 60) * 100) / 100).toLocaleString("it-IT")} h`;
}

/**
 * Proposta di orario per un lavoro di `serve` minuti nel tempo libero:
 * il primo pezzo libero, fino a quando basta o finché dura il pezzo.
 */
export function proposta(libero: Intervallo[], serve: number): Intervallo | null {
  const primo = libero[0];
  if (!primo) return null;
  const quanto = serve > 0 ? Math.min(serve, primo.a - primo.da) : primo.a - primo.da;
  return { da: primo.da, a: primo.da + quanto };
}
