import type { Metadata } from "next";
import Link from "next/link";
import ModuloLogin from "./ModuloLogin";
import RiquadroAccesso from "@/components/RiquadroAccesso";

export const metadata: Metadata = { title: "Accedi · Gestionale" };

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ errore?: string }>;
}) {
  const { errore } = await searchParams;
  return (
    <RiquadroAccesso titolo="Accedi" sottotitolo="Usa l'email e la password che ti ha dato il titolare.">
      {errore === "link" && (
        <p role="alert" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Il link per la nuova password non è valido o è scaduto. Chiedine uno nuovo.
        </p>
      )}
      <ModuloLogin />
      <p className="mt-6 text-sm">
        <Link href="/password-dimenticata" className="font-medium text-blue-700 hover:underline">
          Password dimenticata?
        </Link>
      </p>
    </RiquadroAccesso>
  );
}
