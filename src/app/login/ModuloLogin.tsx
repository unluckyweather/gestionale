"use client";

import { useActionState } from "react";
import { accedi, type StatoLogin } from "@/lib/azioni-accesso";

const statoIniziale: StatoLogin = {};

export default function ModuloLogin() {
  const [stato, azione, inCorso] = useActionState(accedi, statoIniziale);

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
      <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
        Password
        <input
          name="password"
          type="password"
          autoComplete="current-password"
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
        {inCorso ? "Accesso in corso…" : "Accedi"}
      </button>
    </form>
  );
}
