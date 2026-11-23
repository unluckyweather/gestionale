// Magazzino: due schede.
//   Giacenze (tutti gli utenti attivi): quanto c'è, carichi, scarichi, inventari.
//   Ordini d'acquisto (titolare, ufficio, contabilità; scrivono titolare e ufficio).
// Indirizzi: /magazzino?q=…&avvisi=1&id=<articolo>
//            /magazzino?scheda=ordini&stato=…&q=…  ·  ?scheda=ordini&id=<ordine> o id=nuovo[&articolo=<id>]
import { richiediSezione } from "@/lib/utente";
import SchedaGiacenze from "./SchedaGiacenze";
import ElencoOrdini from "./ElencoOrdini";
import SchedaOrdine from "./SchedaOrdine";

type Parametri = {
  scheda?: string;
  q?: string;
  id?: string;
  avvisi?: string;
  stato?: string;
  archiviati?: string;
  articolo?: string;
  quantita?: string;
  ok?: string;
  errore?: string;
};

export default async function Magazzino({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/magazzino");
  const p = await searchParams;

  // gli operai non vedono gli ordini (né i costi): restano sulle giacenze
  if (p.scheda === "ordini" && io.ruolo !== "operaio") {
    const modificabile = io.ruolo === "titolare" || io.ruolo === "ufficio";
    if (p.id) return <SchedaOrdine id={p.id} articolo={p.articolo} quantita={p.quantita} modificabile={modificabile} ok={p.ok} errore={p.errore} />;
    return <ElencoOrdini p={p} modificabile={modificabile} />;
  }
  return <SchedaGiacenze io={io} p={p} />;
}
