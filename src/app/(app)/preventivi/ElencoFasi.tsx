"use client";
// Parti del modulo comuni a preventivi e modelli: elenco delle fasi, una fase con ore e materiali,
// la riga dei dati di una lastra, le voci del riepilogo.
import { Fragment, useMemo, type ReactNode } from "react";
import { euro } from "@/lib/validazioni";
import { campo, etichetta, riquadro } from "../anagrafiche/stile";
import { calcolaMateriale, centesimiOre, inEuro, intero, perCampo, type CalcoloMateriale } from "./calcoli";
import { ore as scriviOre } from "./comuni";
import { etichettaArticolo, etichetteUniche, faseVuota, materialeVuoto, nuovaChiave } from "./bozze";
import type { ArticoloScelto, BozzaFase, BozzaMateriale, BozzaOre, Formato, TariffaScelta } from "./tipi";

// ---------------------------------------------------------------------
// Elenco delle fasi con "+ Aggiungi fase" (stato tenuto dal modulo che lo usa)
// ---------------------------------------------------------------------
type PropsElenco = {
  fasi: BozzaFase[];
  setFasi: (cambia: (fasi: BozzaFase[]) => BozzaFase[]) => void;
  costi: number[]; // costo di ogni fase in centesimi
  tariffe: TariffaScelta[];
  articoli: ArticoloScelto[];
  solaLettura: boolean;
  chiedi: (domanda: string, conferma?: string) => Promise<boolean>;
  vuoto: string; // testo quando non ci sono fasi
  nonBastano?: Set<string>; // id degli articoli che in magazzino non bastano (solo nei preventivi)
};

export function ElencoFasi({ fasi, setFasi, costi, tariffe, articoli, solaLettura, chiedi, vuoto, nonBastano }: PropsElenco) {
  const mappaArticoli = useMemo(() => etichetteUniche(articoli, etichettaArticolo), [articoli]);

  const cambiaFase = (chiave: string, cambia: (f: BozzaFase) => BozzaFase) =>
    setFasi((elenco) => elenco.map((f) => (f.chiave === chiave ? cambia(f) : f)));
  const spostaFase = (indice: number, verso: -1 | 1) =>
    setFasi((elenco) => {
      const nuovo = [...elenco];
      const [fase] = nuovo.splice(indice, 1);
      nuovo.splice(indice + verso, 0, fase);
      return nuovo;
    });
  const togliFase = async (f: BozzaFase, numero: number) => {
    const righe = f.ore.length + f.materiali.length;
    if (righe && !(await chiedi(`Togliere la fase ${numero} «${f.titolo || "senza titolo"}» con le sue ${righe} righe?`, "Togli la fase"))) return;
    setFasi((elenco) => elenco.filter((x) => x.chiave !== f.chiave));
  };

  return (
    <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-4">
      {fasi.length === 0 && <p className={`${riquadro} p-4 text-sm text-slate-500`}>{vuoto}</p>}
      {fasi.map((f, i) => (
        <Fase
          key={f.chiave}
          fase={f}
          numero={i + 1}
          totale={fasi.length}
          costo={costi[i] ?? 0}
          tariffe={tariffe}
          mappaArticoli={mappaArticoli}
          cambia={(cambia) => cambiaFase(f.chiave, cambia)}
          sposta={(verso) => spostaFase(i, verso)}
          togli={() => togliFase(f, i + 1)}
          solaLettura={solaLettura}
          nonBastano={nonBastano}
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
  );
}

export const aggiungi =
  "min-h-11 rounded-lg border border-dashed border-slate-400 bg-white px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50";
const cella = "px-2 py-1.5 align-middle";
const intestazione = "px-2 py-2 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase";
const iconaTogli = "inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-700";

export function Voce({ testo, valore }: { testo: string; valore: ReactNode }) {
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
  nonBastano?: Set<string>;
};

function Fase({ fase, numero, totale, costo, tariffe, mappaArticoli, cambia, sposta, togli, solaLettura, nonBastano }: PropsFase) {
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
          ...materialeVuoto,
        },
      ],
    }));
  }

  /** Materiale scritto o scelto dai suggerimenti: se è del catalogo, riempie unità, costo, bobina o lastra. */
  function scegliMateriale(r: BozzaMateriale, testo: string) {
    const a = mappaArticoli.get(testo);
    if (!a) {
      cambiaMateriale(r.chiave, { descrizione: testo, articolo_id: null });
      return;
    }
    const bobina = a.larghezza_bobina_m !== null;
    const lastra = a.lastra_larghezza_cm !== null;
    cambiaMateriale(r.chiave, {
      articolo_id: a.id,
      descrizione: a.descrizione,
      unita_misura: bobina ? "m2" : a.unita_misura,
      costo_unitario: perCampo(a.costo_unitario, 2, 4),
      formato: lastra ? "lastra" : bobina ? "bobina" : "normale",
      larghezza_m: bobina ? perCampo(a.larghezza_bobina_m, 0, 3) : r.larghezza_m,
      ...(lastra && {
        lastra_larghezza_cm: perCampo(a.lastra_larghezza_cm, 0, 1),
        lastra_altezza_cm: perCampo(a.lastra_altezza_cm, 0, 1),
        costo_lastra: perCampo(a.costo_unitario, 2, 4),
      }),
    });
  }

  /** Cambio di calcolo (quantità, bobina, lastra): la lastra parte dal prezzo già scritto. */
  function cambiaFormato(r: BozzaMateriale, formato: Formato) {
    // Tornando a "Quantità" da bobina o lastra si tengono quantità, unità e costo appena calcolati
    // (es. 7,7 m2 × 7,6769): così il costo della riga non cambia e i numeri restano coerenti.
    if (formato === "normale" && r.formato !== "normale") {
      const c = calcolaMateriale(r);
      cambiaMateriale(r.chiave, {
        formato,
        unita_misura: c.unita || "pz",
        quantita: c.quantita === null ? r.quantita : perCampo(c.quantita, 0, 3),
        costo_unitario: c.costoUnitario === null ? r.costo_unitario : perCampo(c.costoUnitario, 2, 4),
      });
      return;
    }
    cambiaMateriale(r.chiave, {
      formato,
      unita_misura: formato === "bobina" ? "m2" : r.unita_misura,
      costo_lastra: formato === "lastra" && !r.costo_lastra ? r.costo_unitario : r.costo_lastra,
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
          {/* larghezze contenute: la tabella deve stare nella colonna delle fasi (≈ 650 px) senza scorrere */}
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className={intestazione}>Materiale</th>
                <th className={`${intestazione} w-36`}>Quantità</th>
                <th className={`${intestazione} w-16`}>Unità</th>
                <th className={`${intestazione} w-24 text-right`}>€ / unità</th>
                <th className={`${intestazione} w-24 text-right`}>Costo</th>
                <th className="w-10"><span className="sr-only">Togli</span></th>
              </tr>
            </thead>
            <tbody>
              {fase.materiali.map((r, j) => {
                const calcolo = calcolaMateriale(r);
                const lastra = r.formato === "lastra";
                const piccolo = `${campo} text-right`;
                return (
                  <Fragment key={r.chiave}>
                    <tr className={`align-top ${lastra ? "" : "border-b border-slate-100"}`}>
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
                        <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {r.articolo_id ? "Dal catalogo" : "Non a catalogo"}
                          {r.articolo_id && nonBastano?.has(r.articolo_id) && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-900" title="Vedi «Materiali in magazzino» nel riepilogo">
                              ⚠ in magazzino non basta
                            </span>
                          )}
                          <label className="inline-flex items-center gap-1.5">
                            Calcolo
                            <select
                              value={r.formato}
                              onChange={(e) => cambiaFormato(r, e.target.value as Formato)}
                              className="rounded border border-slate-300 bg-white px-1.5 py-1 text-xs text-slate-800"
                            >
                              <option value="normale">Quantità</option>
                              <option value="bobina">Bobina (larghezza × metri)</option>
                              <option value="lastra">Lastra (pezzi su lastra)</option>
                            </select>
                          </label>
                        </span>
                      </td>
                      <td className={cella}>
                        {r.formato === "bobina" ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              <input
                                aria-label={`Larghezza bobina in metri, riga ${j + 1}`}
                                inputMode="decimal"
                                value={r.larghezza_m}
                                onChange={(e) => cambiaMateriale(r.chiave, { larghezza_m: e.target.value })}
                                placeholder="larg."
                                className={piccolo}
                              />
                              <span className="text-slate-500">×</span>
                              <input
                                aria-label={`Metri lineari, riga ${j + 1}`}
                                inputMode="decimal"
                                value={r.metri_lineari}
                                onChange={(e) => cambiaMateriale(r.chiave, { metri_lineari: e.target.value })}
                                placeholder="ml"
                                className={piccolo}
                              />
                            </div>
                            <span className="text-right text-xs text-slate-500">
                              = {calcolo.quantita === null ? "—" : perCampo(calcolo.quantita, 2, 3)} m²
                            </span>
                          </div>
                        ) : lastra ? (
                          <span className="block pt-2 text-right font-medium tabular-nums">
                            {calcolo.quantita === null ? "—" : perCampo(calcolo.quantita, 0, 3)}
                          </span>
                        ) : (
                          <input
                            aria-label={`Quantità, riga ${j + 1}`}
                            inputMode="decimal"
                            value={r.quantita}
                            onChange={(e) => cambiaMateriale(r.chiave, { quantita: e.target.value })}
                            className={piccolo}
                          />
                        )}
                      </td>
                      <td className={cella}>
                        {r.formato === "normale" ? (
                          <input
                            aria-label={`Unità di misura, riga ${j + 1}`}
                            value={r.unita_misura}
                            onChange={(e) => cambiaMateriale(r.chiave, { unita_misura: e.target.value })}
                            className={campo}
                          />
                        ) : (
                          <span className="block pt-2 text-slate-600">{calcolo.unita}</span>
                        )}
                      </td>
                      <td className={cella}>
                        {lastra ? (
                          <span className="block pt-2 text-right tabular-nums text-slate-600">
                            {calcolo.costoUnitario === null ? "—" : perCampo(calcolo.costoUnitario, 2, 4)}
                          </span>
                        ) : (
                          <input
                            aria-label={`Euro per unità, riga ${j + 1}`}
                            inputMode="decimal"
                            value={r.costo_unitario}
                            onChange={(e) => cambiaMateriale(r.chiave, { costo_unitario: e.target.value })}
                            placeholder={r.articolo_id ? "dal catalogo" : ""}
                            className={piccolo}
                          />
                        )}
                      </td>
                      <td className={`${cella} pt-3.5 text-right whitespace-nowrap tabular-nums`}>
                        {euro(inEuro(calcolo.centesimi))}
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
                    {lastra && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={6} className="px-2 pb-3">
                          <RigaLastra r={r} numero={j + 1} calcolo={calcolo} cambia={(campi) => cambiaMateriale(r.chiave, campi)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
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
// Dati di una lastra: misure, pezzi, margine di taglio e come addebitarla
// ---------------------------------------------------------------------
type PropsLastra = {
  r: BozzaMateriale;
  numero: number;
  calcolo: CalcoloMateriale;
  cambia: (campi: Partial<BozzaMateriale>) => void;
};

// come "campo", ma senza larghezza piena: qui ogni campo ha la sua larghezza (w-16, w-20…)
const campoStretto = campo.replace("w-full ", "");

function RigaLastra({ r, numero, calcolo, cambia }: PropsLastra) {
  const testo = (nome: keyof BozzaMateriale, etichettaCampo: string, larghezza = "w-20", unita?: string, nomeCampo = etichettaCampo) => (
    <label className="flex flex-col gap-1 text-xs text-slate-500">
      {etichettaCampo}
      <span className="flex items-center gap-1">
        <input
          aria-label={`${nomeCampo}, materiale ${numero}`}
          inputMode="decimal"
          value={r[nome] as string}
          onChange={(e) => cambia({ [nome]: e.target.value })}
          className={`${campoStretto} ${larghezza} text-right`}
        />
        {unita && <span>{unita}</span>}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-slate-50 p-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <fieldset className="flex items-end gap-1">
          <legend className="sr-only">Lastra</legend>
          {testo("lastra_larghezza_cm", "Lastra (cm)", "w-20", undefined, "Larghezza lastra in cm")}
          <span className="pb-2 text-slate-500">×</span>
          {testo("lastra_altezza_cm", "\u00a0", "w-20", undefined, "Altezza lastra in cm")}
        </fieldset>
        {testo("costo_lastra", "Prezzo lastra", "w-24", "€")}
        <fieldset className="flex items-end gap-1">
          <legend className="sr-only">Pezzo</legend>
          {testo("pezzo_larghezza_cm", "Pezzo (cm)", "w-20", undefined, "Larghezza pezzo in cm")}
          <span className="pb-2 text-slate-500">×</span>
          {testo("pezzo_altezza_cm", "\u00a0", "w-20", undefined, "Altezza pezzo in cm")}
        </fieldset>
        {testo("pezzi", "Pezzi", "w-16")}
        {testo("margine_taglio_cm", "Margine taglio", "w-16", "cm")}
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Addebito
          <select
            aria-label={`Addebito della lastra, materiale ${numero}`}
            value={r.addebito_lastra}
            onChange={(e) => cambia({ addebito_lastra: e.target.value as BozzaMateriale["addebito_lastra"] })}
            className={`${campoStretto} w-auto`}
          >
            <option value="lastre_intere">Lastre intere</option>
            <option value="m2_usati">Solo m² usati + scarto</option>
          </select>
        </label>
        {r.addebito_lastra === "m2_usati" && testo("scarto_percentuale", "Scarto", "w-16", "%")}
      </div>
      {calcolo.avviso ? (
        <p role="alert" className="text-xs font-semibold text-red-700">{calcolo.avviso}</p>
      ) : (
        calcolo.spiegazione && <p className="text-xs text-slate-600">{calcolo.spiegazione}</p>
      )}
    </div>
  );
}
