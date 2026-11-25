// Impostazioni → «Macchine e competenze» (solo titolare).
// Macchine e postazioni (le righe del programma del giorno), fermi macchina,
// chi sa usare cosa, orario di lavoro dell'azienda e orari personali.
import Link from "next/link";
import { creaClientServer } from "@/lib/supabase/server";
import {
  GIORNI,
  LIVELLI,
  TIPI_MACCHINA,
  dataIt,
  livelloSuccessivo,
  oggiIt,
  ora,
  riassuntoOrario,
  type Fascia,
  type LivelloCompetenza,
  type TipoMacchina,
} from "@/lib/produzione";
import { annullaFermo, impostaCompetenza, salvaFermo, salvaMacchina, salvaOrario } from "./azioniProduzione";

type Macchina = {
  id: string;
  nome: string;
  tipo: TipoMacchina;
  reparto: string | null;
  tariffa_id: string | null;
  fuori_sede: boolean;
  ordine: number;
  note: string | null;
  attivo: boolean;
};
type Persona = { id: string; nome: string; cognome: string };
type Competenza = { dipendente_id: string; macchina_id: string; livello: LivelloCompetenza };
type Orario = Fascia & { dipendente_id: string | null };
type Fermo = {
  id: string;
  macchina_id: string;
  dal: string;
  al: string;
  dalle: string | null;
  alle: string | null;
  motivo: string;
};

const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:bg-slate-100 disabled:text-slate-500";
const etichetta = "flex flex-col gap-1 text-xs font-medium text-slate-500";
const pulsante = "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700";
const secondario =
  "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50";
const riquadro = "rounded-xl border border-slate-200 bg-white";

/** Fermo in parole: "oggi dalle 14:00", "dal 26/11 al 28/11"… */
function periodoFermo(f: Fermo): string {
  const giorni = f.dal === f.al ? `il ${dataIt(f.dal)}` : `dal ${dataIt(f.dal)} al ${dataIt(f.al)}`;
  const ore =
    f.dalle && f.alle && f.dal === f.al
      ? ` dalle ${ora(f.dalle)} alle ${ora(f.alle)}`
      : `${f.dalle ? ` (dalle ${ora(f.dalle)} il primo giorno)` : ""}${f.alle ? ` (fino alle ${ora(f.alle)} l'ultimo)` : ""}`;
  return giorni + ore;
}

export default async function SchedaMacchine({ orarioDi }: { orarioDi?: string }) {
  const supabase = await creaClientServer();
  const oggi = oggiIt();
  const [risMacchine, risTariffe, risPersone, risCompetenze, risOrari, risFermi] = await Promise.all([
    supabase
      .from("macchine")
      .select("id, nome, tipo, reparto, tariffa_id, fuori_sede, ordine, note, attivo")
      .order("attivo", { ascending: false })
      .order("ordine")
      .order("nome"),
    supabase.from("tariffe_orarie").select("id, nome").eq("attivo", true).order("nome"),
    supabase.from("dipendenti").select("id, nome, cognome").eq("attivo", true).order("nome").order("cognome"),
    supabase.from("competenze").select("dipendente_id, macchina_id, livello").eq("attivo", true),
    supabase.from("orari_lavoro").select("dipendente_id, giorno_settimana, dalle, alle").eq("attivo", true),
    supabase
      .from("fermi_macchina")
      .select("id, macchina_id, dal, al, dalle, alle, motivo")
      .eq("attivo", true)
      .gte("al", oggi)
      .order("dal"),
  ]);
  const macchine = (risMacchine.data ?? []) as Macchina[];
  const attive = macchine.filter((m) => m.attivo);
  const tariffe = (risTariffe.data ?? []) as { id: string; nome: string }[];
  const persone = (risPersone.data ?? []) as Persona[];
  const competenze = (risCompetenze.data ?? []) as Competenza[];
  const orari = (risOrari.data ?? []) as Orario[];
  const fermi = (risFermi.data ?? []) as Fermo[];

  const livello = (d: string, m: string) =>
    competenze.find((c) => c.dipendente_id === d && c.macchina_id === m)?.livello ?? null;
  const orarioAzienda = orari.filter((o) => o.dipendente_id === null);
  const orarioPersonale = (d: string) => orari.filter((o) => o.dipendente_id === d);
  const fermoOggi = (m: string) => fermi.find((f) => f.macchina_id === m && f.dal <= oggi);
  const prossimoFermo = (m: string) => fermi.find((f) => f.macchina_id === m && f.dal > oggi);

  // orario in modifica: dell'azienda oppure di una persona (?orario=<id>)
  const personaOrario = persone.find((p) => p.id === orarioDi);
  const fasceInModifica = personaOrario
    ? orarioPersonale(personaOrario.id).length
      ? orarioPersonale(personaOrario.id)
      : orarioAzienda
    : orarioAzienda;

  return (
    <div className="flex flex-col gap-8">
      {/* ---------------- Macchine e postazioni ---------------- */}
      <section className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Macchine e postazioni</h2>
          <p className="mt-1 text-sm text-slate-500">
            Sono le righe del programma del giorno. Le <strong>postazioni</strong> sono i lavori senza macchina
            (grafica, laboratorio, posa); «Fuori sede» mostra l&apos;indirizzo della posa nel programma. La tariffa
            serve a riconoscere le fasi del preventivo quando si crea una commessa. Una macchina venduta si toglie
            con «Attiva» spento: resta nei programmi passati.
          </p>
        </div>

        {/* Nuova macchina o postazione */}
        <form action={salvaMacchina} className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <label className={`${etichetta} flex-[2_1_11rem]`}>
            Nome
            <input name="nome" required placeholder="es. Plotter nuovo" className={campo} />
          </label>
          <label className={`${etichetta} flex-[1_1_10rem]`}>
            Tipo
            <select name="tipo" defaultValue="macchina" className={campo}>
              {TIPI_MACCHINA.map((t) => (
                <option key={t.valore} value={t.valore}>{t.etichetta}</option>
              ))}
            </select>
          </label>
          <label className={`${etichetta} flex-[1_1_7rem]`}>
            Reparto
            <input name="reparto" placeholder="es. Stampa" className={campo} />
          </label>
          <label className={`${etichetta} flex-[1.4_1_10rem]`}>
            Tariffa del preventivo
            <select name="tariffa_id" defaultValue="" className={campo}>
              <option value="">— nessuna —</option>
              {tariffe.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </label>
          <label className={`${etichetta} w-24`}>
            Posizione
            <input name="ordine" type="number" min={0} max={9999} defaultValue={(attive.at(-1)?.ordine ?? 0) + 1} className={campo} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
            <input type="checkbox" name="fuori_sede" className="h-4 w-4" />
            Fuori sede
          </label>
          <button className={pulsante}>Aggiungi</button>
        </form>

        {macchine.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessuna macchina inserita.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {macchine.map((m) => {
              const ferma = m.attivo ? fermoOggi(m.id) : undefined;
              const prossimo = m.attivo && !ferma ? prossimoFermo(m.id) : undefined;
              return (
                <li key={m.id} className={`p-4 ${m.attivo ? "" : "opacity-60"}`}>
                  <form action={salvaMacchina} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="id" value={m.id} />
                    <label className={`${etichetta} flex-[2_1_11rem]`}>
                      Nome
                      <input name="nome" defaultValue={m.nome} required className={campo} />
                    </label>
                    <label className={`${etichetta} flex-[1_1_10rem]`}>
                      Tipo
                      <select name="tipo" defaultValue={m.tipo} className={campo}>
                        {TIPI_MACCHINA.map((t) => (
                          <option key={t.valore} value={t.valore}>{t.etichetta}</option>
                        ))}
                      </select>
                    </label>
                    <label className={`${etichetta} flex-[1_1_7rem]`}>
                      Reparto
                      <input name="reparto" defaultValue={m.reparto ?? ""} className={campo} />
                    </label>
                    <label className={`${etichetta} flex-[1.4_1_10rem]`}>
                      Tariffa del preventivo
                      <select name="tariffa_id" defaultValue={m.tariffa_id ?? ""} className={campo}>
                        <option value="">— nessuna —</option>
                        {tariffe.map((t) => (
                          <option key={t.id} value={t.id}>{t.nome}</option>
                        ))}
                      </select>
                    </label>
                    <label className={`${etichetta} w-24`}>
                      Posizione
                      <input name="ordine" type="number" min={0} max={9999} defaultValue={m.ordine} className={campo} />
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-sm whitespace-nowrap">
                      <input type="checkbox" name="fuori_sede" defaultChecked={m.fuori_sede} className="h-4 w-4" />
                      Fuori sede
                    </label>
                    <label className="flex items-center gap-2 pb-2 text-sm">
                      <input type="checkbox" name="attivo" defaultChecked={m.attivo} className="h-4 w-4" />
                      Attiva
                    </label>
                    <button className={pulsante}>Salva</button>
                  </form>
                  {!m.attivo && <p className="mt-2 text-xs text-slate-500">Tolta: non compare più nel programma.</p>}
                  {ferma && (
                    <p className="mt-2 inline-block rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-800">
                      Ferma: {ferma.motivo.toLowerCase()} {periodoFermo(ferma)}
                    </p>
                  )}
                  {prossimo && (
                    <p className="mt-2 text-xs text-slate-500">
                      Prossimo fermo: {prossimo.motivo.toLowerCase()} {periodoFermo(prossimo)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------- Fermi macchina ---------------- */}
      <section className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Fermi macchina</h2>
          <p className="mt-1 text-sm text-slate-500">
            Manutenzioni e guasti. Nel programma del giorno compare un avviso se si assegna un lavoro a una macchina
            ferma. Senza ore vale per giorni interi.
          </p>
        </div>
        <form action={salvaFermo} className="flex flex-wrap items-end gap-3 border-b border-slate-200 bg-slate-50 p-4">
          <label className={`${etichetta} flex-[1.6_1_12rem]`}>
            Macchina
            <select name="macchina_id" required defaultValue="" className={campo}>
              <option value="" disabled>Scegli…</option>
              {attive.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </label>
          <label className={`${etichetta} flex-[1_1_9rem]`}>
            Dal
            <input name="dal" type="date" required defaultValue={oggi} className={campo} />
          </label>
          <label className={`${etichetta} flex-[1_1_9rem]`}>
            Al (se più giorni)
            <input name="al" type="date" className={campo} />
          </label>
          <label className={`${etichetta} w-32`}>
            Dalle
            <input name="dalle" type="time" className={campo} />
          </label>
          <label className={`${etichetta} w-32`}>
            Alle
            <input name="alle" type="time" className={campo} />
          </label>
          <label className={`${etichetta} flex-[1.2_1_9rem]`}>
            Motivo
            <input name="motivo" placeholder="Manutenzione" className={campo} />
          </label>
          <button className={pulsante}>Registra</button>
        </form>
        {fermi.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessun fermo in corso o in programma.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {fermi.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <strong>{macchine.find((m) => m.id === f.macchina_id)?.nome}</strong>
                <span>{f.motivo}</span>
                <span className="text-slate-500">{periodoFermo(f)}</span>
                <form action={annullaFermo} className="ml-auto">
                  <input type="hidden" name="id" value={f.id} />
                  <button className={secondario}>Togli</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Chi sa usare cosa ---------------- */}
      <section className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">Chi sa usare cosa</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tocca una casella per cambiarla: vuota → sa usarla → principale → vuota. Nel programma del giorno, per
            ogni lavoro l&apos;app propone prima chi ha la macchina come principale, poi chi sa usarla. Le persone
            sono i dipendenti attivi (Impostazioni → Utenti).
          </p>
        </div>
        {persone.length === 0 || attive.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Servono almeno un dipendente attivo e una macchina attiva.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  <th className="sticky left-0 bg-white px-4 py-3 text-left">Persona</th>
                  {attive.map((m) => (
                    <th key={m.id} className="px-2 py-3 text-center normal-case">{m.nome}</th>
                  ))}
                  <th className="px-4 py-3 text-left">Orario di lavoro</th>
                </tr>
              </thead>
              <tbody>
                {persone.map((p) => {
                  const personale = orarioPersonale(p.id);
                  return (
                    <tr key={p.id} className="border-b border-slate-100">
                      <th scope="row" className="sticky left-0 bg-white px-4 py-2 text-left font-semibold whitespace-nowrap">
                        {p.nome} {p.cognome}
                      </th>
                      {attive.map((m) => {
                        const l = livello(p.id, m.id);
                        const prossimo = livelloSuccessivo(l);
                        const testo = l ? LIVELLI[l] : "—";
                        const stile =
                          l === "principale"
                            ? "border-blue-600 bg-blue-600 text-white"
                            : l === "sa_usarla"
                              ? "border-blue-300 bg-blue-100 text-blue-900"
                              : "border-dashed border-slate-300 bg-white text-slate-500";
                        return (
                          <td key={m.id} className="px-2 py-2 text-center">
                            <form action={impostaCompetenza}>
                              <input type="hidden" name="dipendente_id" value={p.id} />
                              <input type="hidden" name="macchina_id" value={m.id} />
                              <input type="hidden" name="livello" value={prossimo ?? ""} />
                              <button
                                aria-label={`${p.nome} ${p.cognome}, ${m.nome}: ${l ? testo : "non la usa"}. Cambia in ${prossimo ? LIVELLI[prossimo] : "non la usa"}`}
                                className={`min-h-10 min-w-24 rounded-lg border px-2 py-1 text-xs font-semibold ${stile}`}
                              >
                                {testo}
                              </button>
                            </form>
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-xs text-slate-600">
                        <div>{personale.length ? riassuntoOrario(personale) : "Orario dell'azienda"}</div>
                        <Link
                          href={`/impostazioni?scheda=macchine&orario=${p.id}#orario`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {personale.length ? "Modifica orario" : "Orario personale"}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-4 border-t border-slate-200 p-4 text-xs text-slate-600">
          <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded bg-blue-600" />Principale: è la sua macchina</span>
          <span className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded border border-blue-300 bg-blue-100" />Sa usarla: può sostituire</span>
        </div>
      </section>

      {/* ---------------- Orario di lavoro ---------------- */}
      <section id="orario" className={riquadro}>
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-semibold">
            {personaOrario ? `Orario di ${personaOrario.nome} ${personaOrario.cognome}` : "Orario di lavoro dell'azienda"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {personaOrario ? (
              <>
                Un orario personale (part-time, sabato…) <strong>sostituisce</strong> quello dell&apos;azienda per
                questa persona.{" "}
                {orarioPersonale(personaOrario.id).length === 0 && "Oggi segue l'orario dell'azienda: lo trovi già compilato qui sotto da cambiare. "}
                <Link href="/impostazioni?scheda=macchine#orario" className="font-semibold text-blue-700 hover:underline">
                  Torna all&apos;orario dell&apos;azienda
                </Link>
              </>
            ) : (
              <>
                Vale per tutti, tranne chi ha un orario personale. Serve al programma del giorno per contare le ore
                libere e avvisare dei lavori fuori orario. Ora: {riassuntoOrario(orarioAzienda)}.
              </>
            )}
          </p>
        </div>
        <form
          key={`${personaOrario?.id ?? "azienda"}-${fasceInModifica.map((f) => f.giorno_settimana + f.dalle + f.alle).join()}`}
          action={salvaOrario}
          className="flex flex-col gap-3 p-4"
        >
          {personaOrario && <input type="hidden" name="dipendente_id" value={personaOrario.id} />}
          <div className="overflow-x-auto">
            <table className="text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500">
                  <th className="py-2 pr-4">Giorno</th>
                  <th className="px-2 py-2" colSpan={2}>Mattina (o fascia unica)</th>
                  <th className="px-2 py-2" colSpan={2}>Pomeriggio</th>
                </tr>
              </thead>
              <tbody>
                {GIORNI.map((g) => {
                  const f = fasceInModifica
                    .filter((x) => x.giorno_settimana === g.numero)
                    .sort((a, b) => a.dalle.localeCompare(b.dalle));
                  return (
                    <tr key={g.numero}>
                      <th scope="row" className="py-1 pr-4 text-left font-medium">{g.nome}</th>
                      {[0, 1].map((i) => (
                        <FasciaCampi key={i} giorno={g.numero} n={i + 1} nome={g.nome} fascia={f[i]} />
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">Un giorno senza orari è un giorno di riposo.</p>
          <div className="flex flex-wrap gap-3">
            <button className={pulsante}>{personaOrario ? "Salva orario personale" : "Salva orario dell'azienda"}</button>
            {personaOrario && orarioPersonale(personaOrario.id).length > 0 && (
              <button name="usa_aziendale" value="1" className={secondario}>Usa l&apos;orario dell&apos;azienda</button>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}

function FasciaCampi({ giorno, n, nome, fascia }: { giorno: number; n: number; nome: string; fascia?: Fascia }) {
  const quale = n === 1 ? "mattina" : "pomeriggio";
  return (
    <>
      <td className="px-2 py-1">
        <input
          type="time"
          name={`g${giorno}_${n}_dalle`}
          defaultValue={ora(fascia?.dalle)}
          aria-label={`${nome}, ${quale}: dalle`}
          className={campo}
        />
      </td>
      <td className="px-2 py-1">
        <input
          type="time"
          name={`g${giorno}_${n}_alle`}
          defaultValue={ora(fascia?.alle)}
          aria-label={`${nome}, ${quale}: alle`}
          className={campo}
        />
      </td>
    </>
  );
}
