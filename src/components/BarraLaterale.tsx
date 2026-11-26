"use client";
// Menu principale. Su computer è una colonna a sinistra, su telefono una barra in alto.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { esci } from "@/lib/azioni-accesso";
import { ETICHETTE_RUOLO, type Ruolo } from "@/lib/ruoli";

type Props = {
  voci: { href: string; etichetta: string }[];
  nome: string;
  ruolo: Ruolo;
  /** numerino accanto a una voce (es. richieste da decidere), per indirizzo */
  numeri?: Record<string, number>;
};

export default function BarraLaterale({ voci, nome, ruolo, numeri = {} }: Props) {
  const percorso = usePathname();

  return (
    <nav
      aria-label="Menu principale"
      className="flex flex-col gap-3 bg-slate-900 p-3 md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0 md:gap-1 md:px-4 md:py-6"
    >
      <div className="flex items-center justify-between md:block">
        <div className="px-3 text-xl font-bold text-white md:pb-6">
          Gestionale<span className="text-blue-400">.</span>
        </div>
        {/* su telefono il pulsante Esci sta in alto a destra */}
        <form action={esci} className="md:hidden">
          <button className="rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
            Esci
          </button>
        </form>
      </div>

      <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
        {voci.map((voce) => {
          const attiva = voce.href === "/" ? percorso === "/" : percorso.startsWith(voce.href);
          return (
            <li key={voce.href} className="shrink-0">
              <Link
                href={voce.href}
                aria-current={attiva ? "page" : undefined}
                className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium whitespace-nowrap ${
                  attiva ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {voce.etichetta}
                {numeri[voce.href] > 0 && (
                  <span
                    aria-label={`${numeri[voce.href]} da decidere`}
                    className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white"
                  >
                    {numeri[voce.href]}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto hidden rounded-lg bg-slate-800 p-3 text-sm text-slate-300 md:block">
        Connesso come
        <div className="truncate font-semibold text-white" title={nome}>{nome}</div>
        <div className="text-xs">{ETICHETTE_RUOLO[ruolo]}</div>
        <form action={esci} className="mt-3">
          <button className="w-full rounded-md border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-700">
            Esci
          </button>
        </form>
      </div>
    </nav>
  );
}
