"use client";
// Modulo della commessa (titolare e ufficio): dati della commessa e lavori.
// Si salva tutto insieme con salva_commessa (se una parte non va, non si salva niente).
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { useConferma } from "../preventivi/Conferma";
import { salvaCommessa, type CommessaModulo, type EsitoCommessa, type LavoroModulo } from "./azioni";
import { EtichettaStatoLavoro, oreTesto, programmato, type StatoLavoro } from "./comuni";

export type CommessaLetta = {
  id: string;
  preventivo_id: string | null;
  soggetto_id: string;
  sede_id: string | null;
  descrizione: string;
  data: string;
  data_consegna: string | null;
  urgente: boolean;
  note: string | null;
};

export type LavoroLetto = {
  id: string;
  fase_id: string | null;
  titolo: string;
  descrizione: string | null;
  macchina_id: string | null;
  ore_previste: number | null;
};

export type MacchinaScelta = { id: string; nome: string; tipo: "macchina" | "postazione"; tariffa_id: string | null; attivo: boolean };

type LavoroVisto = LavoroLetto & { stato: StatoLavoro; ore_programmate: number; primo_giorno: string | null; ultimo_giorno: string | null };
type Cliente = { id: string; denominazione: string; comune: string | null; attivo: boolean };
type Sede = { id: string; soggetto_id: string; nome: string | null; indirizzo: string | null; civico: string | null; comune: string | null };

type Props = {
  commessa: CommessaLetta | null;
  preventivo: { id: string; numero: string; oggetto: string; soggetto_id: string } | null;
  lavoriProposti: LavoroModulo[];
  lavori: LavoroVisto[];
  clienti: Cliente[];
  sedi: Sede[];
  macchine: MacchinaScelta[];
  oggi: string;
  /** il titolare vede «Pianifica →» sui lavori ancora da mettere nel programma */
  pianifica?: boolean;
};

/** Riga del modulo: chiave per React e, per i lavori già salvati, stato e programma. */
type Riga = LavoroModulo & { chiave: string; info?: LavoroVisto };

const numeroCampo = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(Math.round(Number(n) * 100) / 100).replace(".", ",");
let contatore = 0;
const nuovaChiave = () => `nuovo-${++contatore}`;

const etichettaCliente = (c: Cliente) => [c.denominazione, c.comune].filter(Boolean).join(" · ") + (c.attivo ? "" : " (archiviato)");
const etichettaSede = (s: Sede) =>
  [s.nome, [s.indirizzo, s.civico].filter(Boolean).join(" "), s.comune].filter(Boolean).join(" · ");

export default function ModuloCommessa(props: Props) {
  const { commessa, preventivo, clienti, sedi, macchine } = props;
  const [esito, azione, inCorso] = useActionState<EsitoCommessa, FormData>(salvaCommessa, {});
  const { chiedi, finestra } = useConferma();

  const iniziale = useMemo(() => {
    const testata = {
      soggetto_id: commessa?.soggetto_id ?? preventivo?.soggetto_id ?? "",
      sede_id: commessa?.sede_id ?? "",
      descrizione: commessa?.descrizione ?? preventivo?.oggetto ?? "",
      data: commessa?.data ?? props.oggi,
      data_consegna: commessa?.data_consegna ?? "",
      urgente: commessa?.urgente ?? false,
      note: commessa?.note ?? "",
    };
    const righe: Riga[] = commessa
      ? props.lavori.map((l) => ({
          chiave: l.id,
          id: l.id,
          fase_id: l.fase_id ?? "",
          titolo: l.titolo,
          descrizione: l.descrizione ?? "",
          macchina_id: l.macchina_id ?? "",
          ore_previste: numeroCampo(l.ore_previste),
          info: l,
        }))
      : props.lavoriProposti.map((l) => ({ ...l, chiave: nuovaChiave() }));
    return { testata, righe };
  }, [commessa, preventivo, props.lavori, props.lavoriProposti, props.oggi]);

  const [testata, setTestata] = useState(iniziale.testata);
  const [righe, setRighe] = useState<Riga[]>(iniziale.righe);
  const cambia = (x: Partial<typeof testata>) => setTestata((t) => ({ ...t, ...x }));
  const cambiaRiga = (chiave: string, x: Partial<LavoroModulo>) =>
    setRighe((r) => r.map((l) => (l.chiave === chiave ? { ...l, ...x } : l)));

  // --- cliente: si scrive e si sceglie tra i suggerimenti ---
  const etichette = useMemo(() => {
    const m = new Map<string, Cliente>();
    for (const c of clienti) {
      let e = etichettaCliente(c);
      while (m.has(e)) e += " ";
      m.set(e, c);
    }
    return m;
  }, [clienti]);
  const [testoCliente, setTestoCliente] = useState(
    () => [...etichette].find(([, c]) => c.id === iniziale.testata.soggetto_id)?.[0] ?? ""
  );
  const sediCliente = sedi.filter((s) => s.soggetto_id === testata.soggetto_id);
  const clienteFisso = Boolean(preventivo || commessa?.preventivo_id);

  // --- modifiche non salvate: avviso se si chiude la pagina ---
  const modificato =
    JSON.stringify({ testata, righe: righe.map(({ info: _i, chiave: _c, ...l }) => l) }) !==
    JSON.stringify({ testata: iniziale.testata, righe: iniziale.righe.map(({ info: _i, chiave: _c, ...l }) => l) });
  const salvando = useRef(false);
  useEffect(() => {
    if (!modificato) return;
    const avvisa = (e: BeforeUnloadEvent) => {
      if (!salvando.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", avvisa);
    return () => window.removeEventListener("beforeunload", avvisa);
  }, [modificato]);
  useEffect(() => {
    if (!inCorso) salvando.current = false;
  }, [inCorso]);

  const dati: CommessaModulo = {
    id: commessa?.id ?? "",
    preventivo_id: preventivo?.id ?? "",
    ...testata,
    lavori: righe.map(({ info: _i, chiave: _c, ...l }) => l),
  };

  function sposta(i: number, verso: -1 | 1) {
    setRighe((r) => {
      const j = i + verso;
      if (j < 0 || j >= r.length) return r;
      const x = [...r];
      [x[i], x[j]] = [x[j], x[i]];
      return x;
    });
  }

  async function togli(r: Riga) {
    if (r.info && r.info.stato !== "da_fare") {
      const ok = await chiedi(
        `Il lavoro «${r.titolo}» è ${r.info.stato === "finito" ? "già finito" : "in corso"}. Toglierlo lo stesso dalla commessa?`,
        "Togli il lavoro"
      );
      if (!ok) return;
    }
    setRighe((x) => x.filter((l) => l.chiave !== r.chiave));
  }

  const oreTotali = righe.reduce((s, r) => s + (Number(r.ore_previste.replace(",", ".")) || 0), 0);
  const attive = macchine.filter((m) => m.attivo);
  const opzioniMacchina = (attuale: string) => {
    const archiviata = macchine.find((m) => m.id === attuale && !m.attivo);
    return (
      <>
        <option value="">— da decidere —</option>
        <optgroup label="Macchine">
          {attive.filter((m) => m.tipo === "macchina").map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </optgroup>
        <optgroup label="Postazioni">
          {attive.filter((m) => m.tipo === "postazione").map((m) => (
            <option key={m.id} value={m.id}>{m.nome}</option>
          ))}
        </optgroup>
        {archiviata && <option value={archiviata.id}>{archiviata.nome} (tolta)</option>}
      </>
    );
  };

  return (
    <>
    {finestra}
    <form
      action={azione}
      onSubmit={() => {
        salvando.current = true;
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="dati" value={JSON.stringify(dati)} />

      {/* ---------------- Dati della commessa ---------------- */}
      <section className={`${riquadro} grid gap-4 p-4 md:grid-cols-2`}>
        <label className={etichetta}>
          Cliente
          {clienteFisso ? (
            <input value={testoCliente} disabled className={campo} />
          ) : (
            <>
              <input
                list="clienti-commessa"
                value={testoCliente}
                onChange={(e) => {
                  setTestoCliente(e.target.value);
                  const c = etichette.get(e.target.value);
                  cambia({ soggetto_id: c?.id ?? "", sede_id: "" });
                }}
                placeholder="Scrivi per cercare…"
                className={campo}
              />
              <datalist id="clienti-commessa">
                {[...etichette.keys()].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </>
          )}
          {clienteFisso && <span className="font-normal">Dal preventivo: non si cambia.</span>}
          {!clienteFisso && testoCliente && !testata.soggetto_id && (
            <span className="font-normal text-amber-800">Scegli il cliente tra i suggerimenti.</span>
          )}
        </label>
        <label className={etichetta}>
          Dove si fa la posa o la consegna
          <select value={testata.sede_id} onChange={(e) => cambia({ sede_id: e.target.value })} className={campo}>
            <option value="">Sede legale del cliente</option>
            {sediCliente.map((s) => (
              <option key={s.id} value={s.id}>{etichettaSede(s)}</option>
            ))}
          </select>
          <span className="font-normal">Le altre sedi si aggiungono nella scheda del cliente (Anagrafiche).</span>
        </label>
        <label className={`${etichetta} md:col-span-2`}>
          Descrizione
          <input
            value={testata.descrizione}
            onChange={(e) => cambia({ descrizione: e.target.value })}
            required={!preventivo}
            placeholder="es. Insegna luminosa negozio"
            className={campo}
          />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className={etichetta}>
            Data
            <input type="date" value={testata.data} onChange={(e) => cambia({ data: e.target.value })} className={campo} />
          </label>
          <label className={etichetta}>
            Consegna
            <input
              type="date"
              value={testata.data_consegna}
              onChange={(e) => cambia({ data_consegna: e.target.value })}
              className={campo}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input
            type="checkbox"
            checked={testata.urgente}
            onChange={(e) => cambia({ urgente: e.target.checked })}
            className="h-4 w-4"
          />
          Urgente
        </label>
        <label className={`${etichetta} md:col-span-2`}>
          Note interne
          <textarea
            value={testata.note}
            onChange={(e) => cambia({ note: e.target.value })}
            rows={2}
            className={campo}
          />
        </label>
      </section>

      {/* ---------------- Lavori ---------------- */}
      <section className={riquadro}>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <div className="min-w-60 flex-1">
            <h2 className="font-semibold">Lavori · {righe.length} · {oreTesto(oreTotali)}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {preventivo
                ? "Uno per ogni fase del preventivo, con le ore della fase e la macchina che ha la stessa tariffa oraria. Controllali: puoi cambiarli, dividerli, toglierli o aggiungerne."
                : "Cosa c'è da fare, su quale macchina o postazione e quante ore servono. Poi si mettono nel programma del giorno."}
            </p>
          </div>
        </div>
        {righe.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">Nessun lavoro: aggiungine uno.</p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {righe.map((r, i) => (
              <li key={r.chiave} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-end gap-3">
                  <span className="pb-2 text-sm font-semibold text-slate-500">{i + 1}.</span>
                  <label className={`${etichetta} flex-[2_1_12rem]`}>
                    Cosa c&apos;è da fare
                    <input
                      value={r.titolo}
                      onChange={(e) => cambiaRiga(r.chiave, { titolo: e.target.value })}
                      placeholder="es. Stampa"
                      className={campo}
                    />
                  </label>
                  <label className={`${etichetta} flex-[1.5_1_11rem]`}>
                    Macchina o postazione
                    <select
                      value={r.macchina_id}
                      onChange={(e) => cambiaRiga(r.chiave, { macchina_id: e.target.value })}
                      className={campo}
                    >
                      {opzioniMacchina(r.macchina_id)}
                    </select>
                  </label>
                  <label className={`${etichetta} w-24`}>
                    Ore previste
                    <input
                      value={r.ore_previste}
                      onChange={(e) => cambiaRiga(r.chiave, { ore_previste: e.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                      className={`${campo} text-right`}
                    />
                  </label>
                  <div className="flex gap-1 pb-0.5">
                    <button type="button" onClick={() => sposta(i, -1)} disabled={i === 0} aria-label={`Sposta su il lavoro ${i + 1}`} className={`${pulsanteSecondario} px-3 disabled:opacity-40`}>↑</button>
                    <button type="button" onClick={() => sposta(i, 1)} disabled={i === righe.length - 1} aria-label={`Sposta giù il lavoro ${i + 1}`} className={`${pulsanteSecondario} px-3 disabled:opacity-40`}>↓</button>
                    <button type="button" onClick={() => togli(r)} aria-label={`Togli il lavoro ${i + 1}`} className={`${pulsanteSecondario} px-3 text-red-700`}>✕</button>
                  </div>
                </div>
                <label className={etichetta}>
                  Indicazioni per chi lo fa
                  <input
                    value={r.descrizione}
                    onChange={(e) => cambiaRiga(r.chiave, { descrizione: e.target.value })}
                    placeholder="facoltative, es. file nella cartella del cliente"
                    className={campo}
                  />
                </label>
                {r.info ? (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <EtichettaStatoLavoro stato={r.info.stato} />
                    {programmato(r.info)}
                    {props.pianifica && daProgrammare(r.info) && (
                      <Link
                        href={`/produzione?scheda=programma&lavoro=${r.info.id}`}
                        className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                      >
                        Pianifica →
                      </Link>
                    )}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    {r.fase_id ? "Dalla fase del preventivo" : "Nuovo lavoro"}
                    {r.fase_id && !r.macchina_id && " · nessuna macchina ha la tariffa di questa fase: sceglila tu"}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            onClick={() =>
              setRighe((x) => [
                ...x,
                { chiave: nuovaChiave(), id: "", fase_id: "", titolo: "", descrizione: "", macchina_id: "", ore_previste: "" },
              ])
            }
            className={pulsanteSecondario}
          >
            + Aggiungi lavoro
          </button>
        </div>
      </section>

      {esito.errore && <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{esito.errore}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50/95 py-3">
        <button disabled={inCorso || (!modificato && Boolean(commessa))} className={`${pulsante} disabled:opacity-50`}>
          {inCorso ? "Salvo…" : commessa ? "Salva la commessa" : preventivo ? `Crea la commessa ${preventivo.numero}` : "Crea la commessa"}
        </button>
        {modificato && commessa && <span className="text-sm text-amber-800">Modifiche non salvate</span>}
      </div>
    </form>
    </>
  );
}

/** Un lavoro non finito con ore ancora da mettere nel programma (o senza ore e mai programmato). */
function daProgrammare(l: LavoroVisto): boolean {
  if (l.stato === "finito") return false;
  if (l.ore_previste === null) return l.ore_programmate === 0;
  return l.ore_programmate < Number(l.ore_previste);
}
