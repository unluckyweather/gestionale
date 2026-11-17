// Impaginazione di tutte le pagine riservate: barra laterale + contenuto.
// Qui si controlla anche che l'utente sia collegato e attivo.
import BarraLaterale from "@/components/BarraLaterale";
import { richiediUtente } from "@/lib/utente";
import { sezioniPerRuolo } from "@/lib/ruoli";

export const dynamic = "force-dynamic";

export default async function LayoutApp({ children }: Readonly<{ children: React.ReactNode }>) {
  const utente = await richiediUtente();

  return (
    <div className="min-h-screen md:flex">
      <BarraLaterale
        voci={sezioniPerRuolo(utente.ruolo).map(({ href, etichetta }) => ({ href, etichetta }))}
        nome={utente.nome}
        ruolo={utente.ruolo}
      />
      <main className="min-w-0 flex-1 p-4 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
