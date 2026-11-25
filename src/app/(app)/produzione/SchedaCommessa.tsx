// Pagina della singola commessa: ?id=<commessa>, ?id=nuova, ?id=nuova&preventivo=<preventivo>.
// Titolare e ufficio la modificano; contabilità e operai la vedono in sola lettura (senza prezzi:
// una commessa non ne ha).
import Link from "next/link";
import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";
import { dataIt, oggiIt } from "@/lib/produzione";
import { pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { leggiFasi } from "../preventivi/letture";
import { archiviaCommessa, cambiaStatoCommessa, type LavoroModulo } from "./azioni";
import {
  Avviso,
  EtichettaStatoCommessa,
  EtichettaStatoLavoro,
  EtichettaUrgente,
  Messaggi,
  indirizzo,
  oreTesto,
  programmato,
  type StatoCommessa,
  type StatoLavoro,
} from "./comuni";
import MaterialiCommessa from "./MaterialiCommessa";
import ModuloCommessa, { type CommessaLetta, type LavoroLetto, type MacchinaScelta } from "./ModuloCommessa";

type Props = { id: string; preventivo?: string; modificabile: boolean; materiali: boolean; ok?: string; errore?: string };

type Elenco = {
  cliente: string;
  luogo: string | null;
  lavori: number;
  lavori_finiti: number;
  ore_previste: number;
  ore_finite: number;
  avanzamento: number;
};

export default async function SchedaCommessa({ id, preventivo, modificabile, materiali, ok, errore }: Props) {
  const nuova = id === "nuova";
  if (nuova && !modificabile) return <Avviso testo="Non hai i permessi per creare commesse." />;
  if (!nuova && !/^[0-9a-f-]{36}$/i.test(id)) return <Avviso testo="Commessa non trovata." />;

  const supabase = await creaClientServer();

  const [risCommessa, risElenco, risLavori, risRiepilogo, risMacchine] = await Promise.all([
    nuova
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("commesse")
          .select("id, numero, preventivo_id, soggetto_id, sede_id, descrizione, data, data_consegna, stato, urgente, note, attivo, aggiornato_il")
          .eq("id", id)
          .maybeSingle(),
    nuova
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("commesse_elenco")
          .select("cliente, luogo, lavori, lavori_finiti, ore_previste, ore_finite, avanzamento")
          .eq("id", id)
          .maybeSingle(),
    nuova
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("lavori")
          .select("id, fase_id, titolo, descrizione, macchina_id, ore_previste, stato, iniziato_il, finito_il")
          .eq("commessa_id", id)
          .eq("attivo", true)
          .order("ordine"),
    nuova
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("lavori_riepilogo").select("lavoro_id, ore_programmate, primo_giorno, ultimo_giorno").eq("commessa_id", id),
    supabase.from("macchine").select("id, nome, tipo, tariffa_id, attivo").order("ordine").order("nome"),
  ]);

  const errori = [risCommessa.error, risElenco.error, risLavori.error, risMacchine.error].filter(Boolean);
  if (errori.length) {
    console.error("Lettura della commessa non riuscita:", errori[0]?.message);
    return (
      <Avviso testo="Non riesco a leggere tutti i dati della commessa dal database, quindi non la mostro per evitare di salvarla incompleta. Riprova tra poco." />
    );
  }

  const commessa = (risCommessa.data ?? null) as (CommessaLetta & {
    numero: string;
    stato: StatoCommessa;
    attivo: boolean;
    aggiornato_il: string;
  }) | null;
  if (!nuova && !commessa) return <Avviso testo="Commessa non trovata." />;
  const letto = (risElenco.data ?? null) as Elenco | null;
  // avanzamento vuoto = nessun lavoro finito (la vista della 0010 non lo trasforma in 0)
  const elenco = letto ? { ...letto, avanzamento: Number(letto.avanzamento ?? 0) } : null;
  const macchine = (risMacchine.data ?? []) as MacchinaScelta[];
  const riepilogo = new Map(
    ((risRiepilogo.data ?? []) as { lavoro_id: string; ore_programmate: number; primo_giorno: string | null; ultimo_giorno: string | null }[]).map(
      (r) => [r.lavoro_id, r]
    )
  );
  const lavori = ((risLavori.data ?? []) as (LavoroLetto & { stato: StatoLavoro })[]).map((l) => {
    const r = riepilogo.get(l.id);
    return { ...l, ore_programmate: Number(r?.ore_programmate ?? 0), primo_giorno: r?.primo_giorno ?? null, ultimo_giorno: r?.ultimo_giorno ?? null };
  });

  // ------------------------------------------------------------------
  // Sola lettura (contabilità, operai, commessa archiviata): niente moduli
  // ------------------------------------------------------------------
  if (commessa && (!modificabile || !commessa.attivo)) {
    return (
      <div className="flex flex-col gap-5">
        <Intestazione numero={commessa.numero} stato={commessa.stato} urgente={commessa.urgente} archiviata={!commessa.attivo} />
        <Messaggi ok={ok} errore={errore} />
        {modificabile && <BarraStato id={commessa.id} stato={commessa.stato} attivo={commessa.attivo} elenco={elenco} />}
        <section className={`${riquadro} grid gap-3 p-4 text-sm md:grid-cols-2`}>
          <Dato nome="Cliente" valore={elenco?.cliente} />
          <Dato nome="Dove (posa o consegna)" valore={elenco?.luogo} />
          <Dato nome="Descrizione" valore={commessa.descrizione} />
          <Dato nome="Consegna" valore={dataIt(commessa.data_consegna) || "—"} />
          {commessa.note && <Dato nome="Note" valore={commessa.note} />}
        </section>
        <ElencoLavori lavori={lavori} macchine={macchine} avanzamento={elenco?.avanzamento ?? 0} />
        {materiali && (
          <MaterialiCommessa commessaId={commessa.id} preventivoId={commessa.preventivo_id} modificabile={modificabile} attiva={commessa.attivo} />
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Modificabile (titolare, ufficio): dati per il modulo
  // ------------------------------------------------------------------
  const [risClienti, risSedi] = await Promise.all([
    supabase
      .from("soggetti")
      .select("id, denominazione, comune, attivo")
      .in("tipo", ["cliente", "entrambi"])
      .order("denominazione")
      .limit(5000),
    supabase.from("sedi_soggetto").select("id, soggetto_id, nome, indirizzo, civico, comune, attivo").order("nome"),
  ]);
  if (risClienti.error || risSedi.error) {
    return <Avviso testo="Non riesco a leggere clienti e sedi dal database. Riprova tra poco." />;
  }

  // «Converti in commessa»: dal preventivo accettato, lavori proposti dalle fasi
  let daPreventivo: { id: string; numero: string; oggetto: string; soggetto_id: string } | null = null;
  let proposti: LavoroModulo[] = [];
  if (nuova && preventivo) {
    const { data: prev } = await supabase
      .from("preventivi")
      .select("id, numero, oggetto, soggetto_id, stato, attivo, commesse(id, attivo)")
      .eq("id", preventivo)
      .maybeSingle();
    const p = prev as unknown as
      | { id: string; numero: string; oggetto: string; soggetto_id: string; stato: string; attivo: boolean; commesse: { id: string; attivo: boolean }[] }
      | null;
    if (!p || !p.attivo) return <Avviso testo="Preventivo non trovato." />;
    const esistente = p.commesse.find((c) => c.attivo);
    if (esistente) redirect(indirizzo({ id: esistente.id, ok: `Il preventivo ${p.numero} ha già questa commessa.` }));
    if (p.stato !== "accettato")
      return <Avviso testo={`Il preventivo ${p.numero} non è accettato: segnalo come accettato prima di convertirlo in commessa.`} />;
    daPreventivo = p;

    const fasi = await leggiFasi(supabase, { preventivo: p.id });
    if (fasi === null) return <Avviso testo="Non riesco a leggere le fasi del preventivo. Riprova tra poco." />;
    const attive = macchine.filter((m) => m.attivo);
    proposti = fasi.map((f) => {
      // ore della fase e tariffa con più ore: la macchina che ha quella tariffa
      const perTariffa = new Map<string, number>();
      let ore = 0;
      for (const r of f.ore_fase) {
        ore += Number(r.ore);
        perTariffa.set(r.tariffa_id, (perTariffa.get(r.tariffa_id) ?? 0) + Number(r.ore));
      }
      const tariffa = [...perTariffa.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const macchina = tariffa ? attive.find((m) => m.tariffa_id === tariffa) : undefined;
      return {
        id: "",
        fase_id: f.id,
        titolo: f.titolo,
        descrizione: "",
        macchina_id: macchina?.id ?? "",
        ore_previste: ore ? String(Math.round(ore * 100) / 100).replace(".", ",") : "",
      };
    });
  }

  const clienti = ((risClienti.data ?? []) as { id: string; denominazione: string; comune: string | null; attivo: boolean }[]).filter(
    (c) => c.attivo || c.id === commessa?.soggetto_id || c.id === daPreventivo?.soggetto_id
  );
  const sedi = ((risSedi.data ?? []) as { id: string; soggetto_id: string; nome: string | null; indirizzo: string | null; civico: string | null; comune: string | null; attivo: boolean }[]).filter(
    (s) => s.attivo || s.id === commessa?.sede_id
  );

  return (
    <div className="flex flex-col gap-5">
      {commessa ? (
        <Intestazione numero={commessa.numero} stato={commessa.stato} urgente={commessa.urgente} archiviata={!commessa.attivo} />
      ) : (
        <header className="flex flex-col gap-1">
          <Link href={indirizzo({})} className="text-sm text-blue-700 hover:underline">← Commesse</Link>
          <h1 className="text-2xl font-semibold">
            {daPreventivo ? `Converti il preventivo ${daPreventivo.numero} in commessa` : "Nuova commessa"}
          </h1>
          <p className="text-sm text-slate-500">
            {daPreventivo
              ? `La commessa avrà lo stesso numero (${daPreventivo.numero}) e lo stesso cliente. Ogni fase del preventivo diventa un lavoro: controlla macchine e ore, poi salva.`
              : "Una commessa senza preventivo prende il numero successivo dei preventivi."}
          </p>
        </header>
      )}
      <Messaggi ok={ok} errore={errore} />

      {commessa && (
        <BarraStato id={commessa.id} stato={commessa.stato} attivo={commessa.attivo} elenco={elenco} />
      )}

      <ModuloCommessa
        key={commessa ? `${commessa.id}-${commessa.aggiornato_il}` : `nuova-${preventivo ?? ""}`}
        commessa={commessa}
        preventivo={daPreventivo}
        lavoriProposti={proposti}
        lavori={lavori}
        clienti={clienti}
        sedi={sedi}
        macchine={macchine}
        oggi={oggiIt()}
      />
      {commessa && materiali && (
        <MaterialiCommessa commessaId={commessa.id} preventivoId={commessa.preventivo_id} modificabile={modificabile} attiva={commessa.attivo} />
      )}
    </div>
  );
}

function Intestazione({ numero, stato, urgente, archiviata }: { numero: string; stato: StatoCommessa; urgente: boolean; archiviata: boolean }) {
  return (
    <header className="flex flex-col gap-1">
      <Link href={indirizzo({})} className="text-sm text-blue-700 hover:underline">← Commesse</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Commessa {numero}</h1>
        <EtichettaStatoCommessa stato={stato} />
        {urgente && <EtichettaUrgente />}
        {archiviata && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archiviata</span>}
      </div>
    </header>
  );
}

function BarraStato({ id, stato, attivo, elenco }: { id: string; stato: StatoCommessa; attivo: boolean; elenco: Elenco | null }) {
  return (
    <div className={`${riquadro} flex flex-wrap items-center gap-3 px-4 py-3 text-sm`}>
      <span className="text-slate-600">
        Lo stato segue i lavori: «in lavorazione» quando entra nel programma, «controllo qualità» quando sono tutti finiti.
        {elenco && elenco.lavori > 0 && (
          <>
            {" "}Lavori finiti: <strong>{elenco.lavori_finiti} su {elenco.lavori}</strong> · {elenco.avanzamento}%.
          </>
        )}
      </span>
      {attivo && (
        <form action={cambiaStatoCommessa} className="ml-auto">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="stato" value={stato === "completata" ? "in_lavorazione" : "completata"} />
          <button className={pulsanteSecondario}>{stato === "completata" ? "Riapri" : "Segna completata"}</button>
        </form>
      )}
      <form action={archiviaCommessa} className={attivo ? "" : "ml-auto"}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="attivo" value={attivo ? "false" : "true"} />
        <button className="min-h-9 text-sm text-slate-600 hover:text-slate-900 hover:underline">
          {attivo ? "Archivia" : "Ripristina"}
        </button>
      </form>
    </div>
  );
}

function Dato({ nome, valore }: { nome: string; valore: string | null | undefined }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500">{nome}</div>
      <div className="whitespace-pre-line">{valore || "—"}</div>
    </div>
  );
}

type LavoroVisto = LavoroLetto & { stato: StatoLavoro; ore_programmate: number; primo_giorno: string | null; ultimo_giorno: string | null };

/** Lavori in sola lettura (per contabilità e operai). */
function ElencoLavori({ lavori, macchine, avanzamento }: { lavori: LavoroVisto[]; macchine: MacchinaScelta[]; avanzamento: number }) {
  return (
    <section className={riquadro}>
      <div className="flex items-center gap-3 border-b border-slate-200 p-4">
        <h2 className="font-semibold">Lavori</h2>
        <span className="text-sm text-slate-500">avanzamento {avanzamento}%</span>
      </div>
      {lavori.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Nessun lavoro.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {lavori.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <strong className="min-w-40 flex-1">{l.titolo}</strong>
              <span>{macchine.find((m) => m.id === l.macchina_id)?.nome ?? "—"}</span>
              <span className="text-slate-600">{l.ore_previste ? oreTesto(l.ore_previste) : ""}</span>
              <span className="text-slate-600">{programmato(l)}</span>
              <EtichettaStatoLavoro stato={l.stato} />
              {l.descrizione && <p className="basis-full text-slate-600">{l.descrizione}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
