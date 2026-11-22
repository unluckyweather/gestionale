// Pezzi condivisi della scheda Preventivi: indirizzi, stati, formati.

export type Stato = "bozza" | "inviato" | "accettato" | "rifiutato";

/** Gli stati nell'ordine dei filtri, con etichetta e colori dell'etichetta (come nel mockup). */
export const STATI: { valore: Stato; etichetta: string; colori: string }[] = [
  { valore: "bozza", etichetta: "Bozza", colori: "bg-slate-100 text-slate-700" },
  { valore: "inviato", etichetta: "Inviato", colori: "bg-blue-100 text-blue-800" },
  { valore: "accettato", etichetta: "Accettato", colori: "bg-green-100 text-green-800" },
  { valore: "rifiutato", etichetta: "Rifiutato", colori: "bg-red-100 text-red-800" },
];

export function eStato(valore: unknown): valore is Stato {
  return STATI.some((s) => s.valore === valore);
}

/** Etichetta colorata dello stato. */
export function EtichettaStato({ stato }: { stato: Stato }) {
  const s = STATI.find((x) => x.valore === stato) ?? STATI[0];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.colori}`}>
      {s.etichetta}
    </span>
  );
}

/**
 * Indirizzo della scheda Preventivi, es. /preventivi?stato=bozza&sel=…
 * (filtro, ricerca e preventivo scelto stanno nell'indirizzo: così "Indietro" del browser funziona).
 */
export function indirizzo(parametri: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) if (valore) p.set(chiave, valore);
  const testo = p.toString();
  return testo ? `/preventivi?${testo}` : "/preventivi";
}

/** "2026-11-19" → "19/11/2026" (senza passare dagli orari: niente sorprese col fuso orario). */
export function dataItaliana(valore: string | null | undefined): string {
  if (!valore) return "";
  const [a, m, g] = valore.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

const formatoOre = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
/** 2 → "2,0"; 1.25 → "1,25" */
export function ore(valore: number | string | null | undefined): string {
  return formatoOre.format(Number(valore ?? 0));
}

const formatoPercento = new Intl.NumberFormat("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** 26.2 → "26,2%" */
export function percento(valore: number | string | null | undefined): string {
  if (valore === null || valore === undefined) return "—";
  return `${formatoPercento.format(Number(valore))}%`;
}

/** Oggi in Italia, come "2026-11-22" (il server potrebbe stare in un altro fuso orario). */
export function oggiItalia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}
