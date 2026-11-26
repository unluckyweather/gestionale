import type { Metadata } from "next";
import Link from "next/link";
import RiquadroAccesso from "@/components/RiquadroAccesso";
import ModuloRichiesta from "./ModuloRichiesta";

export const metadata: Metadata = { title: "Password dimenticata · Gestionale" };

// Pagina pubblica (vedi PAGINE_PUBBLICHE in lib/supabase/proxy.ts).
export default function PaginaPasswordDimenticata() {
  return (
    <RiquadroAccesso
      titolo="Password dimenticata"
      sottotitolo="Scrivi l'email con cui entri: ti mandiamo un link per sceglierne una nuova."
    >
      <ModuloRichiesta />
      <p className="mt-6 text-sm">
        <Link href="/login" className="font-medium text-blue-700 hover:underline">
          ← Torna all&apos;accesso
        </Link>
      </p>
    </RiquadroAccesso>
  );
}
