// Pezzi condivisi della scheda Magazzino: indirizzi, titolo, messaggi, schede, stato degli ordini.
import Link from "next/link";
import { STATI_ORDINE, type StatoOrdine } from "@/lib/magazzino";

/** Indirizzo della scheda Magazzino, es. /magazzino?scheda=ordini&id=… */
export function indirizzo(parametri: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) if (valore) p.set(chiave, valore);
  const testo = p.toString();
  return testo ? `/magazzino?${testo}` : "/magazzino";
}

/** Titolo della scheda; il sottotitolo parla degli ordini solo a chi li vede (non agli operai). */
export function Titolo({ ordini = true }: { ordini?: boolean }) {
  return (
    <div className="min-w-60 flex-1">
      <h1 className="text-2xl font-semibold">Magazzino</h1>
      <p className="mt-1 text-sm text-slate-500">
        {ordini
          ? "Quanto materiale c'è e cosa abbiamo ordinato ai fornitori"
          : "Quanto materiale c'è: registra quello che entra, quello che usi e l'inventario"}
      </p>
    </div>
  );
}

export function Messaggi({ ok, errore }: { ok?: string; errore?: string }) {
  return (
    <>
      {ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{ok}</p>}
      {errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</p>}
    </>
  );
}

/** Schede "Giacenze · Ordini d'acquisto" (gli operai vedono solo le giacenze). */
export function Schede({ attiva, ordini }: { attiva: "giacenze" | "ordini"; ordini: boolean }) {
  const schede = [
    { chiave: "giacenze", etichetta: "Giacenze", href: indirizzo({}) },
    ...(ordini ? [{ chiave: "ordini", etichetta: "Ordini d'acquisto", href: indirizzo({ scheda: "ordini" }) }] : []),
  ];
  if (schede.length < 2) return null;
  return (
    <nav aria-label="Sezioni del magazzino" className="-mb-px flex gap-1 overflow-x-auto border-b border-slate-300">
      {schede.map((x) => (
        <Link
          key={x.chiave}
          href={x.href}
          aria-current={x.chiave === attiva ? "page" : undefined}
          className={`border-b-[3px] px-4 py-3 text-sm whitespace-nowrap ${
            x.chiave === attiva
              ? "border-blue-600 font-bold text-slate-900"
              : "border-transparent font-semibold text-slate-600 hover:text-slate-900"
          }`}
        >
          {x.etichetta}
        </Link>
      ))}
    </nav>
  );
}

/** Etichetta colorata dello stato di un ordine. */
export function EtichettaStatoOrdine({ stato }: { stato: StatoOrdine }) {
  const s = STATI_ORDINE.find((x) => x.valore === stato) ?? STATI_ORDINE[0];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.colori}`}>
      {s.etichetta}
    </span>
  );
}

/** "2026-11-23" → "23/11/2026" */
export function dataItaliana(valore: string | null | undefined): string {
  if (!valore) return "";
  const [a, m, g] = valore.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

/** Oggi in Italia, come "2026-11-23". */
export function oggiItalia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
}
