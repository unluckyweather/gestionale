import type { Metadata } from "next";
import ModuloLogin from "./ModuloLogin";

export const metadata: Metadata = { title: "Accedi · Gestionale" };

export default function PaginaLogin() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-2xl font-bold text-slate-900">
          Gestionale<span className="text-blue-400">.</span>
        </div>
        <h1 className="mb-1 text-lg font-semibold">Accedi</h1>
        <p className="mb-6 text-sm text-slate-500">Usa l&apos;email e la password che ti ha dato il titolare.</p>
        <ModuloLogin />
        <p className="mt-6 text-xs text-slate-500">Password dimenticata? Chiedi al titolare di reimpostarla.</p>
      </div>
    </div>
  );
}
