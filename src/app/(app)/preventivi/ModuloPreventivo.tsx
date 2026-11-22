"use client";
// Pagina del preventivo: dati generali, fasi (ore e materiali) e riepilogo che si aggiorna mentre si scrive.
// Il salvataggio manda tutto insieme a salva_preventivo (tutto o niente). Se non va, la bozza resta qui.
// Sola lettura per la contabilità e per i preventivi accettati, rifiutati o archiviati.
import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { euro } from "@/lib/validazioni";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { archiviaPreventivo, cambiaStato, salvaPreventivo } from "./azioni";
import {
  centesimiMateriale,
  centesimiOre,
  inEuro,
  intero,
  perCampo,
  quantitaBobina,
  totali as calcolaTotali,
} from "./calcoli";
import { EtichettaStato, STATI, indirizzo, ore as scriviOre, percento, type Stato } from "./comuni";
import type {
  ArticoloScelto,
  BozzaFase,
  BozzaMateriale,
  BozzaOre,
  BozzaTestata,
  Cliente,
  CodiceIvaScelto,
  EsitoSalvataggio,
  FaseSalvata,
  PreventivoSalvato,
  TariffaScelta,
} from "./tipi";

type Props = {
  preventivo: PreventivoSalvato | null;
  fasi: FaseSalvata[];
  clienti: Cliente[];
  tariffe: TariffaScelta[];
  articoli: ArticoloScelto[];
  codiciIva: CodiceIvaScelto[];
  oggi: string;
  modificabile: boolean;
  ok?: string;
  errore?: string;
};

// ---------------------------------------------------------------------
// Bozze: dal database al modulo
// ---------------------------------------------------------------------
let contatore = 0;
const nuovaChiave = () => `n${++contatore}`;
const s = (v: string | null | undefined) => v ?? "";

function bozzaTestata(p: PreventivoSalvato | null, oggi: string): BozzaTestata {
  return {
    soggetto_id: s(p?.soggetto_id),
    oggetto: s(p?.oggetto),
    modello_id: p?.modello_id ?? null,
    data: p?.data ?? oggi,
    valido_fino: s(p?.valido_fino),
    ricarico_percentuale: perCampo(p?.ricarico_percentuale ?? 35, 0, 2),
    prezzo_cliente: p?.prezzo_cliente === null || p?.prezzo_cliente === undefined ? "" : perCampo(p.prezzo_cliente, 2, 2),
    codice_iva_id: s(p?.codice_iva_id),
    cig: s(p?.cig),
    cup: s(p?.cup),
    note: s(p?.note),
  };
}

function bozzaFasi(fasi: FaseSalvata[]): BozzaFase[] {
  return fasi.map((f) => ({
    chiave: f.id,
    id: f.id,
    titolo: f.titolo,
    descrizione_cliente: s(f.descrizione_cliente),
    ore: f.ore_fase.map((r) => ({
      chiave: r.id,
      id: r.id,
      tariffa_id: r.tariffa_id,
      ore: perCampo(r.ore, 0, 2),
      persone: r.persone ? String(r.persone) : "",
      costo_orario: perCampo(r.costo_orario, 2, 2),
    })),
    materiali: f.materiali_fase.map((r) => ({
      chiave: r.id,
      id: r.id,
      articolo_id: r.articolo_id,
      descrizione: r.descrizione,
      unita_misura: r.unita_misura,
      bobina: r.larghezza_m !== null,
      larghezza_m: perCampo(r.larghezza_m, 0, 3),
      metri_lineari: perCampo(r.metri_lineari, 0, 3),
      quantita: perCampo(r.quantita, 0, 3),
      costo_unitario: perCampo(r.costo_unitario, 2, 4),
    })),
  }));
}

const faseVuota = (): BozzaFase => ({ chiave: nuovaChiave(), titolo: "", descrizione_cliente: "", ore: [], materiali: [] });

/** Etichette uniche per i suggerimenti (due clienti con lo stesso nome restano distinguibili). */
function etichetteUniche<T>(elenco: T[], testo: (x: T) => string): Map<string, T> {
  const mappa = new Map<string, T>();
  for (const x of elenco) {
    let e = testo(x);
    for (let n = 2; mappa.has(e); n++) e = `${testo(x)} (${n})`;
    mappa.set(e, x);
  }
  return mappa;
}

const etichettaCliente = (c: Cliente) =>
  [c.denominazione, c.nome_breve, c.comune].filter(Boolean).join(" · ") + (c.attivo ? "" : " (archiviato)");
const etichettaArticolo = (a: ArticoloScelto) => (a.codice ? `${a.codice} · ${a.descrizione}` : a.descrizione);

// ---------------------------------------------------------------------
// Il modulo
// ---------------------------------------------------------------------
export default function ModuloPreventivo(props: Props) {
  const { preventivo, clienti, tariffe, articoli, codiciIva, modificabile } = props;
  const nuovo = !preventivo;
  const stato: Stato = preventivo?.stato ?? "bozza";
  const bloccato = stato === "accettato" || stato === "rifiutato";
  const archiviato = preventivo ? !preventivo.attivo : false;
  const solaLettura = !modificabile || bloccato || archiviato;

  const [esito, azione, inCorso] = useActionState<EsitoSalvataggio, FormData>(salvaPreventivo, {});

  const iniziale = useMemo(
    () => ({ testata: bozzaTestata(preventivo, props.oggi), fasi: bozzaFasi(props.fasi) }),
    [preventivo, props.oggi, props.fasi]
  );
  const [testata, setTestata] = useState<BozzaTestata>(iniziale.testata);
  const [fasi, setFasi] = useState<BozzaFase[]>(iniziale.fasi);

  // --- suggerimenti per cliente e materiali ---
  const mappaClienti = useMemo(() => etichetteUniche(clienti, etichettaCliente), [clienti]);
  const mappaArticoli = useMemo(() => etichetteUniche(articoli, etichettaArticolo), [articoli]);
  const cliente = clienti.find((c) => c.id === testata.soggetto_id) ?? null;
  const [testoCliente, setTestoCliente] = useState(() =>
    cliente ? ([...mappaClienti].find(([, c]) => c.id === cliente.id)?.[0] ?? "") : ""
  );
  const pa = cliente?.forma === "pubblica_amministrazione";

  // --- modifiche non salvate: avviso se si chiude o si ricarica la pagina ---
  const modificato =
    JSON.stringify({ testata, fasi }) !== JSON.stringify({ testata: iniziale.testata, fasi: iniziale.fasi });
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
  const lasciaPagina = (e: MouseEvent) => {
    if (modificato && !window.confirm("Ci sono modifiche non salvate. Uscire lo stesso?")) e.preventDefault();
  };

  // --- calcoli dal vivo ---
  const aliquota = useMemo(() => {
    const scelto = codiciIva.find((c) => c.id === testata.codice_iva_id);
    const abituale = codiciIva.find((c) => c.id === cliente?.codice_iva_abituale_id);
    const ventidue = codiciIva.find((c) => c.codice === "22" && c.attivo);
    return Number((scelto ?? abituale ?? ventidue)?.aliquota ?? 22);
  }, [codiciIva, testata.codice_iva_id, cliente]);

  const calcoloFasi = fasi.map((f) => {
    const ore = f.ore.reduce((somma, r) => somma + (intero(r.ore, 2) ?? 0), 0) / 100;
    const costoOre = f.ore.reduce((somma, r) => somma + centesimiOre(r.ore, r.costo_orario), 0);
    const costoMateriali = f.materiali.reduce(
      (somma, r) =>
        somma + centesimiMateriale(r.bobina ? (quantitaBobina(r.larghezza_m, r.metri_lineari) ?? 0) : r.quantita, r.costo_unitario),
      0
    );
    return { ore, costoOre, costoMateriali };
  });
  const t = calcolaTotali(
    {
      ore: Math.round(calcoloFasi.reduce((x, f) => x + f.ore, 0) * 100) / 100,
      costoOre: calcoloFasi.reduce((x, f) => x + f.costoOre, 0),
      costoMateriali: calcoloFasi.reduce((x, f) => x + f.costoMateriali, 0),
    },
    testata.ricarico_percentuale,
    testata.prezzo_cliente,
    aliquota
  );

  // --- modifiche alla bozza ---
  const cambiaTestata = (campi: Partial<BozzaTestata>) => setTestata((x) => ({ ...x, ...campi }));
  const cambiaFase = (chiave: string, cambia: (f: BozzaFase) => BozzaFase) =>
    setFasi((elenco) => elenco.map((f) => (f.chiave === chiave ? cambia(f) : f)));
  const spostaFase = (indice: number, verso: -1 | 1) =>
    setFasi((elenco) => {
      const nuovo = [...elenco];
      const [fase] = nuovo.splice(indice, 1);
      nuovo.splice(indice + verso, 0, fase);
      return nuovo;
    });
  const togliFase = (f: BozzaFase, numero: number) => {
    const righe = f.ore.length + f.materiali.length;
    if (righe && !window.confirm(`Togliere la fase ${numero} «${f.titolo || "senza titolo"}» con le sue ${righe} righe?`)) return;
    setFasi((elenco) => elenco.filter((x) => x.chiave !== f.chiave));
  };

  function scegliCliente(testo: string) {
    setTestoCliente(testo);
    cambiaTestata({ soggetto_id: mappaClienti.get(testo)?.id ?? "" });
  }

  const titolo = preventivo ? `${preventivo.numero} · ${preventivo.oggetto}` : "Nuovo preventivo";
  const messaggioErrore = esito.errore ?? props.errore;

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------- Intestazione ---------------- */}
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-[1_1_320px]">
          <nav aria-label="Percorso" className="text-sm">
            <Link href={indirizzo(preventivo ? { sel: preventivo.id } : {})} onClick={lasciaPagina} className="text-blue-700 hover:underline">
              Preventivi
            </Link>
            <span className="text-slate-500"> › {preventivo?.numero ?? "nuovo"}</span>
          </nav>
          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{titolo}</h1>
            {preventivo && <EtichettaStato stato={stato} />}
            {archiviato && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archiviato</span>}
          </div>
        </div>
        {["Anteprima PDF cliente", "Salva come modello"].map((testo) => (
          <button key={testo} type="button" disabled title="In arrivo nei prossimi passi" className={`${pulsanteSecondario} cursor-not-allowed opacity-50`}>
            {testo}
          </button>
        ))}
        {!solaLettura && (
          <button
            type="submit"
            form="modulo-preventivo"
            disabled={inCorso}
            className={pulsante}
            onClick={() => (salvando.current = true)}
          >
            {inCorso ? "Salvataggio…" : nuovo ? "Crea preventivo" : "Salva preventivo"}
          </button>
        )}
      </header>

      {props.ok && !modificato && (
        <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{props.ok}</p>
      )}
      {messaggioErrore && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{messaggioErrore}</p>
      )}
      {preventivo && (bloccato || archiviato) && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {archiviato
            ? "Questo preventivo è archiviato: si può solo ripristinare."
            : `Questo preventivo è ${stato}: non si modifica più. Per rifarlo si duplica (in arrivo), oppure si riporta a «bozza».`}
        </p>
      )}

      {/* ---------------- Stato e archiviazione ---------------- */}
      {preventivo && modificabile && (
        <BarraStato
          id={preventivo.id}
          stato={stato}
          archiviato={archiviato}
          modificato={modificato}
        />
      )}

      <form id="modulo-preventivo" action={azione} className="flex flex-col gap-5">
        <input type="hidden" name="dati" value={JSON.stringify({ id: preventivo?.id ?? null, testata, fasi })} />
        <fieldset disabled={solaLettura} className="flex min-w-0 flex-col gap-5">
          <legend className="sr-only">Dati del preventivo</legend>

          {/* ---------------- Dati generali ---------------- */}
          <section aria-label="Dati generali" className={`${riquadro} grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 p-4`}>
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Cliente
              <input
                list="elenco-clienti"
                value={testoCliente}
                onChange={(e) => scegliCliente(e.target.value)}
                placeholder="Scrivi per cercare…"
                required
                aria-invalid={testoCliente !== "" && !cliente}
                className={campo}
              />
              {testoCliente !== "" && !cliente && (
                <span className="font-normal text-amber-700">Scegli un cliente dai suggerimenti.</span>
              )}
              <datalist id="elenco-clienti">
                {[...mappaClienti.keys()].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </label>
            <label className={`${etichetta} col-span-full sm:col-span-2`}>
              Oggetto del lavoro
              <input value={testata.oggetto} onChange={(e) => cambiaTestata({ oggetto: e.target.value })} required className={campo} />
            </label>
            <label className={etichetta}>
              Data
              <input type="date" value={testata.data} onChange={(e) => cambiaTestata({ data: e.target.value })} required className={campo} />
            </label>
            <label className={etichetta}>
              Valido fino al
              <input
                type="date"
                value={testata.valido_fino}
                min={testata.data}
                onChange={(e) => cambiaTestata({ valido_fino: e.target.value })}
                className={campo}
              />
              {!testata.valido_fino && <span className="font-normal">Vuoto: un mese dalla data</span>}
            </label>
            <label className={etichetta}>
              Codice IVA
              <select value={testata.codice_iva_id} onChange={(e) => cambiaTestata({ codice_iva_id: e.target.value })} className={campo}>
                <option value="">Automatico ({aliquota}%: quello del cliente o 22)</option>
                {codiciIva
                  .filter((c) => c.attivo || c.id === testata.codice_iva_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codice} · {c.descrizione}
                    </option>
                  ))}
              </select>
            </label>
            {pa && (
              <>
                <label className={etichetta}>
                  CIG
                  <input value={testata.cig} onChange={(e) => cambiaTestata({ cig: e.target.value })} className={campo} />
                </label>
                <label className={etichetta}>
                  CUP
                  <input value={testata.cup} onChange={(e) => cambiaTestata({ cup: e.target.value })} className={campo} />
                </label>
              </>
            )}
            <label className={`${etichetta} col-span-full`}>
              Note interne (non vanno al cliente)
              <textarea rows={2} value={testata.note} onChange={(e) => cambiaTestata({ note: e.target.value })} className={campo} />
            </label>
          </section>

          <div className="flex flex-wrap items-start gap-5">
            {/* ---------------- Fasi ---------------- */}
            <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
              {fasi.length === 0 && (
                <p className={`${riquadro} p-4 text-sm text-slate-500`}>
                  Nessuna fase. Un preventivo è fatto di fasi (es. Grafica, Stampa, Posa), ognuna con ore di lavoro e materiali.
                </p>
              )}
              {fasi.map((f, i) => (
                <Fase
                  key={f.chiave}
                  fase={f}
                  numero={i + 1}
                  totale={fasi.length}
                  costo={calcoloFasi[i].costoOre + calcoloFasi[i].costoMateriali}
                  tariffe={tariffe}
                  mappaArticoli={mappaArticoli}
                  cambia={(cambia) => cambiaFase(f.chiave, cambia)}
                  sposta={(verso) => spostaFase(i, verso)}
                  togli={() => togliFase(f, i + 1)}
                  solaLettura={solaLettura}
                />
              ))}
              {!solaLettura && (
                <button type="button" onClick={() => setFasi((x) => [...x, faseVuota()])} className={`${aggiungi} min-h-13 text-sm`}>
                  + Aggiungi fase
                </button>
              )}
              <datalist id="elenco-articoli">
                {[...mappaArticoli.keys()].map((e) => (
                  <option key={e} value={e} />
                ))}
              </datalist>
            </div>

            {/* ---------------- Riepilogo ---------------- */}
            <aside aria-label="Riepilogo" className={`${riquadro} flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 p-5 text-sm lg:sticky lg:top-4`}>
              <h2 className="mb-1 text-base font-semibold">Riepilogo</h2>
              <Voce testo={`Ore di lavoro (${scriviOre(t.ore)} h)`} valore={euro(inEuro(t.costoOre))} />
              <Voce testo="Materiali" valore={euro(inEuro(t.costoMateriali))} />
              <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-semibold">
                <span>Costo totale</span>
                <span className="tabular-nums">{euro(inEuro(t.costo))}</span>
              </div>
              <label className="flex items-center justify-between gap-3 whitespace-nowrap text-slate-500">
                Ricarico %
                <input
                  inputMode="decimal"
                  value={testata.ricarico_percentuale}
                  onChange={(e) => cambiaTestata({ ricarico_percentuale: e.target.value })}
                  className={`${campo} w-24 text-right`}
                />
              </label>
              <Voce testo="Prezzo calcolato" valore={euro(inEuro(t.prezzoCalcolato))} />
              <label className={etichetta}>
                Prezzo al cliente (vuoto = calcolato)
                <input
                  inputMode="decimal"
                  value={testata.prezzo_cliente}
                  placeholder={perCampo(inEuro(t.prezzoCalcolato), 2, 2)}
                  onChange={(e) => cambiaTestata({ prezzo_cliente: e.target.value })}
                  className={`${campo} text-right text-lg font-bold`}
                />
              </label>
              {testata.prezzo_cliente && !solaLettura && (
                <button type="button" onClick={() => cambiaTestata({ prezzo_cliente: "" })} className="self-end text-xs text-blue-700 hover:underline">
                  Usa il prezzo calcolato
                </button>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Margine</span>
                <span className={`font-semibold tabular-nums ${t.margine < 0 ? "text-red-700" : "text-green-800"}`}>
                  {euro(inEuro(t.margine))} · {percento(t.marginePercentuale)}
                </span>
              </div>
              <div className="border-t border-slate-200 pt-2">
                <Voce testo={`IVA ${perCampo(aliquota, 0, 2)}%`} valore={euro(inEuro(t.iva))} />
              </div>
              <div className="flex justify-between gap-3 text-lg font-bold">
                <span>Totale</span>
                <span className="tabular-nums">{euro(inEuro(t.totale))}</span>
              </div>
              <p className="mt-1.5 rounded-lg bg-blue-50 p-3 text-[13px] leading-snug text-blue-950">
                Il cliente vede solo le <strong>descrizioni delle fasi</strong> e il prezzo. Ore, costi e ricarico restano interni.
              </p>
              {modificato && !solaLettura && (
                <p className="rounded-lg bg-amber-50 p-3 text-[13px] text-amber-900">Ci sono modifiche non salvate.</p>
              )}
            </aside>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

const aggiungi =
  "min-h-11 rounded-lg border border-dashed border-slate-400 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50";
const cella = "px-2 py-1.5 align-middle";
const intestazione = "px-2 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase";
const iconaTogli = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700";

function Voce({ testo, valore }: { testo: string; valore: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500">{testo}</span>
      <span className="tabular-nums">{valore}</span>
    </div>
  );
}

// ---------------------------------------------------------------------
// Una fase
// ---------------------------------------------------------------------
type PropsFase = {
  fase: BozzaFase;
  numero: number;
  totale: number;
  costo: number;
  tariffe: TariffaScelta[];
  mappaArticoli: Map<string, ArticoloScelto>;
  cambia: (cambia: (f: BozzaFase) => BozzaFase) => void;
  sposta: (verso: -1 | 1) => void;
  togli: () => void;
  solaLettura: boolean;
};

function Fase({ fase, numero, totale, costo, tariffe, mappaArticoli, cambia, sposta, togli, solaLettura }: PropsFase) {
  const nomeFase = fase.titolo || `fase ${numero}`;

  const cambiaOre = (chiave: string, campi: Partial<BozzaOre>) =>
    cambia((f) => ({ ...f, ore: f.ore.map((r) => (r.chiave === chiave ? { ...r, ...campi } : r)) }));
  const cambiaMateriale = (chiave: string, campi: Partial<BozzaMateriale>) =>
    cambia((f) => ({ ...f, materiali: f.materiali.map((r) => (r.chiave === chiave ? { ...r, ...campi } : r)) }));

  function aggiungiOre() {
    const prima = tariffe.find((x) => x.attivo);
    cambia((f) => ({
      ...f,
      ore: [
        ...f.ore,
        {
          chiave: nuovaChiave(),
          tariffa_id: prima?.id ?? "",
          ore: "",
          persone: "",
          costo_orario: prima ? perCampo(prima.costo_orario, 2, 2) : "",
        },
      ],
    }));
  }

  function aggiungiMateriale() {
    cambia((f) => ({
      ...f,
      materiali: [
        ...f.materiali,
        {
          chiave: nuovaChiave(),
          articolo_id: null,
          descrizione: "",
          unita_misura: "pz",
          bobina: false,
          larghezza_m: "",
          metri_lineari: "",
          quantita: "",
          costo_unitario: "",
        },
      ],
    }));
  }

  /** Materiale scritto o scelto dai suggerimenti: se è del catalogo, riempie unità, costo e bobina. */
  function scegliMateriale(r: BozzaMateriale, testo: string) {
    const a = mappaArticoli.get(testo);
    if (!a) {
      cambiaMateriale(r.chiave, { descrizione: testo, articolo_id: null });
      return;
    }
    const bobina = a.larghezza_bobina_m !== null;
    cambiaMateriale(r.chiave, {
      articolo_id: a.id,
      descrizione: a.descrizione,
      unita_misura: bobina ? "m2" : a.unita_misura,
      costo_unitario: perCampo(a.costo_unitario, 2, 4),
      bobina,
      larghezza_m: bobina ? perCampo(a.larghezza_bobina_m, 0, 3) : r.larghezza_m,
    });
  }

  return (
    <section aria-label={`Fase ${numero}`} className={`${riquadro} flex flex-col gap-3 p-4`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[13px] font-bold text-blue-800">
          {numero}
        </span>
        <input
          aria-label={`Titolo della fase ${numero}`}
          value={fase.titolo}
          onChange={(e) => cambia((f) => ({ ...f, titolo: e.target.value }))}
          placeholder="Titolo della fase (es. Stampa)"
          required
          className={`${campo} min-w-0 flex-[1_1_200px] font-semibold`}
        />
        <span className="text-xs text-slate-500">Costo fase</span>
        <strong className="tabular-nums">{euro(inEuro(costo))}</strong>
        {!solaLettura && (
          <span className="flex gap-1">
            <button type="button" onClick={() => sposta(-1)} disabled={numero === 1} aria-label={`Sposta su ${nomeFase}`} className={`${iconaTogli} disabled:opacity-30`}>
              ↑
            </button>
            <button type="button" onClick={() => sposta(1)} disabled={numero === totale} aria-label={`Sposta giù ${nomeFase}`} className={`${iconaTogli} disabled:opacity-30`}>
              ↓
            </button>
            <button type="button" onClick={togli} aria-label={`Togli ${nomeFase}`} className={iconaTogli}>
              ✕
            </button>
          </span>
        )}
      </div>
      <label className={etichetta}>
        Descrizione per il cliente (va nel PDF)
        <textarea
          rows={2}
          value={fase.descrizione_cliente}
          onChange={(e) => cambia((f) => ({ ...f, descrizione_cliente: e.target.value }))}
          className={campo}
        />
      </label>

      {/* ----- ore ----- */}
      {fase.ore.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={intestazione}>Lavoro</th>
                <th className={`${intestazione} w-24`}>Persone</th>
                <th className={`${intestazione} w-28 text-right`}>Ore totali</th>
                <th className={`${intestazione} w-28 text-right`}>€ / ora</th>
                <th className={`${intestazione} w-28 text-right`}>Costo</th>
                <th className="w-10"><span className="sr-only">Togli</span></th>
              </tr>
            </thead>
            <tbody>
              {fase.ore.map((r, j) => {
                const persone = intero(r.persone, 0);
                const oreTot = intero(r.ore, 2);
                return (
                  <tr key={r.chiave} className="border-b border-slate-100">
                    <td className={cella}>
                      <select
                        aria-label={`Tariffa, riga ${j + 1}`}
                        value={r.tariffa_id}
                        onChange={(e) => {
                          const tariffa = tariffe.find((x) => x.id === e.target.value);
                          cambiaOre(r.chiave, {
                            tariffa_id: e.target.value,
                            costo_orario: tariffa ? perCampo(tariffa.costo_orario, 2, 2) : r.costo_orario,
                          });
                        }}
                        required
                        className={campo}
                      >
                        <option value="">Scegli…</option>
                        {tariffe
                          .filter((x) => x.attivo || x.id === r.tariffa_id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>{x.nome}</option>
                          ))}
                      </select>
                    </td>
                    <td className={cella}>
                      <input
                        aria-label={`Persone, riga ${j + 1}`}
                        inputMode="numeric"
                        value={r.persone}
                        onChange={(e) => cambiaOre(r.chiave, { persone: e.target.value })}
                        className={`${campo} text-right`}
                      />
                    </td>
                    <td className={cella}>
                      <input
                        aria-label={`Ore totali, riga ${j + 1}`}
                        inputMode="decimal"
                        value={r.ore}
                        onChange={(e) => cambiaOre(r.chiave, { ore: e.target.value })}
                        className={`${campo} text-right`}
                      />
                      {persone && persone > 1 && oreTot ? (
                        <span className="mt-0.5 block text-right text-xs text-slate-500">
                          {scriviOre(oreTot / 100 / persone)} h a testa
                        </span>
                      ) : null}
                    </td>
                    <td className={cella}>
                      <input
                        aria-label={`Euro all'ora, riga ${j + 1}`}
                        inputMode="decimal"
                        value={r.costo_orario}
                        onChange={(e) => cambiaOre(r.chiave, { costo_orario: e.target.value })}
                        className={`${campo} text-right`}
                      />
                    </td>
                    <td className={`${cella} text-right whitespace-nowrap tabular-nums`}>
                      {euro(inEuro(centesimiOre(r.ore, r.costo_orario)))}
                    </td>
                    <td className={cella}>
                      {!solaLettura && (
                        <button
                          type="button"
                          aria-label={`Togli la riga di ore ${j + 1}`}
                          onClick={() => cambia((f) => ({ ...f, ore: f.ore.filter((x) => x.chiave !== r.chiave) }))}
                          className={iconaTogli}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ----- materiali ----- */}
      {fase.materiali.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={intestazione}>Materiale</th>
                <th className={`${intestazione} w-52`}>Quantità</th>
                <th className={`${intestazione} w-20`}>Unità</th>
                <th className={`${intestazione} w-28 text-right`}>€ / unità</th>
                <th className={`${intestazione} w-28 text-right`}>Costo</th>
                <th className="w-10"><span className="sr-only">Togli</span></th>
              </tr>
            </thead>
            <tbody>
              {fase.materiali.map((r, j) => {
                const m2 = r.bobina ? quantitaBobina(r.larghezza_m, r.metri_lineari) : null;
                return (
                  <tr key={r.chiave} className="border-b border-slate-100 align-top">
                    <td className={cella}>
                      <input
                        aria-label={`Materiale, riga ${j + 1}`}
                        list="elenco-articoli"
                        value={r.descrizione}
                        onChange={(e) => scegliMateriale(r, e.target.value)}
                        placeholder="Dal catalogo o scritto a mano"
                        required
                        className={campo}
                      />
                      <span className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        {r.articolo_id ? "Dal catalogo" : "Non a catalogo"}
                        <label className="inline-flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={r.bobina}
                            onChange={(e) =>
                              cambiaMateriale(r.chiave, {
                                bobina: e.target.checked,
                                unita_misura: e.target.checked ? "m2" : r.unita_misura,
                              })
                            }
                            className="h-4 w-4"
                          />
                          In bobina (m² = larghezza × metri)
                        </label>
                      </span>
                    </td>
                    <td className={cella}>
                      {r.bobina ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1">
                            <input
                              aria-label={`Larghezza bobina in metri, riga ${j + 1}`}
                              inputMode="decimal"
                              value={r.larghezza_m}
                              onChange={(e) => cambiaMateriale(r.chiave, { larghezza_m: e.target.value })}
                              placeholder="larg."
                              className={`${campo} text-right`}
                            />
                            <span className="text-slate-500">×</span>
                            <input
                              aria-label={`Metri lineari, riga ${j + 1}`}
                              inputMode="decimal"
                              value={r.metri_lineari}
                              onChange={(e) => cambiaMateriale(r.chiave, { metri_lineari: e.target.value })}
                              placeholder="ml"
                              className={`${campo} text-right`}
                            />
                          </div>
                          <span className="text-right text-xs text-slate-500">
                            = {m2 === null ? "—" : perCampo(m2, 2, 3)} m²
                          </span>
                        </div>
                      ) : (
                        <input
                          aria-label={`Quantità, riga ${j + 1}`}
                          inputMode="decimal"
                          value={r.quantita}
                          onChange={(e) => cambiaMateriale(r.chiave, { quantita: e.target.value })}
                          className={`${campo} text-right`}
                        />
                      )}
                    </td>
                    <td className={cella}>
                      <input
                        aria-label={`Unità di misura, riga ${j + 1}`}
                        value={r.bobina ? "m2" : r.unita_misura}
                        readOnly={r.bobina}
                        onChange={(e) => cambiaMateriale(r.chiave, { unita_misura: e.target.value })}
                        className={campo}
                      />
                    </td>
                    <td className={cella}>
                      <input
                        aria-label={`Euro per unità, riga ${j + 1}`}
                        inputMode="decimal"
                        value={r.costo_unitario}
                        onChange={(e) => cambiaMateriale(r.chiave, { costo_unitario: e.target.value })}
                        placeholder={r.articolo_id ? "dal catalogo" : ""}
                        className={`${campo} text-right`}
                      />
                    </td>
                    <td className={`${cella} pt-3.5 text-right whitespace-nowrap tabular-nums`}>
                      {euro(inEuro(centesimiMateriale(r.bobina ? (m2 ?? 0) : r.quantita, r.costo_unitario)))}
                    </td>
                    <td className={cella}>
                      {!solaLettura && (
                        <button
                          type="button"
                          aria-label={`Togli il materiale ${j + 1}`}
                          onClick={() => cambia((f) => ({ ...f, materiali: f.materiali.filter((x) => x.chiave !== r.chiave) }))}
                          className={iconaTogli}
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!solaLettura && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={aggiungiOre} className={aggiungi}>+ Ore di lavoro</button>
          <button type="button" onClick={aggiungiMateriale} className={aggiungi}>+ Materiale</button>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------
// Stato e archiviazione (titolare e ufficio). Moduli a parte: non toccano la bozza.
// ---------------------------------------------------------------------
function BarraStato({ id, stato, archiviato, modificato }: { id: string; stato: Stato; archiviato: boolean; modificato: boolean }) {
  const bloccato = stato === "accettato" || stato === "rifiutato";
  const fermo = modificato || archiviato;

  function conferma(e: FormEvent<HTMLFormElement>, nuovo: Stato) {
    const etichetta = STATI.find((x) => x.valore === nuovo)?.etichetta.toLowerCase();
    const testo = bloccato
      ? `Riportare il preventivo a «${etichetta}»? Tornerà modificabile.`
      : nuovo === "accettato" || nuovo === "rifiutato"
        ? `Segnare il preventivo come «${etichetta}»? Da quel momento non si potrà più modificare.`
        : null;
    if (testo && !window.confirm(testo)) e.preventDefault();
  }

  return (
    <div className={`${riquadro} flex flex-wrap items-center gap-2 px-4 py-3 text-sm`}>
      <span className="font-semibold text-slate-600">Stato:</span>
      {STATI.map((x) =>
        x.valore === stato ? (
          <span key={x.valore} aria-current="true" className="rounded-full border border-slate-900 bg-slate-900 px-3.5 py-1.5 font-semibold text-white">
            {x.etichetta}
          </span>
        ) : (
          <form key={x.valore} action={cambiaStato} onSubmit={(e) => conferma(e, x.valore)}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="stato" value={x.valore} />
            <button
              disabled={fermo}
              className="min-h-9 rounded-full border border-slate-300 bg-white px-3.5 font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {x.etichetta}
            </button>
          </form>
        )
      )}
      {modificato && <span className="text-xs text-amber-800">Salva prima le modifiche</span>}
      <form
        action={archiviaPreventivo}
        className="ml-auto"
        onSubmit={(e) => {
          if (!archiviato && !window.confirm("Archiviare il preventivo? Non comparirà più nell'elenco (si può ripristinare).")) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="attivo" value={archiviato ? "true" : "false"} />
        <button disabled={modificato} className="text-sm text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50">
          {archiviato ? "Ripristina" : "Archivia"}
        </button>
      </form>
    </div>
  );
}
