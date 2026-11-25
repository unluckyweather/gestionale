// Produzione (tutti gli utenti attivi), in due schede:
//   Commesse             → /produzione?q=…&archiviati=1 · ?id=<commessa> · ?id=nuova[&preventivo=<id>]
//                          (modificano titolare e ufficio)
//   Programma del giorno → /produzione?scheda=programma&giorno=<data>&vista=persona… (lo prepara il titolare)
import { richiediSezione } from "@/lib/utente";
import ElencoCommesse from "./ElencoCommesse";
import SchedaCommessa from "./SchedaCommessa";
import SchedaProgramma, { type ParametriProgramma } from "./SchedaProgramma";

type Parametri = ParametriProgramma & {
  scheda?: string;
  q?: string;
  id?: string;
  preventivo?: string;
  archiviati?: string;
};

export default async function Produzione({ searchParams }: { searchParams: Promise<Parametri> }) {
  const io = await richiediSezione("/produzione");
  const p = await searchParams;
  const modificabile = io.ruolo === "titolare" || io.ruolo === "ufficio";

  if (p.scheda === "programma") return <SchedaProgramma p={p} titolare={io.ruolo === "titolare"} />;
  if (p.id) {
    return <SchedaCommessa id={p.id} preventivo={p.preventivo} modificabile={modificabile} ok={p.ok} errore={p.errore} />;
  }
  return <ElencoCommesse p={p} modificabile={modificabile} />;
}
