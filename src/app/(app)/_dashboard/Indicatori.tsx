// Dashboard → i quattro riquadri con i numeri (titolare, ufficio, contabilità).
// Preventivi aperti, commesse in produzione, presenti oggi, programma di oggi.
// Ogni riquadro porta alla scheda dove si vedono i dettagli.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { oggiIt } from "@/lib/produzione";
import { giornoSettimana, spostaGiorno } from "@/lib/programma";
import { contaStati, leggiPresenze } from "../timbrature/datiPresenze";

type Preventivo = { stato: "bozza" | "inviato"; valido_fino: string | null };
type Commessa = { stato: string; data_consegna: string | null; urgente: boolean };
type Assegnazione = { stato_lavoro: string; urgente: boolean; senza_persona: boolean; persona_assente: boolean; macchina_ferma: boolean };

function Riquadro({
  href,
  etichetta,
  valore,
  sotto,
  allarme = false,
}: {
  href: string;
  etichetta: string;
  valore: string;
  sotto: string;
  allarme?: boolean;
}) {
  return (
    <Link href={href} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm">
      <div className="text-sm text-slate-500">{etichetta}</div>
      <div className={`mt-1.5 text-3xl font-bold tabular-nums ${allarme ? "text-red-700" : "text-slate-900"}`}>{valore}</div>
      <div className="text-sm text-slate-500">{sotto}</div>
    </Link>
  );
}

/** "1 in ritardo · 2 in attesa" senza le parti a zero; se è tutto a zero, il testo di riserva */
function parti(testi: [number, string][], riserva: string): string {
  const pieni = testi.filter(([n]) => n > 0).map(([n, t]) => `${n} ${t}`);
  return pieni.length ? pieni.join(" · ") : riserva;
}

export default async function Indicatori() {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  const domenica = spostaGiorno(oggi, 7 - giornoSettimana(oggi));

  const [risPreventivi, risCommesse, presenze, risProgramma] = await Promise.all([
    supabase.from("preventivi").select("stato, valido_fino").eq("attivo", true).in("stato", ["bozza", "inviato"]),
    supabase.from("commesse_elenco").select("stato, data_consegna, urgente").eq("attivo", true).neq("stato", "completata"),
    leggiPresenze(supabase, oggi),
    supabase.from("programma").select("stato_lavoro, urgente, senza_persona, persona_assente, macchina_ferma").eq("giorno", oggi),
  ]);

  const preventivi = (risPreventivi.data ?? []) as Preventivo[];
  const inviati = preventivi.filter((p) => p.stato === "inviato");
  const scaduti = inviati.filter((p) => p.valido_fino && p.valido_fino < oggi).length;
  const bozze = preventivi.length - inviati.length;

  const commesse = (risCommesse.data ?? []) as Commessa[];
  const inRitardo = commesse.filter((c) => c.data_consegna && c.data_consegna < oggi).length;
  const settimana = commesse.filter((c) => c.data_consegna && c.data_consegna >= oggi && c.data_consegna <= domenica).length;

  // contano le persone che oggi lavorano (o hanno timbrato): non chi è a riposo
  const righe = presenze.righe.filter((r) => r.stato !== "riposo" || r.g);
  const dentro = contaStati(righe, ["presente", "pausa"]);
  const assenti = contaStati(righe, ["assente"]);
  const nonTimbrati = contaStati(righe, ["non_timbrato"]);
  const nonAncora = contaStati(righe, ["non_ancora"]);
  const usciti = contaStati(righe, ["uscito", "uscita_mancante"]);

  const programma = (risProgramma.data ?? []) as Assegnazione[];
  const daSistemare = programma.filter((a) => a.senza_persona || a.persona_assente || a.macchina_ferma).length;
  const urgenti = programma.filter((a) => a.urgente && a.stato_lavoro !== "finito").length;

  return (
    <section aria-label="Indicatori" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
      <Riquadro
        href="/preventivi"
        etichetta="Preventivi aperti"
        valore={String(preventivi.length)}
        sotto={parti([[inviati.length, "in attesa di risposta"], [scaduti, "scaduti"], [bozze, "in bozza"]], "Nessun preventivo aperto")}
      />
      <Riquadro
        href="/produzione"
        etichetta="Commesse in produzione"
        valore={String(commesse.length)}
        sotto={parti([[inRitardo, "in ritardo"], [settimana, "da consegnare entro domenica"]], "Nessuna consegna questa settimana")}
        allarme={inRitardo > 0}
      />
      <Riquadro
        href="/timbrature?scheda=presenze"
        etichetta="Presenti oggi"
        valore={presenze.errore ? "—" : `${dentro} / ${righe.length}`}
        sotto={
          presenze.errore
            ? "Timbrature non disponibili"
            : parti([[assenti, assenti === 1 ? "assente" : "assenti"], [nonTimbrati, nonTimbrati === 1 ? "non timbrato" : "non timbrati"], [nonAncora, "non ancora entrati"], [usciti, usciti === 1 ? "uscito" : "usciti"]], righe.length ? "Tutti presenti" : "Oggi nessuno lavora")
        }
        allarme={nonTimbrati > 0}
      />
      <Riquadro
        href="/produzione?scheda=programma"
        etichetta="Da sistemare nel programma"
        valore={String(daSistemare)}
        sotto={
          programma.length
            ? parti([[programma.length, programma.length === 1 ? "lavoro oggi" : "lavori oggi"], [urgenti, urgenti === 1 ? "urgente" : "urgenti"]], "")
            : "Nessun lavoro in programma oggi"
        }
        allarme={daSistemare > 0}
      />
    </section>
  );
}
