"use client";
// Pagina di un ordine d'acquisto: fornitore, date, note e righe di articoli del catalogo.
// Quantità e prezzi sono nell'unità di MAGAZZINO (lastre, bobine, pz…).
// Sola lettura per la contabilità e per gli ordini arrivati (anche in parte), annullati o archiviati.
import { useActionState, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { euro, leggiNumero, numeroPerCampo } from "@/lib/validazioni";
import {
  STATI_ORDINE,
  costoUnitaMagazzino,
  importoRiga,
  ordineModificabile,
  quantita as formatoQuantita,
  quantitaConUnita,
  unita as unitaPlurale,
  unitaMagazzino,
  type StatoOrdine,
} from "@/lib/magazzino";
import { campo, etichetta, pulsante, pulsanteSecondario, riquadro } from "../anagrafiche/stile";
import { useConferma } from "../preventivi/Conferma";
import { archiviaOrdine, cambiaStatoOrdine, salvaOrdine, type DatiOrdine, type EsitoOrdine } from "./azioniOrdini";
import { EtichettaStatoOrdine, indirizzo } from "./comuni";

export type OrdineSalvato = {
  id: string;
  numero: string;
  soggetto_id: string;
  data: string;
  consegna_prevista: string | null;
  stato: StatoOrdine;
  riferimento_fornitore: string | null;
  note_fornitore: string | null;
  note: string | null;
  attivo: boolean;
  aggiornato_il: string;
};

export type RigaSalvata = {
  id: string;
  articolo_id: string;
  descrizione: string;
  unita_misura: string;
  quantita: number;
  costo_unitario: number;
  arrivato: number;
};

export type Fornitore = { id: string; denominazione: string; nome_breve: string | null; attivo: boolean };

export type ArticoloScelta = {
  id: string;
  codice: string | null;
  descrizione: string;
  unita_misura: string;
  costo_unitario: number;
  larghezza_bobina_m: number | null;
  bobina_lunghezza_m: number | null;
  lastra_larghezza_cm: number | null;
  fornitore_id: string | null;
  scorta_minima: number | null;
  attivo: boolean;
  giacenza: number;
  sotto_scorta: boolean;
};

type Props = {
  ordine: OrdineSalvato | null; // null = nuovo
  righe: RigaSalvata[];
  fornitori: Fornitore[];
  articoli: ArticoloScelta[];
  daArticolo?: ArticoloScelta; // «Ordina» dalla scheda di un articolo
  oggi: string;
  modificabile: boolean;
  ok?: string;
  errore?: string;
};

type BozzaRiga = DatiOrdine["righe"][number] & { chiave: string; arrivato: number };

let contatore = 0;
const nuovaChiave = () => `r${++contatore}`;

/** Riga nuova per un articolo: prezzo proposto dal catalogo; quantità = quanto manca alla scorta minima. */
function rigaPer(a: ArticoloScelta | undefined): BozzaRiga {
  const costo = a ? costoUnitaMagazzino(a) : null;
  const manca = a && a.scorta_minima != null ? Math.max(Number(a.scorta_minima) - a.giacenza, 0) : 0;
  return {
    chiave: nuovaChiave(),
    id: null,
    articolo_id: a?.id ?? "",
    descrizione: a?.descrizione ?? "",
    quantita: manca > 0 ? String(Math.ceil(manca)) : "",
    costo_unitario: costo === null ? "" : numeroPerCampo(costo),
    arrivato: 0,
  };
}

export default function ModuloOrdine(props: Props) {
  const { ordine, articoli, fornitori, oggi, modificabile } = props;
  const stato = ordine?.stato ?? "bozza";
  const archiviato = ordine ? !ordine.attivo : false;
  const solaLettura = !modificabile || !ordineModificabile(stato) || archiviato;
  const { chiedi, finestra } = useConferma();

  const iniziale = useMemo(() => {
    const testata: DatiOrdine["testata"] = {
      soggetto_id: ordine?.soggetto_id ?? props.daArticolo?.fornitore_id ?? "",
      data: ordine?.data ?? oggi,
      consegna_prevista: ordine?.consegna_prevista ?? "",
      riferimento_fornitore: ordine?.riferimento_fornitore ?? "",
      note_fornitore: ordine?.note_fornitore ?? "",
      note: ordine?.note ?? "",
    };
    const righe: BozzaRiga[] = ordine
      ? props.righe.map((r) => ({
          chiave: nuovaChiave(),
          id: r.id,
          articolo_id: r.articolo_id,
          descrizione: r.descrizione,
          quantita: formatoQuantita(r.quantita).replace(/\./g, ""),
          costo_unitario: numeroPerCampo(r.costo_unitario),
          arrivato: r.arrivato,
        }))
      : [rigaPer(props.daArticolo)];
    return { testata, righe };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [testata, setTestata] = useState(iniziale.testata);
  const [righe, setRighe] = useState<BozzaRiga[]>(iniziale.righe);
  const [esito, azione, inCorso] = useActionState<EsitoOrdine, FormData>(salvaOrdine, {});
  const [, avviaInvio] = useTransition();

  const perId = useMemo(() => new Map(articoli.map((a) => [a.id, a])), [articoli]);
  const modificato = JSON.stringify({ testata, righe }) !== JSON.stringify(iniziale);
  const conArrivi = stato !== "bozza";

  const cambiaTestata = (campo: keyof DatiOrdine["testata"], valore: string) => setTestata((t) => ({ ...t, [campo]: valore }));
  const cambiaRiga = (chiave: string, modifica: Partial<BozzaRiga>) =>
    setRighe((rr) => rr.map((r) => (r.chiave === chiave ? { ...r, ...modifica } : r)));

  function scegliArticolo(chiave: string, articoloId: string) {
    const a = perId.get(articoloId);
    const nuova = rigaPer(a);
    setRighe((rr) =>
      rr.map((r) =>
        r.chiave === chiave
          ? { ...r, articolo_id: articoloId, descrizione: nuova.descrizione, costo_unitario: nuova.costo_unitario, quantita: r.quantita || nuova.quantita }
          : r
      )
    );
  }

  // articoli nella tendina: prima quelli del fornitore scelto, poi gli altri
  const delFornitore = articoli.filter((a) => a.fornitore_id && a.fornitore_id === testata.soggetto_id);
  const altri = articoli.filter((a) => !(a.fornitore_id && a.fornitore_id === testata.soggetto_id));

  const totale = righe.reduce((s, r) => {
    const q = leggiNumero(r.quantita) ?? 0;
    const c = leggiNumero(r.costo_unitario) ?? 0;
    return s + importoRiga(q, c);
  }, 0);

  return (
    <div className="flex flex-col gap-5">
      {finestra}
      <header className="flex flex-wrap items-center gap-3">
        <div className="min-w-60 flex-1">
          <Link href={indirizzo({ scheda: "ordini" })} className="text-sm text-blue-700 hover:underline">
            ← Ordini d&apos;acquisto
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold">
            {ordine ? `Ordine d'acquisto n. ${ordine.numero}` : "Nuovo ordine d'acquisto"}
            {ordine && <EtichettaStatoOrdine stato={stato} />}
            {archiviato && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Archiviato</span>}
          </h1>
        </div>
        {ordine && (
          <Link
            href={`/stampa/ordini/${ordine.id}`}
            target="_blank"
            className={`${pulsanteSecondario} ${modificato ? "pointer-events-none opacity-50" : ""}`}
            aria-disabled={modificato}
            title={modificato ? "Salva prima le modifiche" : "Apre l'ordine da stampare o salvare in PDF"}
          >
            Stampa / PDF
          </Link>
        )}
      </header>

      {props.ok && <p role="status" className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{props.ok}</p>}
      {(props.errore || esito.errore) && (
        <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{esito.errore ?? props.errore}</p>
      )}
      {ordine && solaLettura && modificabile && (
        <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {archiviato
            ? "Questo ordine è archiviato: si può solo ripristinare."
            : stato === "annullato"
              ? "Questo ordine è annullato: non si modifica più."
              : "La merce di questo ordine è già arrivata (anche solo in parte): le righe non si modificano più. Se manca qualcosa, fai un nuovo ordine."}
        </p>
      )}
      {!modificabile && <p className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">Sola lettura per il tuo ruolo.</p>}

      {ordine && modificabile && (
        <BarraStato id={ordine.id} stato={stato} archiviato={archiviato} modificato={modificato} chiedi={chiedi} />
      )}

      {/* Invio "a mano" (onSubmit) invece di action={…}: con action, dopo un errore React
          reimposta il modulo e le tendine tornerebbero su «— scegli —». */}
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          const dati = new FormData(e.currentTarget);
          avviaInvio(() => azione(dati));
        }}
      >
        <input type="hidden" name="dati" value={JSON.stringify({ id: ordine?.id ?? null, testata, righe })} />

        <fieldset disabled={solaLettura || inCorso} className={`${riquadro} grid grid-cols-1 gap-3 p-5 sm:grid-cols-4`}>
          <legend className="sr-only">Dati dell&apos;ordine</legend>
          <label className={`${etichetta} sm:col-span-2`}>
            Fornitore *
            <select value={testata.soggetto_id} onChange={(e) => cambiaTestata("soggetto_id", e.target.value)} className={campo}>
              <option value="">— scegli il fornitore —</option>
              {fornitori.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.denominazione}
                  {f.nome_breve ? ` (${f.nome_breve})` : ""}
                  {f.attivo ? "" : " (archiviato)"}
                </option>
              ))}
            </select>
          </label>
          <label className={etichetta}>
            Data
            <input type="date" value={testata.data} onChange={(e) => cambiaTestata("data", e.target.value)} className={campo} />
          </label>
          <label className={etichetta}>
            Consegna prevista
            <input
              type="date"
              value={testata.consegna_prevista}
              min={testata.data}
              onChange={(e) => cambiaTestata("consegna_prevista", e.target.value)}
              className={campo}
            />
          </label>
          <label className={`${etichetta} sm:col-span-2`}>
            Riferimento del fornitore
            <input
              value={testata.riferimento_fornitore}
              onChange={(e) => cambiaTestata("riferimento_fornitore", e.target.value)}
              placeholder="es. vostra offerta n. 123 del 20/11"
              className={campo}
            />
          </label>
          <label className={`${etichetta} sm:col-span-2`}>
            Note interne
            <input
              value={testata.note}
              onChange={(e) => cambiaTestata("note", e.target.value)}
              placeholder="non vanno nel PDF"
              className={campo}
            />
          </label>
          <label className={`${etichetta} sm:col-span-4`}>
            Note per il fornitore
            <textarea
              value={testata.note_fornitore}
              onChange={(e) => cambiaTestata("note_fornitore", e.target.value)}
              rows={2}
              placeholder="stampate nell'ordine, es. orari di consegna, imballo"
              className={campo}
            />
          </label>
        </fieldset>

        <section aria-label="Articoli ordinati" className={`${riquadro} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <th className="px-4 py-3">Articolo</th>
                <th className="w-28 px-2 py-3 text-right">Quantità</th>
                <th className="w-36 px-2 py-3 text-right">Prezzo unitario</th>
                <th className="w-28 px-2 py-3 text-right">Importo</th>
                {conArrivi && <th className="w-28 px-2 py-3 text-right">Arrivato</th>}
                {!solaLettura && <th className="w-10 px-2 py-3"><span className="sr-only">Togli</span></th>}
              </tr>
            </thead>
            <tbody>
              {righe.map((r, i) => {
                const a = perId.get(r.articolo_id);
                const u = a ? unitaMagazzino(a) : "";
                const q = leggiNumero(r.quantita) ?? 0;
                const c = leggiNumero(r.costo_unitario) ?? 0;
                const bobinaSenzaLunghezza = a && a.larghezza_bobina_m != null && a.bobina_lunghezza_m == null;
                return (
                  <tr key={r.chiave} className="border-b border-slate-100 align-top">
                    <td className="px-4 py-2">
                      <select
                        value={r.articolo_id}
                        disabled={solaLettura || inCorso}
                        onChange={(e) => scegliArticolo(r.chiave, e.target.value)}
                        aria-label={`Articolo della riga ${i + 1}`}
                        className={`${campo} min-w-56`}
                      >
                        <option value="">— scegli l&apos;articolo —</option>
                        {delFornitore.length > 0 && (
                          <optgroup label="Di questo fornitore">
                            {delFornitore.map((x) => <OpzioneArticolo key={x.id} a={x} />)}
                          </optgroup>
                        )}
                        <optgroup label={delFornitore.length > 0 ? "Altri articoli" : "Articoli"}>
                          {altri.map((x) => <OpzioneArticolo key={x.id} a={x} />)}
                        </optgroup>
                      </select>
                      {a && (
                        <p className="mt-1 text-xs text-slate-500">
                          In magazzino:{" "}
                          <span className={a.giacenza < 0 ? "font-semibold text-red-700" : a.sotto_scorta ? "font-semibold text-amber-800" : ""}>
                            {quantitaConUnita(a.giacenza, u)}
                          </span>
                          {a.scorta_minima != null && ` · scorta minima ${formatoQuantita(a.scorta_minima)}`}
                        </p>
                      )}
                      {bobinaSenzaLunghezza && !solaLettura && !r.costo_unitario && (
                        <p className="mt-1 text-xs text-amber-800">
                          Manca la lunghezza della bobina nella scheda dell&apos;articolo: scrivi tu il prezzo di una bobina.
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={r.quantita}
                          disabled={solaLettura || inCorso}
                          onChange={(e) => cambiaRiga(r.chiave, { quantita: e.target.value })}
                          inputMode="decimal"
                          aria-label={`Quantità della riga ${i + 1}`}
                          className={`${campo} text-right`}
                        />
                      </div>
                      {u && <p className="mt-1 text-right text-xs text-slate-500">{unitaPlurale(u, q || 2)}</p>}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={r.costo_unitario}
                        disabled={solaLettura || inCorso}
                        onChange={(e) => cambiaRiga(r.chiave, { costo_unitario: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Prezzo unitario della riga ${i + 1}`}
                        placeholder={bobinaSenzaLunghezza ? "€ a bobina" : ""}
                        className={`${campo} text-right`}
                      />
                      {u && <p className="mt-1 text-right text-xs text-slate-500">€ / {unitaPlurale(u, 1)}</p>}
                    </td>
                    <td className="px-2 py-2 pt-4 text-right whitespace-nowrap tabular-nums">{euro(importoRiga(q, c))}</td>
                    {conArrivi && (
                      <td className={`px-2 py-2 pt-4 text-right whitespace-nowrap ${r.arrivato >= q ? "text-green-700" : "text-slate-600"}`}>
                        {formatoQuantita(r.arrivato)} / {formatoQuantita(q)}
                      </td>
                    )}
                    {!solaLettura && (
                      <td className="px-2 py-2 pt-3">
                        <button
                          type="button"
                          disabled={inCorso}
                          onClick={() => setRighe((rr) => rr.filter((x) => x.chiave !== r.chiave))}
                          aria-label={`Togli la riga ${i + 1}`}
                          className="rounded-md px-2 py-1 text-lg leading-none text-slate-400 hover:bg-red-50 hover:text-red-700"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="px-4 py-3">
                  {!solaLettura && (
                    <button
                      type="button"
                      disabled={inCorso}
                      onClick={() => setRighe((rr) => [...rr, rigaPer(undefined)])}
                      className="text-sm font-semibold text-blue-700 hover:underline"
                    >
                      + Aggiungi articolo
                    </button>
                  )}
                </td>
                <td colSpan={2} className="px-2 py-3 text-right font-semibold text-slate-600">Imponibile (IVA esclusa)</td>
                <td className="px-2 py-3 text-right text-base font-bold whitespace-nowrap tabular-nums">{euro(totale)}</td>
                {conArrivi && <td />}
                {!solaLettura && <td />}
              </tr>
            </tfoot>
          </table>
        </section>

        {!solaLettura && (
          <div className="flex flex-wrap items-center gap-3">
            <button className={pulsante} disabled={inCorso || (Boolean(ordine) && !modificato)}>
              {inCorso ? "Salvataggio…" : ordine ? "Salva modifiche" : "Crea l'ordine"}
            </button>
            {modificato && ordine && <span className="text-sm text-amber-800">Ci sono modifiche non salvate.</span>}
          </div>
        )}
      </form>
    </div>
  );
}

function OpzioneArticolo({ a }: { a: ArticoloScelta }) {
  return (
    <option value={a.id}>
      {a.descrizione}
      {a.codice ? ` · ${a.codice}` : ""}
      {a.attivo ? "" : " (archiviato)"}
    </option>
  );
}

// ---------------------------------------------------------------------
// Stato e archiviazione (titolare e ufficio). Moduli a parte: non toccano la bozza.
// ---------------------------------------------------------------------
type PropsBarra = {
  id: string;
  stato: StatoOrdine;
  archiviato: boolean;
  modificato: boolean;
  chiedi: (domanda: string, conferma?: string) => Promise<boolean>;
};

function BarraStato({ id, stato, archiviato, modificato, chiedi }: PropsBarra) {
  const [inCorso, avvia] = useTransition();
  const fermo = modificato || archiviato || inCorso;

  const dati = (campi: Record<string, string>) => {
    const d = new FormData();
    for (const [k, v] of Object.entries(campi)) d.set(k, v);
    return d;
  };

  // i passaggi che si fanno a mano (ricevuto_parziale e ricevuto li mette il database con gli arrivi)
  const azioni: { stato: StatoOrdine; etichetta: string; domanda?: string }[] = [];
  if (stato === "bozza") azioni.push({ stato: "inviato", etichetta: "Segna come inviato" });
  if (stato === "inviato") azioni.push({ stato: "bozza", etichetta: "Riporta a bozza" });
  if (stato === "ricevuto_parziale")
    azioni.push({
      stato: "ricevuto",
      etichetta: "Chiudi: il resto non arriverà",
      domanda: "Chiudere l'ordine? Quello che manca non risulterà più «in arrivo».",
    });
  if (stato === "bozza" || stato === "inviato" || stato === "ricevuto_parziale")
    azioni.push({
      stato: "annullato",
      etichetta: "Annulla l'ordine",
      domanda: "Annullare l'ordine? Non si potrà più modificare né registrare arrivi (quanto già arrivato resta in magazzino).",
    });

  async function scegli(a: (typeof azioni)[number]) {
    if (a.domanda && !(await chiedi(a.domanda, `Sì, ${a.etichetta.toLowerCase()}`))) return;
    avvia(() => cambiaStatoOrdine(dati({ id, stato: a.stato })));
  }

  async function archivia() {
    if (!archiviato && !(await chiedi("Archiviare l'ordine? Non comparirà più nell'elenco (si può ripristinare).", "Archivia"))) return;
    avvia(() => archiviaOrdine(dati({ id, attivo: archiviato ? "true" : "false" })));
  }

  const etichetta = STATI_ORDINE.find((s) => s.valore === stato)?.etichetta ?? stato;

  return (
    <div className={`${riquadro} flex flex-wrap items-center gap-2 px-4 py-3 text-sm`}>
      <span className="font-semibold text-slate-600">Stato:</span>
      <span className="rounded-full border border-slate-900 bg-slate-900 px-3.5 py-1.5 font-semibold text-white">{etichetta}</span>
      {azioni.map((a) => (
        <button
          key={a.stato}
          type="button"
          disabled={fermo}
          onClick={() => scegli(a)}
          className={`min-h-9 rounded-full border px-3.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
            a.stato === "annullato"
              ? "border-red-200 bg-white text-red-700 hover:bg-red-50"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {a.etichetta}
        </button>
      ))}
      {modificato && <span className="text-xs text-amber-800">Salva prima le modifiche</span>}
      {inCorso && <span className="text-xs text-slate-500">Un momento…</span>}
      <button
        type="button"
        disabled={modificato || inCorso}
        onClick={archivia}
        className="ml-auto min-h-9 text-sm text-slate-600 hover:text-slate-900 hover:underline disabled:opacity-50"
      >
        {archiviato ? "Ripristina" : "Archivia"}
      </button>
    </div>
  );
}
