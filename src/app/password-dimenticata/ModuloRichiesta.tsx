"use client";

import { useActionState } from "react";
import { chiediLink, type StatoRichiesta } from "@/lib/azioni-password";

const statoIniziale: StatoRichiesta = {};

export default function ModuloRichiesta() {
  const [stato, azione, inCorso] = useActionState(chiediLink, statoIniziale);

  if (stato.inviata) {
    return (
      <div role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-900">
        <p className="font-semibold">Controlla la posta.</p>
        <p className="mt-1">
          Se l&apos;email è registrata, tra poco ti arriva un link per scegliere la nuova password. Il link vale
          poco tempo: aprilo appena arriva. Non lo trovi? Guarda anche nella posta indesiderata.
        </p>
      </div>
    );
  }

  return (
    <form action={azione} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-base font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        />
      </label>

      {stato.errore && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {stato.errore}
        </p>
      )}

      <button
        type="submit"
        disabled={inCorso}
        className="mt-2 rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {inCorso ? "Invio in corso…" : "Mandami il link"}
      </button>
    </form>
  );
}
