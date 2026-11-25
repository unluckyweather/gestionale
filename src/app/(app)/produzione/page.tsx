// Produzione → Commesse (tutti gli utenti attivi; modificano titolare e ufficio).
// Indirizzi: /produzione?q=…&archiviati=1
//            /produzione?id=<commessa> · ?id=nuova · ?id=nuova&preventivo=<preventivo> («Converti in commessa»)
// Il programma del giorno arriverà come seconda scheda (passo 5).
import { richiediSezione } from "@/lib/utente";
import ElencoCommesse from "./ElencoCommesse";
import SchedaCommessa from "./SchedaCommessa";

type Parametri = {
  q?: string;
  id?: string;
  preventivo?: string;
  archiviati?: string;
  ok?: string;
  errore?: string;
};

export default async function Produzione({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/produzione");
  const p = await searchParams;
  const modificabile = io.ruolo === "titolare" || io.ruolo === "ufficio";

  if (p.id) {
    return <SchedaCommessa id={p.id} preventivo={p.preventivo} modificabile={modificabile} ok={p.ok} errore={p.errore} />;
  }
  return <ElencoCommesse p={p} modificabile={modificabile} />;
}
