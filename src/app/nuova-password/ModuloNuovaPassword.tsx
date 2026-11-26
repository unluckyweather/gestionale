"use client";

import { useActionState } from "react";
import { salvaNuovaPassword, type StatoNuovaPassword } from "@/lib/azioni-password";

const statoIniziale: StatoNuovaPassword = {};

const classeCampo =
  "rounded-lg border border-slate-300 px-3 py-2.5 text-base font-normal focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20";

export default function ModuloNuovaPassword() {
  const [stato, azione, inCorso] = useActionState(salvaNuovaPassword, statoIniziale);

  return (
    <form action={azione} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Nuova password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required className={classeCampo} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Scrivila di nuovo
        <input name="conferma" type="password" autoComplete="new-password" minLength={8} required className={classeCampo} />
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
        {inCorso ? "Salvataggio…" : "Salva la password"}
      </button>
    </form>
  );
}
