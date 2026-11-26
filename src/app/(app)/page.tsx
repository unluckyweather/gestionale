// Dashboard: la panoramica di oggi. Cosa si vede dipende dal ruolo:
//   titolare, ufficio, contabilità → i riquadri con i numeri (_dashboard/Indicatori.tsx)
//   chi è collegato a un dipendente (anche il titolare) → «La mia giornata» (_dashboard/MiaGiornata.tsx)
//   titolare, ufficio, contabilità → commesse in corso, ore previste e reali (lib/oreReali.ts); tutti → pose in programma e materiali da riordinare
//   solo titolare → richieste di ferie da decidere e attività recenti (registro delle modifiche)
// I permessi veri stanno nel database (RLS): qui si sceglie solo cosa mostrare.
import { richiediSezione } from "@/lib/utente";
import { ETICHETTE_RUOLO } from "@/lib/ruoli";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { giornoSettimana } from "@/lib/programma";
import Indicatori from "./_dashboard/Indicatori";
import MiaGiornata from "./_dashboard/MiaGiornata";
import CommesseInCorso from "./_dashboard/CommesseInCorso";
import PoseInProgramma from "./_dashboard/PoseInProgramma";
import DaRiordinare from "./_dashboard/DaRiordinare";
import RichiesteDaDecidere from "./_dashboard/RichiesteDaDecidere";
import AttivitaRecenti from "./_dashboard/AttivitaRecenti";
import OrePreviste from "./_dashboard/OrePreviste";

const NOMI_GIORNO = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

function saluto(): string {
  const ora = Number(
    new Intl.DateTimeFormat("it-IT", { hour: "numeric", hour12: false, timeZone: "Europe/Rome" }).format(new Date())
  );
  if (ora < 13) return "Buongiorno";
  if (ora < 18) return "Buon pomeriggio";
  return "Buonasera";
}

export default async function Dashboard() {
  const utente = await richiediSezione("/");
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  // il dipendente collegato a chi è entrato (vuoto: non timbra)
  const { data: mio } = await supabase.from("dipendenti_elenco").select("id").eq("io", true).eq("attivo", true).maybeSingle();
  const uffici = utente.ruolo !== "operaio";
  const titolare = utente.ruolo === "titolare";

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {saluto()}, {utente.nome}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Panoramica di {NOMI_GIORNO[giornoSettimana(oggi)]} {dataIt(oggi)} · accesso come {ETICHETTE_RUOLO[utente.ruolo]}
        </p>
      </header>

      {uffici && <Indicatori />}
      {mio && <MiaGiornata dipendente={mio.id} />}

      {/* come nel mockup: commesse e attività recenti affiancate; chi non è titolare ha qui le pose */}
      <div className="flex flex-wrap items-start gap-6">
        {uffici && <CommesseInCorso />}
        {titolare ? <AttivitaRecenti /> : <PoseInProgramma />}
      </div>

      {/* come nel mockup: ore previste e reali accanto alle pose (per il titolare) */}
      <div className="flex flex-wrap items-start gap-6">
        {uffici && <OrePreviste />}
        {titolare && <PoseInProgramma />}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        {titolare && <RichiesteDaDecidere />}
        <DaRiordinare />
      </div>
    </div>
  );
}
