// Produzione → «Il mio programma»: i miei lavori del giorno, pensati per il telefono.
// L'operaio li segna «Inizia» e «Finito»; lo stato della commessa si aggiorna da solo.
// Indirizzo: /produzione?scheda=mio&giorno=<data>
// Il titolare può guardare (e segnare) il programma di una persona: &persona=<dipendente>.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt, ora } from "@/lib/produzione";
import { durata, fasceDi, giornoSettimana, oreDaMinuti, periodoNelGiorno, spostaGiorno, testoIntervalli, type FasciaOrario } from "@/lib/programma";
import { campo, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { EtichettaStatoLavoro, EtichettaUrgente, Messaggi, SchedeProduzione, indirizzo } from "./comuni";
import { avvisi, type Assegnazione } from "./programmaDati";
import { cambiaStatoLavoro } from "./azioniProgramma";

type Parametri = { giorno?: string; persona?: string; ok?: string; errore?: string };
type Persona = { id: string; nome_completo: string; io: boolean };

const NOMI_GIORNO = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

export default async function SchedaMioProgramma({ p, titolare }: { p: Parametri; titolare: boolean }) {
  const oggi = oggiIt();
  const giorno = p.giorno && /^\d{4}-\d{2}-\d{2}$/.test(p.giorno) ? p.giorno : oggi;
  const supabase = await creaClientServer();

  const { data: risPersone } = await supabase.from("dipendenti_elenco").select("id, nome_completo, io").eq("attivo", true).order("nome").order("cognome");
  const persone = (risPersone ?? []) as Persona[];
  const io = persone.find((x) => x.io) ?? null;
  // il titolare può scegliere una persona; gli altri vedono solo sé stessi
  const persona = titolare && p.persona ? persone.find((x) => x.id === p.persona) ?? io : io;

  const intestazione = (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{persona && !persona.io ? `Programma di ${persona.nome_completo}` : "Il mio programma"}</h1>
        <p className="mt-1 text-sm text-slate-500">I lavori del giorno: segna quando inizi e quando hai finito</p>
      </header>
      <SchedeProduzione attiva="mio" />
      <Messaggi ok={p.ok} errore={p.errore} />
    </>
  );

  if (!persona) {
    return (
      <div className="flex flex-col gap-5">
        {intestazione}
        <p className={`${riquadro} p-4 text-sm text-slate-600`}>
          Il tuo account non è collegato a un dipendente, quindi non hai un programma tuo. Il collegamento lo fa il
          titolare in Impostazioni → Utenti → Dipendenti.
        </p>
        {titolare && <SceltaPersona persone={persone} giorno={giorno} scelta={null} />}
      </div>
    );
  }

  const [risMiei, risAssenze, risOrari, risProssimi] = await Promise.all([
    supabase.from("programma").select("*").eq("giorno", giorno).eq("dipendente_id", persona.id).order("dalle"),
    supabase.from("assenze_elenco").select("dal, al, dalle, alle, motivo").eq("dipendente_id", persona.id).lte("dal", giorno).gte("al", giorno),
    supabase.from("orari_lavoro").select("dipendente_id, giorno_settimana, dalle, alle").eq("attivo", true),
    supabase
      .from("programma")
      .select("giorno, ore")
      .eq("dipendente_id", persona.id)
      .gt("giorno", giorno)
      .lte("giorno", spostaGiorno(giorno, 14))
      .order("giorno"),
  ]);
  const miei = (risMiei.data ?? []) as Assegnazione[];
  const assenze = (risAssenze.data ?? []) as { dal: string; al: string; dalle: string | null; alle: string | null; motivo: string }[];
  const fasce = fasceDi(persona.id, giorno, (risOrari.data ?? []) as FasciaOrario[]);
  const prossimi = new Map<string, { lavori: number; ore: number }>();
  for (const r of (risProssimi.data ?? []) as { giorno: string; ore: number }[]) {
    const x = prossimi.get(r.giorno) ?? { lavori: 0, ore: 0 };
    prossimi.set(r.giorno, { lavori: x.lavori + 1, ore: x.ore + Number(r.ore) });
  }

  const scelta = titolare && !persona.io ? persona.id : undefined;
  const link = (g: string) => indirizzo({ scheda: "mio", giorno: g, persona: scelta });
  const occupato = durata(miei.map((a) => ({ da: minuti(a.dalle), a: minuti(a.alle) })));

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      {intestazione}
      {titolare && <SceltaPersona persone={persone} giorno={giorno} scelta={persona.id} />}

      {/* giorno */}
      <div className="flex items-center gap-2">
        <Link href={link(spostaGiorno(giorno, -1))} aria-label="Giorno precedente" className={`${pulsanteSecondario} px-4 text-lg`}>‹</Link>
        <div className="flex-1 text-center">
          <div className="text-lg font-bold capitalize">{NOMI_GIORNO[giornoSettimana(giorno)]} {dataIt(giorno)}</div>
          <div className="text-xs text-slate-500">
            {giorno === oggi ? "oggi" : giorno === spostaGiorno(oggi, 1) ? "domani" : giorno === spostaGiorno(oggi, -1) ? "ieri" : ""}
            {fasce.length ? ` · orario ${testoIntervalli(fasce)}` : " · giorno di riposo"}
          </div>
        </div>
        <Link href={link(spostaGiorno(giorno, 1))} aria-label="Giorno successivo" className={`${pulsanteSecondario} px-4 text-lg`}>›</Link>
      </div>
      {giorno !== oggi && (
        <Link href={link(oggi)} className="self-center text-sm font-semibold text-blue-700 hover:underline">Torna a oggi</Link>
      )}

      {assenze.map((a, i) => {
        const x = periodoNelGiorno(a, giorno);
        const tutto = !x || (x.da === 0 && x.a === 1440);
        return (
          <p key={i} className="rounded-xl bg-purple-100 px-4 py-3 text-sm font-semibold text-purple-900">
            {a.motivo === "ferie" ? "Ferie" : a.motivo === "permesso" ? "Permesso" : a.motivo === "malattia" ? "Malattia" : "Assente"}
            {tutto ? " tutto il giorno" : ` ${testoIntervalli([x])}`}
          </p>
        );
      })}

      {miei.length === 0 ? (
        <p className={`${riquadro} p-6 text-center text-sm text-slate-600`}>Nessun lavoro nel programma per questo giorno.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {miei.length} {miei.length === 1 ? "lavoro" : "lavori"} · {oreDaMinuti(occupato)}
          </p>
          <ol className="flex flex-col gap-3">
            {miei.map((a) => (
              <Lavoro key={a.id} a={a} giorno={giorno} persona={scelta} />
            ))}
          </ol>
        </>
      )}

      {prossimi.size > 0 && (
        <section className={`${riquadro} p-4`}>
          <h2 className="mb-2 text-sm font-semibold">Prossimi giorni</h2>
          <ul className="flex flex-col divide-y divide-slate-100 text-sm">
            {[...prossimi.entries()].map(([g, x]) => (
              <li key={g}>
                <Link href={link(g)} className="flex justify-between py-2 hover:text-blue-700">
                  <span className="capitalize">{NOMI_GIORNO[giornoSettimana(g)]} {dataIt(g).slice(0, 5)}</span>
                  <span className="text-slate-600">
                    {x.lavori} {x.lavori === 1 ? "lavoro" : "lavori"} · {oreDaMinuti(x.ore * 60)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Lavoro({ a, giorno, persona }: { a: Assegnazione; giorno: string; persona?: string }) {
  const problemi = avvisi(a).filter((x) => x !== "manca la persona");
  const bottone = (stato: "da_fare" | "in_corso" | "finito", testo: string, stile: string) => (
    <form action={cambiaStatoLavoro} className="flex-1">
      <input type="hidden" name="lavoro_id" value={a.lavoro_id} />
      <input type="hidden" name="stato" value={stato} />
      <input type="hidden" name="giorno" value={giorno} />
      {persona && <input type="hidden" name="persona" value={persona} />}
      <button className={`min-h-12 w-full rounded-xl px-4 text-base font-semibold ${stile}`}>{testo}</button>
    </form>
  );
  const bordo = a.stato_lavoro === "finito" ? "border-green-300 bg-green-50" : a.stato_lavoro === "in_corso" ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white";
  return (
    <li className={`flex flex-col gap-2 rounded-xl border-2 p-4 ${bordo}`}>
      <div className="flex items-start gap-3">
        <div className="text-lg font-bold tabular-nums">{ora(a.dalle)}–{ora(a.alle)}</div>
        <div className="ml-auto flex flex-wrap justify-end gap-1">
          {a.urgente && <EtichettaUrgente />}
          <EtichettaStatoLavoro stato={a.stato_lavoro} />
        </div>
      </div>
      <div>
        <div className="text-base font-semibold">{a.titolo}</div>
        <div className="text-sm text-slate-700">
          {a.macchina ?? "Macchina da decidere"}
          {a.commessa_numero && <> · commessa {a.commessa_numero}</>}
        </div>
        {a.cliente && <div className="text-sm text-slate-600">{a.cliente}{a.commessa_descrizione ? ` · ${a.commessa_descrizione}` : ""}</div>}
      </div>
      {a.luogo_posa && (
        <p className="rounded-lg bg-white px-3 py-2 text-sm">
          <span className="font-semibold">Dove: </span>
          {a.luogo_posa}
        </p>
      )}
      {a.descrizione && <p className="text-sm text-slate-700">{a.descrizione}</p>}
      {a.note && <p className="text-sm text-slate-700"><span className="font-semibold">Note: </span>{a.note}</p>}
      {problemi.length > 0 && <p className="text-xs text-orange-800">Da controllare con il titolare: {problemi.join(", ")}.</p>}
      {a.persona_su_piu_lavori && <p className="text-xs text-slate-500">In questo orario hai anche un altro lavoro.</p>}

      <div className="mt-1 flex gap-2">
        {a.stato_lavoro === "da_fare" && bottone("in_corso", "Inizia", "bg-blue-600 text-white hover:bg-blue-700")}
        {a.stato_lavoro !== "finito" && bottone("finito", "Finito", "bg-green-700 text-white hover:bg-green-800")}
        {a.stato_lavoro === "finito" && bottone("in_corso", "Non è finito, riapri", "border border-slate-300 bg-white text-slate-700")}
      </div>
      {a.stato_lavoro !== "finito" && (
        <p className="text-xs text-slate-500">«Finito» vuol dire che tutto il lavoro è fatto, non solo la parte di oggi.</p>
      )}
    </li>
  );
}

function SceltaPersona({ persone, giorno, scelta }: { persone: Persona[]; giorno: string; scelta: string | null }) {
  return (
    <form action="/produzione" className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="scheda" value="mio" />
      <input type="hidden" name="giorno" value={giorno} />
      <label className="text-slate-600" htmlFor="persona-programma">Guarda il programma di</label>
      <select id="persona-programma" name="persona" defaultValue={scelta ?? ""} className={`${campo} w-56`}>
        {persone.map((x) => (
          <option key={x.id} value={x.id}>{x.nome_completo}{x.io ? " (tu)" : ""}</option>
        ))}
      </select>
      <button className={pulsanteSecondario}>Vedi</button>
    </form>
  );
}

function minuti(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}
