// Impaginazione di tutte le pagine riservate: barra laterale + contenuto.
// Qui si controlla anche che l'utente sia collegato e attivo.
import BarraLaterale from "@/components/BarraLaterale";
import { richiediUtente } from "@/lib/utente";
import { sezioniPerRuolo } from "@/lib/ruoli";
import { creaClientServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: Readonly<{ children: React.ReactNode }>) {
  const utente = await richiediUtente();

  // numerini accanto alle voci di menu: richieste di ferie e permessi da decidere (titolare, 0012)
  const numeri: Record<string, number> = {};
  if (utente.ruolo === "titolare") {
    const supabase = await creaClientServer();
    const { count } = await supabase
      .from("assenze")
      .select("id", { count: "exact", head: true })
      .eq("stato", "richiesta")
      .eq("attivo", true);
    if (count) numeri["/timbrature"] = count;
  }

  return (
    <div className="min-h-screen md:flex">
      <BarraLaterale
        voci={sezioniPerRuolo(utente.ruolo).map(({ href, etichetta }) => ({ href, etichetta }))}
        nome={utente.nome}
        ruolo={utente.ruolo}
        numeri={numeri}
      />
      <main className="min-w-0 flex-1 p-4 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
