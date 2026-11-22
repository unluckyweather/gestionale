"use client";
// Pulsanti sopra il foglio: non vengono stampati (classe print:hidden).
import Link from "next/link";

export default function BarraStampa({ ritorno }: { ritorno: string }) {
  return (
    <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center gap-3 px-4 print:hidden">
      <Link href={ritorno} className="text-sm text-blue-700 hover:underline">
        ← Torna al preventivo
      </Link>
      <span className="flex-1" />
      <span className="text-xs text-slate-500">Nella finestra di stampa scegli «Salva come PDF» per avere il file.</span>
      <button
        type="button"
        onClick={() => window.print()}
        className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
      >
        Stampa / Salva PDF
      </button>
    </div>
  );
}
