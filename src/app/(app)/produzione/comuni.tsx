// Pezzi condivisi della scheda Produzione: indirizzi, stati di commesse e lavori, messaggi.
import Link from "next/link";
import { dataIt } from "@/lib/produzione";

export type StatoCommessa = "da_pianificare" | "in_lavorazione" | "controllo_qualita" | "completata";
export type StatoLavoro = "da_fare" | "in_corso" | "finito";

/** Gli stati delle commesse, nell'ordine delle colonne (come nel mockup). */
export const STATI_COMMESSA: { valore: StatoCommessa; etichetta: string; colori: string }[] = [
  { valore: "da_pianificare", etichetta: "Da pianificare", colori: "bg-slate-100 text-slate-700" },
  { valore: "in_lavorazione", etichetta: "In lavorazione", colori: "bg-blue-100 text-blue-800" },
  { valore: "controllo_qualita", etichetta: "Controllo qualità", colori: "bg-amber-100 text-amber-800" },
  { valore: "completata", etichetta: "Completata", colori: "bg-green-100 text-green-800" },
];

export const STATI_LAVORO: Record<StatoLavoro, { etichetta: string; colori: string }> = {
  da_fare: { etichetta: "Da fare", colori: "bg-slate-100 text-slate-700" },
  in_corso: { etichetta: "In corso", colori: "bg-blue-100 text-blue-800" },
  finito: { etichetta: "Finito", colori: "bg-green-100 text-green-800" },
};

export function EtichettaStatoCommessa({ stato }: { stato: StatoCommessa }) {
  const s = STATI_COMMESSA.find((x) => x.valore === stato) ?? STATI_COMMESSA[0];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.colori}`}>
      {s.etichetta}
    </span>
  );
}

export function EtichettaStatoLavoro({ stato }: { stato: StatoLavoro }) {
  const s = STATI_LAVORO[stato] ?? STATI_LAVORO.da_fare;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.colori}`}>
      {s.etichetta}
    </span>
  );
}

export function EtichettaUrgente() {
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">Urgente</span>
  );
}

/** Indirizzo della scheda Produzione, es. /produzione?id=… */
export function indirizzo(parametri: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) if (valore) p.set(chiave, valore);
  const testo = p.toString();
  return testo ? `/produzione?${testo}` : "/produzione";
}

export function Messaggi({ ok, errore }: { ok?: string; errore?: string }) {
  return (
    <>
      {ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>}
      {errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</p>}
    </>
  );
}

export function Avviso({ testo }: { testo: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      <p>{testo}</p>
      <Link href={indirizzo({})} className="text-blue-700 hover:underline">← Torna alle commesse</Link>
    </div>
  );
}

const formatoOre = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });
/** 7.5 → "7,5 h" */
export function oreTesto(valore: number | string | null | undefined): string {
  return `${formatoOre.format(Number(valore ?? 0))} h`;
}

/** "nel programma il 26/11/2026 (4 h)" / "dal … al …" / "non ancora nel programma" */
export function programmato(l: { ore_programmate: number; primo_giorno: string | null; ultimo_giorno: string | null }): string {
  if (!l.primo_giorno) return "non ancora nel programma";
  const quando =
    l.primo_giorno === l.ultimo_giorno ? `il ${dataIt(l.primo_giorno)}` : `dal ${dataIt(l.primo_giorno)} al ${dataIt(l.ultimo_giorno)}`;
  return `nel programma ${quando} (${oreTesto(l.ore_programmate)})`;
}
